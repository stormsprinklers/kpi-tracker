import { initSchema } from "@/lib/db";
import {
  getMarketingChannels,
  getMarketingSourceRules,
  getJobsWithHcpIdForOrg,
  upsertJobAttribution,
  getMarketingSpendSnapshots,
  sumGbpMetricsForOrgInRange,
  sumSearchConsoleForOrgInRange,
  getMarketingOrgSettings,
  deleteMartMarketingDailyForRange,
  upsertMartMarketingDailyRow,
  countGoogleBusinessReviewsForOrg,
  getMarketingSyncState,
  getMarketingOAuthRefreshToken,
  type SpendSnapshotRow,
} from "@/lib/db/marketingQueries";
import { getOrganizationById, getGoogleBusinessProfile } from "@/lib/db/queries";
import { attributeJobFromRaw } from "@/lib/marketing/attribution";
import {
  getMarketingJobPaidAmount,
  isBookedJob,
} from "@/lib/marketing/jobPaidAmount";
import type {
  MarketingOverviewChannelRow,
  MarketingOverviewResponse,
  MarketingAiContext,
} from "@/lib/marketing/types";

function parseYmd(d: string): { y: number; m: number; day: number } {
  const [y, m, day] = d.split("-").map((x) => Number(x));
  return { y, m, day: day || 1 };
}

function ymdToUtcNoon(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function daysBetweenInclusive(start: string, end: string): number {
  const a = parseYmd(start);
  const b = parseYmd(end);
  const t0 = ymdToUtcNoon(a.y, a.m, a.day).getTime();
  const t1 = ymdToUtcNoon(b.y, b.m, b.day).getTime();
  return Math.max(0, Math.round((t1 - t0) / (24 * 60 * 60 * 1000)) + 1);
}

function enumerateDates(start: string, end: string): string[] {
  const out: string[] = [];
  let { y, m, day } = parseYmd(start);
  const endD = parseYmd(end);
  const endTime = ymdToUtcNoon(endD.y, endD.m, endD.day).getTime();
  let cur = ymdToUtcNoon(y, m, day).getTime();
  while (cur <= endTime) {
    const d = new Date(cur);
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
    );
    cur += 24 * 60 * 60 * 1000;
  }
  return out;
}

function maxYmd(a: string, b: string): string {
  return a >= b ? a : b;
}

function minYmd(a: string, b: string): string {
  return a <= b ? a : b;
}

function getJobDateYmd(job: Record<string, unknown>): string | null {
  const wt = job.work_timestamps as Record<string, unknown> | undefined;
  const sched = job.schedule as Record<string, unknown> | undefined;
  const completed = wt?.completed_at ?? wt?.completed;
  const scheduled = sched?.scheduled_start ?? sched?.scheduledStart ?? job.scheduled_start;
  const dateStr = (completed ?? scheduled) as string | undefined;
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeJobFromRow(row: {
  hcp_id: string;
  raw: Record<string, unknown>;
  total_amount: unknown;
  outstanding_balance: unknown;
}): Record<string, unknown> {
  const job = { ...row.raw } as Record<string, unknown>;
  const toNum = (v: unknown): number | null =>
    typeof v === "number" && !Number.isNaN(v) ? v : typeof v === "string" ? parseFloat(v) || null : null;
  const rawTotal = toNum(row.raw?.total_amount) ?? toNum(row.raw?.subtotal);
  const rawOut =
    toNum(row.raw?.outstanding_balance) ?? toNum(row.raw?.balance_due) ?? toNum(row.raw?.amount_due);
  if (row.total_amount != null) {
    const colVal = typeof row.total_amount === "string" ? parseFloat(row.total_amount) : Number(row.total_amount);
    const isCents =
      (rawTotal != null && Math.abs(colVal - rawTotal) < 0.01) ||
      (Number.isInteger(colVal) && colVal > 3000);
    job.total_amount = isCents ? colVal / 100 : colVal;
  } else if (rawTotal != null) {
    job.total_amount = rawTotal / 100;
  } else if (typeof job.total_amount === "number" && job.total_amount > 3000) {
    job.total_amount = job.total_amount / 100;
  }
  if (row.outstanding_balance != null) {
    const colVal =
      typeof row.outstanding_balance === "string"
        ? parseFloat(row.outstanding_balance)
        : Number(row.outstanding_balance);
    const isCents =
      (rawOut != null && Math.abs(colVal - rawOut) < 0.01) ||
      (Number.isInteger(colVal) && colVal > 3000);
    job.outstanding_balance = isCents ? colVal / 100 : colVal;
  } else if (rawOut != null) {
    job.outstanding_balance = rawOut / 100;
  } else if (typeof job.outstanding_balance === "number" && job.outstanding_balance > 3000) {
    job.outstanding_balance = job.outstanding_balance / 100;
  } else {
    job.outstanding_balance = 0;
  }
  return job;
}

/** Prorate each snapshot onto calendar days overlapping [rangeStart, rangeEnd]. */
export function accumulateProratedSpendByDay(
  snapshots: SpendSnapshotRow[],
  rangeStart: string,
  rangeEnd: string
): Map<string, Map<string, { spend: number; leads: number }>> {
  const byDayChannel = new Map<string, Map<string, { spend: number; leads: number }>>();

  for (const snap of snapshots) {
    const ps = snap.period_start.slice(0, 10);
    const pe = snap.period_end.slice(0, 10);
    const overlapLo = maxYmd(ps, rangeStart);
    const overlapHi = minYmd(pe, rangeEnd);
    if (overlapLo > overlapHi) continue;

    const snapDays = daysBetweenInclusive(ps, pe);
    if (snapDays <= 0) continue;

    const totalSpend = Number(snap.spend_amount);
    const totalLeads = snap.platform_leads ?? 0;
    const spendPerDay = totalSpend / snapDays;
    const leadsPerDay = totalLeads / snapDays;

    for (const day of enumerateDates(overlapLo, overlapHi)) {
      let chMap = byDayChannel.get(day);
      if (!chMap) {
        chMap = new Map();
        byDayChannel.set(day, chMap);
      }
      const slug = snap.channel_slug;
      const cur = chMap.get(slug) ?? { spend: 0, leads: 0 };
      cur.spend += spendPerDay;
      cur.leads += leadsPerDay;
      chMap.set(slug, cur);
    }
  }

  return byDayChannel;
}

export async function rebuildJobAttributionsForOrganization(organizationId: string): Promise<void> {
  await initSchema();
  const rules = await getMarketingSourceRules(organizationId);
  const rows = await getJobsWithHcpIdForOrg(organizationId);
  for (const row of rows) {
    const job = normalizeJobFromRow(row);
    const attr = attributeJobFromRaw(job, rules);
    await upsertJobAttribution({
      organizationId,
      jobHcpId: row.hcp_id,
      channelSlug: attr.channelSlug,
      confidence: attr.confidence,
      ruleType: attr.ruleType,
      matchedValue: attr.matchedValue,
    });
  }
}

export async function refreshMartMarketingDailyForRange(
  organizationId: string,
  rangeStart: string,
  rangeEnd: string
): Promise<void> {
  await initSchema();
  const org = await getOrganizationById(organizationId);
  if (!org?.hcp_company_id?.trim()) return;

  const rows = await getJobsWithHcpIdForOrg(organizationId);
  const rules = await getMarketingSourceRules(organizationId);

  type Agg = {
    attributedJobCount: number;
    bookedJobCount: number;
    paidJobCount: number;
    attributedRevenue: number;
  };
  const byDayChannel = new Map<string, Map<string, Agg>>();

  const ensureAgg = (day: string, slug: string): Agg => {
    let dm = byDayChannel.get(day);
    if (!dm) {
      dm = new Map();
      byDayChannel.set(day, dm);
    }
    let a = dm.get(slug);
    if (!a) {
      a = { attributedJobCount: 0, bookedJobCount: 0, paidJobCount: 0, attributedRevenue: 0 };
      dm.set(slug, a);
    }
    return a;
  };

  for (const row of rows) {
    const job = normalizeJobFromRow(row);
    const day = getJobDateYmd(job);
    if (!day || day < rangeStart || day > rangeEnd) continue;
    const attr = attributeJobFromRaw(job, rules);
    const slug = attr.channelSlug;
    const a = ensureAgg(day, slug);
    a.attributedJobCount += 1;
    if (isBookedJob(job)) a.bookedJobCount += 1;
    const paid = getMarketingJobPaidAmount(job);
    if (paid > 0) {
      a.paidJobCount += 1;
      a.attributedRevenue += paid;
    }
  }

  const spendSnapshots = await getMarketingSpendSnapshots(organizationId, rangeStart, rangeEnd);
  const spendByDay = accumulateProratedSpendByDay(spendSnapshots, rangeStart, rangeEnd);

  const channels = await getMarketingChannels();
  const channelSlugs = new Set(channels.map((c) => c.slug));

  await deleteMartMarketingDailyForRange(organizationId, rangeStart, rangeEnd);

  for (const day of enumerateDates(rangeStart, rangeEnd)) {
    const spendMap = spendByDay.get(day) ?? new Map();
    for (const ch of channels) {
      const slug = ch.slug;
      if (!channelSlugs.has(slug)) continue;
      const jobPart = byDayChannel.get(day)?.get(slug);
      const sp = spendMap.get(slug) ?? { spend: 0, leads: 0 };
      await upsertMartMarketingDailyRow({
        organizationId,
        metricDate: day,
        channelSlug: slug,
        spendAmount: Math.round(sp.spend * 100) / 100,
        platformLeads: Math.round(sp.leads),
        attributedJobCount: jobPart?.attributedJobCount ?? 0,
        bookedJobCount: jobPart?.bookedJobCount ?? 0,
        paidJobCount: jobPart?.paidJobCount ?? 0,
        attributedRevenue: Math.round((jobPart?.attributedRevenue ?? 0) * 100) / 100,
      });
    }
  }
}

const METRIC_DEFINITIONS: Record<string, string> = {
  totalSpend:
    "Sum of platform-reported ad cost in the period (prorated by day when sync snapshots span multiple days). LSA via Local Services / Ads APIs when connected.",
  totalPlatformLeads:
    "Leads reported by paid ad platforms (e.g. LSA charged leads), prorated to match the selected date range.",
  totalJobsInPeriod:
    "Housecall Pro jobs whose primary work date (completed, else scheduled) falls in the selected range.",
  totalPaidRevenueInPeriod:
    "Sum of paid job amounts (from synced HCP job totals) for jobs dated in the range, all sources.",
  attributedPaidRevenue:
    "Paid revenue only for jobs assigned to a marketing channel by attribution rules (lead source, UTMs, text heuristics).",
  unassignedShare:
    "Share of jobs in the period still mapped to Unassigned after attribution rules.",
  costPerLead: "Spend divided by platform leads for that channel when both exist.",
  bookingRate: "Booked jobs (scheduled or in progress/completed) divided by attributed jobs in range for that channel.",
  conversionRate: "Paid jobs (revenue > 0) divided by attributed jobs for that channel.",
  roas: "Attributed paid revenue divided by spend for that channel (paid channels only).",
};

export async function buildMarketingOverviewResponse(
  organizationId: string,
  rangeStart: string,
  rangeEnd: string
): Promise<MarketingOverviewResponse> {
  await initSchema();
  await rebuildJobAttributionsForOrganization(organizationId);
  await refreshMartMarketingDailyForRange(organizationId, rangeStart, rangeEnd);

  const org = await getOrganizationById(organizationId);
  const companyId = org?.hcp_company_id?.trim() ?? "";
  const hcpConnected = !!org?.hcp_access_token;

  const rows = await getJobsWithHcpIdForOrg(organizationId);
  const rules = await getMarketingSourceRules(organizationId);

  type ChanAgg = {
    attributedJobs: number;
    bookedJobs: number;
    paidJobs: number;
    totalRevenue: number;
  };
  const aggByChannel = new Map<string, ChanAgg>();
  let totalJobsInPeriod = 0;
  let totalPaidRevenueAll = 0;
  let unassignedJobCount = 0;

  const ensure = (slug: string): ChanAgg => {
    let a = aggByChannel.get(slug);
    if (!a) {
      a = { attributedJobs: 0, bookedJobs: 0, paidJobs: 0, totalRevenue: 0 };
      aggByChannel.set(slug, a);
    }
    return a;
  };

  for (const row of rows) {
    const job = normalizeJobFromRow(row);
    const day = getJobDateYmd(job);
    if (!day || day < rangeStart || day > rangeEnd) continue;
    totalJobsInPeriod += 1;
    const paid = getMarketingJobPaidAmount(job);
    totalPaidRevenueAll += paid;

    const attr = attributeJobFromRaw(job, rules);
    const slug = attr.channelSlug;
    if (slug === "unassigned") unassignedJobCount += 1;
    const a = ensure(slug);
    a.attributedJobs += 1;
    if (isBookedJob(job)) a.bookedJobs += 1;
    if (paid > 0) {
      a.paidJobs += 1;
      a.totalRevenue += paid;
    }
  }

  const spendSnapshots = await getMarketingSpendSnapshots(organizationId, rangeStart, rangeEnd);
  const spendByDay = accumulateProratedSpendByDay(spendSnapshots, rangeStart, rangeEnd);
  let totalSpend = 0;
  let totalPlatformLeads = 0;
  const spendByChannel = new Map<string, { spend: number; leads: number }>();
  for (const [, chMap] of spendByDay) {
    for (const [slug, v] of chMap) {
      totalSpend += v.spend;
      totalPlatformLeads += v.leads;
      const cur = spendByChannel.get(slug) ?? { spend: 0, leads: 0 };
      cur.spend += v.spend;
      cur.leads += v.leads;
      spendByChannel.set(slug, cur);
    }
  }

  const attributedPaidRevenue = [...aggByChannel.entries()]
    .filter(([k]) => k !== "unassigned")
    .reduce((s, [, v]) => s + v.totalRevenue, 0);

  const unassignedShare =
    totalJobsInPeriod > 0 ? Math.round((unassignedJobCount / totalJobsInPeriod) * 10000) / 100 : 0;

  const channelsMeta = await getMarketingChannels();
  const gbpTotals = await sumGbpMetricsForOrgInRange(organizationId, rangeStart, rangeEnd);
  const scTotals = await sumSearchConsoleForOrgInRange(organizationId, rangeStart, rangeEnd);
  const reviewCount = await countGoogleBusinessReviewsForOrg(organizationId);
  const gbpProfile = await getGoogleBusinessProfile(organizationId);
  const gbpConnected = !!(gbpProfile?.location_id && gbpProfile?.google_account_connected);
  const mktSettings = await getMarketingOrgSettings(organizationId);

  const lsaState = await getMarketingSyncState(organizationId, "lsa");
  const gbpPerfState = await getMarketingSyncState(organizationId, "gbp_performance");
  const gscState = await getMarketingSyncState(organizationId, "search_console");

  const tableSlugs = channelsMeta
    .filter(
      (c) =>
        c.slug !== "unassigned" &&
        c.slug !== "website" &&
        c.slug !== "referrals"
    )
    .map((c) => c.slug);

  const lsaTok = await getMarketingOAuthRefreshToken(organizationId, "lsa");

  const channels: MarketingOverviewChannelRow[] = tableSlugs.map((slug) => {
    const meta = channelsMeta.find((c) => c.slug === slug)!;
    const jobA = aggByChannel.get(slug) ?? {
      attributedJobs: 0,
      bookedJobs: 0,
      paidJobs: 0,
      totalRevenue: 0,
    };
    const sp = spendByChannel.get(slug) ?? { spend: 0, leads: 0 };
    const spendApplicable = meta.spend_applicable;
    const spendRounded = Math.round(sp.spend * 100) / 100;
    const leadsRounded = Math.round(sp.leads * 100) / 100;

    const spend = spendApplicable ? (spendRounded > 0 || leadsRounded > 0 ? spendRounded : null) : null;
    const platformLeads = spendApplicable ? (leadsRounded > 0 ? leadsRounded : null) : null;
    const costPerLead =
      spend != null && platformLeads != null && platformLeads > 0 ? Math.round((spend / platformLeads) * 100) / 100 : null;
    const roas =
      spend != null && spend > 0 && jobA.totalRevenue > 0
        ? Math.round((jobA.totalRevenue / spend) * 100) / 100
        : null;

    const bookingRate =
      jobA.attributedJobs > 0
        ? Math.round((jobA.bookedJobs / jobA.attributedJobs) * 10000) / 100
        : null;
    const conversionRate =
      jobA.attributedJobs > 0
        ? Math.round((jobA.paidJobs / jobA.attributedJobs) * 10000) / 100
        : null;
    const avgRevenue =
      jobA.paidJobs > 0 ? Math.round((jobA.totalRevenue / jobA.paidJobs) * 100) / 100 : null;

    const substituteMetrics: MarketingOverviewChannelRow["substituteMetrics"] = {};
    if (slug === "google_business_profile") {
      substituteMetrics.gbpCallClicks = gbpTotals.call_clicks;
      substituteMetrics.gbpWebsiteClicks = gbpTotals.website_clicks;
      substituteMetrics.gbpDirectionRequests = gbpTotals.direction_requests;
      substituteMetrics.gbpImpressionsSum = gbpTotals.impressions_sum;
      substituteMetrics.reviewCount = reviewCount;
    }
    if (slug === "organic_search") {
      substituteMetrics.searchConsoleClicks = scTotals.clicks;
      substituteMetrics.searchConsoleImpressions = scTotals.impressions;
    }

    return {
      slug,
      label: meta.display_name,
      kind: meta.kind,
      spendApplicable,
      spend: spendApplicable ? spend : null,
      costPerLead: spendApplicable ? costPerLead : null,
      roas: spendApplicable ? roas : null,
      platformLeads: spendApplicable ? platformLeads : null,
      attributedJobs: jobA.attributedJobs,
      bookedJobs: jobA.bookedJobs,
      paidJobs: jobA.paidJobs,
      bookingRate,
      conversionRate,
      avgRevenue,
      totalRevenue: Math.round(jobA.totalRevenue * 100) / 100,
      substituteMetrics,
    };
  });

  return {
    startDate: rangeStart,
    endDate: rangeEnd,
    executive: {
      totalSpend: totalSpend > 0 ? Math.round(totalSpend * 100) / 100 : null,
      totalPlatformLeads: totalPlatformLeads > 0 ? Math.round(totalPlatformLeads * 100) / 100 : null,
      totalJobsInPeriod,
      totalPaidRevenueInPeriod: Math.round(totalPaidRevenueAll * 100) / 100,
      attributedPaidRevenue: Math.round(attributedPaidRevenue * 100) / 100,
      unassignedJobCount,
      unassignedShare,
    },
    channels,
    integrations: {
      hcpConnected,
      lsa: {
        connected: !!lsaTok,
        lastSyncAt: lsaState?.last_success_at ?? null,
        lastError: lsaState?.last_error ?? null,
      },
      gbp: {
        connected: gbpConnected,
        lastSyncAt: null,
        lastError: null,
      },
      gbpPerformance: {
        connected: gbpConnected,
        lastSyncAt: gbpPerfState?.last_success_at ?? null,
        lastError: gbpPerfState?.last_error ?? null,
      },
      searchConsole: {
        configured: !!(mktSettings?.search_console_site_url?.trim()),
        siteUrl: mktSettings?.search_console_site_url?.trim() ?? null,
        lastSyncAt: gscState?.last_success_at ?? null,
        lastError: gscState?.last_error ?? null,
      },
    },
    metricDefinitions: METRIC_DEFINITIONS,
    attributionRefreshedAt: new Date().toISOString(),
  };
}

export async function buildMarketingAiContext(
  organizationId: string,
  rangeStart: string,
  rangeEnd: string
): Promise<MarketingAiContext> {
  const overview = await buildMarketingOverviewResponse(organizationId, rangeStart, rangeEnd);

  const dataGaps: string[] = [];
  if (!overview.integrations.hcpConnected) dataGaps.push("Housecall Pro not connected — job and revenue metrics are empty.");
  if (!overview.integrations.lsa.connected) dataGaps.push("Google LSA OAuth not connected — spend and platform leads unavailable.");
  if (!overview.integrations.gbp.connected) dataGaps.push("Google Business Profile not connected — review and GBP metrics limited.");
  if (overview.executive.unassignedShare > 25)
    dataGaps.push(`High unassigned job share (${overview.executive.unassignedShare}%) — tighten lead source mapping or custom rules.`);

  return {
    generatedAt: new Date().toISOString(),
    period: { startDate: rangeStart, endDate: rangeEnd },
    metricDefinitions: overview.metricDefinitions,
    executive: overview.executive,
    channels: overview.channels.map((c) => ({
      slug: c.slug,
      label: c.label,
      spendApplicable: c.spendApplicable,
      spend: c.spend,
      platformLeads: c.platformLeads,
      costPerLead: c.costPerLead,
      attributedJobs: c.attributedJobs,
      paidJobs: c.paidJobs,
      totalRevenue: c.totalRevenue,
      roas: c.roas,
      bookingRate: c.bookingRate,
      conversionRate: c.conversionRate,
      substituteMetrics: c.substituteMetrics,
    })),
    integrations: overview.integrations,
    dataGaps,
  };
}
