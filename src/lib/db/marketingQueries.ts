import { sql } from "./index";
import type { MarketingSourceRuleRow } from "@/lib/marketing/attribution";

export async function getMarketingChannels(): Promise<
  Array<{
    slug: string;
    display_name: string;
    kind: string;
    spend_applicable: boolean;
    sort_order: number;
  }>
> {
  const result = await sql`
    SELECT slug, display_name, kind, spend_applicable, sort_order
    FROM marketing_channels
    ORDER BY sort_order ASC, display_name ASC
  `;
  return (result.rows ?? []) as Array<{
    slug: string;
    display_name: string;
    kind: string;
    spend_applicable: boolean;
    sort_order: number;
  }>;
}

export async function getMarketingSourceRules(organizationId: string): Promise<MarketingSourceRuleRow[]> {
  const result = await sql`
    SELECT pattern, channel_slug, priority
    FROM marketing_source_rules
    WHERE organization_id = ${organizationId}::uuid
    ORDER BY priority DESC
  `;
  return (result.rows ?? []) as MarketingSourceRuleRow[];
}

export async function getJobsWithHcpIdForOrg(organizationId: string): Promise<
  Array<{ hcp_id: string; raw: Record<string, unknown>; total_amount: unknown; outstanding_balance: unknown }>
> {
  const result = await sql`
    SELECT j.hcp_id, j.raw, j.total_amount, j.outstanding_balance
    FROM jobs j
    INNER JOIN organizations o ON o.hcp_company_id = j.company_id AND o.id = ${organizationId}::uuid
  `;
  return (result.rows ?? []) as Array<{
    hcp_id: string;
    raw: Record<string, unknown>;
    total_amount: unknown;
    outstanding_balance: unknown;
  }>;
}

export async function upsertJobAttribution(params: {
  organizationId: string;
  jobHcpId: string;
  channelSlug: string;
  confidence: string;
  ruleType: string;
  matchedValue: string | null;
}): Promise<void> {
  await sql`
    INSERT INTO job_attribution (
      organization_id, job_hcp_id, channel_slug, confidence, rule_type, matched_value, updated_at
    )
    VALUES (
      ${params.organizationId}::uuid,
      ${params.jobHcpId},
      ${params.channelSlug},
      ${params.confidence},
      ${params.ruleType},
      ${params.matchedValue},
      NOW()
    )
    ON CONFLICT (organization_id, job_hcp_id) DO UPDATE SET
      channel_slug = EXCLUDED.channel_slug,
      confidence = EXCLUDED.confidence,
      rule_type = EXCLUDED.rule_type,
      matched_value = EXCLUDED.matched_value,
      updated_at = NOW()
  `;
}

export async function deleteJobAttributionsForOrg(organizationId: string): Promise<void> {
  await sql`DELETE FROM job_attribution WHERE organization_id = ${organizationId}::uuid`;
}

export async function getJobAttributionsMap(organizationId: string): Promise<Map<string, string>> {
  const result = await sql`
    SELECT job_hcp_id, channel_slug FROM job_attribution WHERE organization_id = ${organizationId}::uuid
  `;
  const m = new Map<string, string>();
  for (const row of result.rows ?? []) {
    const r = row as { job_hcp_id: string; channel_slug: string };
    m.set(r.job_hcp_id, r.channel_slug);
  }
  return m;
}

export interface SpendSnapshotRow {
  period_start: string;
  period_end: string;
  channel_slug: string;
  spend_amount: string | number;
  platform_leads: number | null;
  phone_calls: number | null;
  source_system: string;
}

export async function getMarketingSpendSnapshots(
  organizationId: string,
  rangeStart: string,
  rangeEnd: string
): Promise<SpendSnapshotRow[]> {
  const result = await sql`
    SELECT period_start::text, period_end::text, channel_slug, spend_amount, platform_leads, phone_calls, source_system
    FROM fact_marketing_spend_snapshot
    WHERE organization_id = ${organizationId}::uuid
      AND period_start <= ${rangeEnd}::date
      AND period_end >= ${rangeStart}::date
  `;
  return (result.rows ?? []) as SpendSnapshotRow[];
}

export async function upsertMarketingSpendSnapshot(params: {
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  channelSlug: string;
  spendAmount: number;
  currencyCode: string;
  platformLeads: number | null;
  phoneCalls: number | null;
  sourceSystem: string;
  raw: unknown;
}): Promise<void> {
  await sql`
    INSERT INTO fact_marketing_spend_snapshot (
      organization_id, period_start, period_end, channel_slug, spend_amount, currency_code,
      platform_leads, phone_calls, source_system, raw, synced_at
    )
    VALUES (
      ${params.organizationId}::uuid,
      ${params.periodStart}::date,
      ${params.periodEnd}::date,
      ${params.channelSlug},
      ${params.spendAmount},
      ${params.currencyCode},
      ${params.platformLeads},
      ${params.phoneCalls},
      ${params.sourceSystem},
      ${JSON.stringify(params.raw ?? {})}::jsonb,
      NOW()
    )
    ON CONFLICT (organization_id, period_start, period_end, channel_slug, source_system) DO UPDATE SET
      spend_amount = EXCLUDED.spend_amount,
      currency_code = EXCLUDED.currency_code,
      platform_leads = EXCLUDED.platform_leads,
      phone_calls = EXCLUDED.phone_calls,
      raw = EXCLUDED.raw,
      synced_at = NOW()
  `;
}

export async function getMarketingSyncState(
  organizationId: string,
  integration: string
): Promise<{ last_success_at: string | null; last_error: string | null } | null> {
  const result = await sql`
    SELECT last_success_at, last_error
    FROM marketing_integration_sync_state
    WHERE organization_id = ${organizationId}::uuid AND integration = ${integration}
  `;
  const row = (result.rows ?? [])[0] as { last_success_at: string | null; last_error: string | null } | undefined;
  return row ?? null;
}

export async function setMarketingSyncSuccess(params: {
  organizationId: string;
  integration: string;
  cursorJson?: unknown;
}): Promise<void> {
  await sql`
    INSERT INTO marketing_integration_sync_state (
      organization_id, integration, last_success_at, last_error, cursor_json, updated_at
    )
    VALUES (
      ${params.organizationId}::uuid,
      ${params.integration},
      NOW(),
      NULL,
      ${JSON.stringify(params.cursorJson ?? null)}::jsonb,
      NOW()
    )
    ON CONFLICT (organization_id, integration) DO UPDATE SET
      last_success_at = NOW(),
      last_error = NULL,
      cursor_json = COALESCE(EXCLUDED.cursor_json, marketing_integration_sync_state.cursor_json),
      updated_at = NOW()
  `;
}

export async function setMarketingSyncError(params: {
  organizationId: string;
  integration: string;
  message: string;
}): Promise<void> {
  await sql`
    INSERT INTO marketing_integration_sync_state (
      organization_id, integration, last_success_at, last_error, cursor_json, updated_at
    )
    VALUES (
      ${params.organizationId}::uuid,
      ${params.integration},
      NULL,
      ${params.message},
      '{}'::jsonb,
      NOW()
    )
    ON CONFLICT (organization_id, integration) DO UPDATE SET
      last_error = EXCLUDED.last_error,
      updated_at = NOW()
  `;
}

export async function getMarketingOAuthRefreshToken(
  organizationId: string,
  integration: string
): Promise<string | null> {
  const result = await sql`
    SELECT refresh_token FROM marketing_oauth_credentials
    WHERE organization_id = ${organizationId}::uuid AND integration = ${integration}
  `;
  const row = (result.rows ?? [])[0] as { refresh_token: string | null } | undefined;
  return row?.refresh_token?.trim() || null;
}

export async function upsertMarketingOAuthCredentials(params: {
  organizationId: string;
  integration: string;
  refreshToken: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await sql`
    INSERT INTO marketing_oauth_credentials (organization_id, integration, refresh_token, metadata, updated_at)
    VALUES (
      ${params.organizationId}::uuid,
      ${params.integration},
      ${params.refreshToken},
      ${JSON.stringify(params.metadata ?? {})}::jsonb,
      NOW()
    )
    ON CONFLICT (organization_id, integration) DO UPDATE SET
      refresh_token = COALESCE(EXCLUDED.refresh_token, marketing_oauth_credentials.refresh_token),
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
  `;
}

export async function getMarketingOAuthMetadata(
  organizationId: string,
  integration: string
): Promise<Record<string, unknown>> {
  const result = await sql`
    SELECT metadata FROM marketing_oauth_credentials
    WHERE organization_id = ${organizationId}::uuid AND integration = ${integration}
  `;
  const row = (result.rows ?? [])[0] as { metadata: Record<string, unknown> } | undefined;
  return row?.metadata ?? {};
}

export async function upsertGbpMetricsDaily(params: {
  organizationId: string;
  metricDate: string;
  locationId: string;
  callClicks: number | null;
  websiteClicks: number | null;
  directionRequests: number | null;
  impressionsDesktopMaps: number | null;
  impressionsDesktopSearch: number | null;
  impressionsMobileMaps: number | null;
  impressionsMobileSearch: number | null;
}): Promise<void> {
  await sql`
    INSERT INTO fact_gbp_metrics_daily (
      organization_id, metric_date, location_id,
      business_impressions_desktop_maps, business_impressions_desktop_search,
      business_impressions_mobile_maps, business_impressions_mobile_search,
      call_clicks, website_clicks, direction_requests, updated_at
    )
    VALUES (
      ${params.organizationId}::uuid,
      ${params.metricDate}::date,
      ${params.locationId},
      ${params.impressionsDesktopMaps},
      ${params.impressionsDesktopSearch},
      ${params.impressionsMobileMaps},
      ${params.impressionsMobileSearch},
      ${params.callClicks},
      ${params.websiteClicks},
      ${params.directionRequests},
      NOW()
    )
    ON CONFLICT (organization_id, metric_date, location_id) DO UPDATE SET
      business_impressions_desktop_maps = COALESCE(EXCLUDED.business_impressions_desktop_maps, fact_gbp_metrics_daily.business_impressions_desktop_maps),
      business_impressions_desktop_search = COALESCE(EXCLUDED.business_impressions_desktop_search, fact_gbp_metrics_daily.business_impressions_desktop_search),
      business_impressions_mobile_maps = COALESCE(EXCLUDED.business_impressions_mobile_maps, fact_gbp_metrics_daily.business_impressions_mobile_maps),
      business_impressions_mobile_search = COALESCE(EXCLUDED.business_impressions_mobile_search, fact_gbp_metrics_daily.business_impressions_mobile_search),
      call_clicks = COALESCE(EXCLUDED.call_clicks, fact_gbp_metrics_daily.call_clicks),
      website_clicks = COALESCE(EXCLUDED.website_clicks, fact_gbp_metrics_daily.website_clicks),
      direction_requests = COALESCE(EXCLUDED.direction_requests, fact_gbp_metrics_daily.direction_requests),
      updated_at = NOW()
  `;
}

export async function sumGbpMetricsForOrgInRange(
  organizationId: string,
  rangeStart: string,
  rangeEnd: string
): Promise<{
  call_clicks: number;
  website_clicks: number;
  direction_requests: number;
  impressions_sum: number;
}> {
  const result = await sql`
    SELECT
      COALESCE(SUM(call_clicks), 0)::int AS call_clicks,
      COALESCE(SUM(website_clicks), 0)::int AS website_clicks,
      COALESCE(SUM(direction_requests), 0)::int AS direction_requests,
      COALESCE(SUM(
        COALESCE(business_impressions_desktop_maps, 0) +
        COALESCE(business_impressions_desktop_search, 0) +
        COALESCE(business_impressions_mobile_maps, 0) +
        COALESCE(business_impressions_mobile_search, 0)
      ), 0)::bigint AS impressions_sum
    FROM fact_gbp_metrics_daily
    WHERE organization_id = ${organizationId}::uuid
      AND metric_date >= ${rangeStart}::date
      AND metric_date <= ${rangeEnd}::date
  `;
  const row = (result.rows ?? [])[0] as
    | {
        call_clicks: number;
        website_clicks: number;
        direction_requests: number;
        impressions_sum: string | number;
      }
    | undefined;
  return {
    call_clicks: row?.call_clicks ?? 0,
    website_clicks: row?.website_clicks ?? 0,
    direction_requests: row?.direction_requests ?? 0,
    impressions_sum: Number(row?.impressions_sum ?? 0),
  };
}

export async function sumSearchConsoleForOrgInRange(
  organizationId: string,
  rangeStart: string,
  rangeEnd: string
): Promise<{ clicks: number; impressions: number }> {
  const result = await sql`
    SELECT
      COALESCE(SUM(clicks), 0)::int AS clicks,
      COALESCE(SUM(impressions), 0)::bigint AS impressions
    FROM fact_search_console_daily
    WHERE organization_id = ${organizationId}::uuid
      AND metric_date >= ${rangeStart}::date
      AND metric_date <= ${rangeEnd}::date
  `;
  const row = (result.rows ?? [])[0] as { clicks: number; impressions: string | number } | undefined;
  return {
    clicks: row?.clicks ?? 0,
    impressions: Number(row?.impressions ?? 0),
  };
}

export async function getMarketingOrgSettings(organizationId: string): Promise<{
  search_console_site_url: string | null;
  ga4_property_id: string | null;
} | null> {
  const result = await sql`
    SELECT search_console_site_url, ga4_property_id
    FROM marketing_org_settings
    WHERE organization_id = ${organizationId}::uuid
  `;
  const row = (result.rows ?? [])[0] as
    | { search_console_site_url: string | null; ga4_property_id: string | null }
    | undefined;
  return row ?? null;
}

export async function upsertMarketingOrgSettings(params: {
  organizationId: string;
  searchConsoleSiteUrl: string | null;
  ga4PropertyId: string | null;
}): Promise<void> {
  await sql`
    INSERT INTO marketing_org_settings (organization_id, search_console_site_url, ga4_property_id, updated_at)
    VALUES (
      ${params.organizationId}::uuid,
      ${params.searchConsoleSiteUrl},
      ${params.ga4PropertyId},
      NOW()
    )
    ON CONFLICT (organization_id) DO UPDATE SET
      search_console_site_url = EXCLUDED.search_console_site_url,
      ga4_property_id = EXCLUDED.ga4_property_id,
      updated_at = NOW()
  `;
}

export async function upsertSearchConsoleDaily(params: {
  organizationId: string;
  metricDate: string;
  siteUrl: string;
  clicks: number;
  impressions: number;
}): Promise<void> {
  await sql`
    INSERT INTO fact_search_console_daily (organization_id, metric_date, site_url, clicks, impressions, updated_at)
    VALUES (
      ${params.organizationId}::uuid,
      ${params.metricDate}::date,
      ${params.siteUrl},
      ${params.clicks},
      ${params.impressions},
      NOW()
    )
    ON CONFLICT (organization_id, metric_date, site_url) DO UPDATE SET
      clicks = EXCLUDED.clicks,
      impressions = EXCLUDED.impressions,
      updated_at = NOW()
  `;
}

export async function deleteMartMarketingDailyForRange(
  organizationId: string,
  rangeStart: string,
  rangeEnd: string
): Promise<void> {
  await sql`
    DELETE FROM mart_marketing_daily
    WHERE organization_id = ${organizationId}::uuid
      AND metric_date >= ${rangeStart}::date
      AND metric_date <= ${rangeEnd}::date
  `;
}

export async function upsertMartMarketingDailyRow(params: {
  organizationId: string;
  metricDate: string;
  channelSlug: string;
  spendAmount: number;
  platformLeads: number;
  attributedJobCount: number;
  bookedJobCount: number;
  paidJobCount: number;
  attributedRevenue: number;
}): Promise<void> {
  await sql`
    INSERT INTO mart_marketing_daily (
      organization_id, metric_date, channel_slug, spend_amount, platform_leads,
      attributed_job_count, booked_job_count, paid_job_count, attributed_revenue, updated_at
    )
    VALUES (
      ${params.organizationId}::uuid,
      ${params.metricDate}::date,
      ${params.channelSlug},
      ${params.spendAmount},
      ${params.platformLeads},
      ${params.attributedJobCount},
      ${params.bookedJobCount},
      ${params.paidJobCount},
      ${params.attributedRevenue},
      NOW()
    )
    ON CONFLICT (organization_id, metric_date, channel_slug) DO UPDATE SET
      spend_amount = EXCLUDED.spend_amount,
      platform_leads = EXCLUDED.platform_leads,
      attributed_job_count = EXCLUDED.attributed_job_count,
      booked_job_count = EXCLUDED.booked_job_count,
      paid_job_count = EXCLUDED.paid_job_count,
      attributed_revenue = EXCLUDED.attributed_revenue,
      updated_at = NOW()
  `;
}

export async function countGoogleBusinessReviewsForOrg(organizationId: string): Promise<number> {
  const result = await sql`
    SELECT COUNT(*)::int AS c FROM google_business_reviews WHERE organization_id = ${organizationId}::uuid
  `;
  const row = (result.rows ?? [])[0] as { c: number } | undefined;
  return row?.c ?? 0;
}

export async function countFiveStarGoogleReviewsForOrgInRange(
  organizationId: string,
  rangeStart: string,
  rangeEnd: string
): Promise<number> {
  const result = await sql`
    SELECT COUNT(*)::int AS c
    FROM google_business_reviews
    WHERE organization_id = ${organizationId}::uuid
      AND (
        star_rating = 5
        OR UPPER(TRIM(COALESCE(raw->>'starRating', ''))) = 'FIVE'
      )
      AND COALESCE(create_time, update_time) IS NOT NULL
      AND (COALESCE(create_time, update_time))::date >= ${rangeStart}::date
      AND (COALESCE(create_time, update_time))::date <= ${rangeEnd}::date
  `;
  const row = (result.rows ?? [])[0] as { c: number } | undefined;
  return row?.c ?? 0;
}
