import { getEstimatesFromDb, getOrganizationById, getPerformancePayOrg } from "../db/queries";
import { getPayPeriodRangeForOffset, payPeriodSettingsFromOrg } from "../payPeriod";
import { aggregateCollectedJobRevenueForCompany } from "./jobCollectedRevenue";

export type KeyMetricsRange =
  | "7d"
  | "30d"
  | "all"
  | "thisPayPeriod"
  | "lastPayPeriod";

export interface KeyMetrics {
  jobCount: number;
  revenue: number;
  avgJobValue: number | null;
  conversionRate: number | null;
}

function getEstimateDate(estimate: Record<string, unknown>): Date | null {
  const wt = estimate.work_timestamps as Record<string, unknown> | undefined;
  const sched = estimate.schedule as Record<string, unknown> | undefined;
  const completed = wt?.completed_at ?? wt?.completed;
  const scheduled = sched?.scheduled_start ?? sched?.scheduledStart ?? estimate.scheduled_start;
  const created = estimate.created_at ?? estimate.createdAt;
  const updated = estimate.updated_at ?? estimate.updatedAt;
  const dateStr = (completed ?? scheduled ?? created ?? updated) as string | undefined;
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

function estimateInDateRange(estimate: Record<string, unknown>, startDate: string | null, endDate: string | null): boolean {
  if (!startDate || !endDate) return true;
  const estDate = getEstimateDate(estimate);
  if (!estDate) return true;
  const estDay = estDate.toISOString().slice(0, 10);
  return estDay >= startDate && estDay <= endDate;
}

function hasApprovedOption(estimate: Record<string, unknown>): boolean {
  const options = estimate.options as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(options)) return false;
  return options.some(
    (opt) => opt.approval_status === "approved" || opt.approval_status === "pro approved"
  );
}

function getDateRangeForPeriod(
  range: Exclude<KeyMetricsRange, "thisPayPeriod" | "lastPayPeriod">
): { startDate: string | null; endDate: string | null } {
  const today = new Date();
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);
  const endStr = end.toISOString().slice(0, 10);

  if (range === "all") return { startDate: null, endDate: null };

  const start = new Date(today);
  start.setDate(start.getDate() - (range === "7d" ? 7 : 30));
  const startStr = start.toISOString().slice(0, 10);
  return { startDate: startStr, endDate: endStr };
}

export type KeyMetricsInput =
  | KeyMetricsRange
  | { startDate: string | null; endDate: string | null };

async function normalizeKeyMetricsInput(
  organizationId: string,
  input: KeyMetricsInput
): Promise<KeyMetricsInput> {
  if (typeof input !== "string") return input;
  if (input !== "thisPayPeriod" && input !== "lastPayPeriod") return input;
  const ppOrg = await getPerformancePayOrg(organizationId);
  const settings = payPeriodSettingsFromOrg(ppOrg);
  const p = getPayPeriodRangeForOffset(input === "thisPayPeriod" ? 0 : -1, settings);
  return { startDate: p.startDate, endDate: p.endDate };
}

function resolveKeyMetricsWindow(
  input: KeyMetricsInput
): { startDate: string | null; endDate: string | null } {
  if (typeof input === "string") {
    if (input === "thisPayPeriod" || input === "lastPayPeriod") {
      throw new Error("Pay period presets must be normalized before resolving the metrics window");
    }
    return getDateRangeForPeriod(input);
  }
  return { startDate: input.startDate, endDate: input.endDate };
}

export async function getKeyMetrics(organizationId: string, input: KeyMetricsInput = "7d"): Promise<KeyMetrics> {
  const [org, normalizedInput] = await Promise.all([
    getOrganizationById(organizationId),
    normalizeKeyMetricsInput(organizationId, input),
  ]);
  const companyId = org?.hcp_company_id?.trim() || "";
  if (!companyId) {
    return { jobCount: 0, revenue: 0, avgJobValue: null, conversionRate: null };
  }

  const { startDate, endDate } = resolveKeyMetricsWindow(normalizedInput);

  const { totalRevenue: revenue, paidJobCount: jobCount } = await aggregateCollectedJobRevenueForCompany(
    companyId,
    { startDate, endDate }
  );

  let estimates: unknown[] = [];
  try {
    estimates = await getEstimatesFromDb(companyId);
  } catch {
    /* skip */
  }

  let totalEstimates = 0;
  let approvedEstimates = 0;
  for (const est of estimates) {
    const e = est as Record<string, unknown>;
    if (!estimateInDateRange(e, startDate, endDate)) continue;
    totalEstimates += 1;
    if (hasApprovedOption(e)) approvedEstimates += 1;
  }

  const conversionRate = totalEstimates > 0 ? (approvedEstimates / totalEstimates) * 100 : null;
  const avgJobValue = jobCount > 0 ? revenue / jobCount : null;

  return {
    jobCount,
    revenue,
    avgJobValue,
    conversionRate,
  };
}
