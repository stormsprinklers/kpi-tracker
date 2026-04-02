import { decryptSubaccountSecret, encryptSubaccountSecret } from "@/lib/crypto/subaccountSecrets";
import { sql } from "./index";

export type WebAttributionEventType =
  | "landing"
  | "page_view"
  | "tel_click"
  | "form_submit"
  | "booking"
  | "verify_ping";

export interface WebAttributionInstallRow {
  organization_id: string;
  publishable_key_hash: string;
  allowed_origins: string[];
  last_event_at: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
  default_forward_e164: string | null;
  twilio_intelligence_service_sid: string | null;
  twilio_subaccount_sid: string | null;
  twilio_subaccount_created_at: string | null;
  call_tracking_ivr_enabled: boolean;
  call_tracking_ivr_prompt: string | null;
}

export interface WebAttributionSourceRow {
  id: string;
  organization_id: string;
  slug: string;
  label: string;
  public_token: string;
  created_at: string;
  archived_at: string | null;
}

export interface WebAttributionEventInsert {
  organizationId: string;
  sourceId: string | null;
  visitorId: string;
  eventType: WebAttributionEventType;
  occurredAt?: string | null;
  pageUrl?: string | null;
  referrer?: string | null;
  userAgent?: string | null;
  ipHash?: string | null;
  country?: string | null;
  metadata?: unknown;
}

export async function getWebAttributionInstall(
  organizationId: string
): Promise<WebAttributionInstallRow | null> {
  const result = await sql`
    SELECT organization_id, publishable_key_hash, allowed_origins, last_event_at, verified_at, created_at, updated_at,
           default_forward_e164, twilio_intelligence_service_sid,
           twilio_subaccount_sid, twilio_subaccount_created_at,
           call_tracking_ivr_enabled, call_tracking_ivr_prompt
    FROM web_attribution_install
    WHERE organization_id = ${organizationId}::uuid
    LIMIT 1
  `;
  const row = (result.rows ?? [])[0] as WebAttributionInstallRow | undefined;
  if (!row) return null;
  return {
    ...row,
    allowed_origins: Array.isArray(row.allowed_origins) ? row.allowed_origins : [],
    default_forward_e164: row.default_forward_e164 ?? null,
    twilio_intelligence_service_sid: row.twilio_intelligence_service_sid ?? null,
    twilio_subaccount_sid: row.twilio_subaccount_sid ?? null,
    twilio_subaccount_created_at: row.twilio_subaccount_created_at ?? null,
    call_tracking_ivr_enabled: Boolean(row.call_tracking_ivr_enabled),
    call_tracking_ivr_prompt: row.call_tracking_ivr_prompt ?? null,
  };
}

export async function getWebAttributionInstallByKeyHash(
  publishableKeyHash: string
): Promise<WebAttributionInstallRow | null> {
  const result = await sql`
    SELECT organization_id, publishable_key_hash, allowed_origins, last_event_at, verified_at, created_at, updated_at,
           default_forward_e164, twilio_intelligence_service_sid,
           twilio_subaccount_sid, twilio_subaccount_created_at,
           call_tracking_ivr_enabled, call_tracking_ivr_prompt
    FROM web_attribution_install
    WHERE publishable_key_hash = ${publishableKeyHash}
    LIMIT 1
  `;
  const row = (result.rows ?? [])[0] as WebAttributionInstallRow | undefined;
  if (!row) return null;
  return {
    ...row,
    allowed_origins: Array.isArray(row.allowed_origins) ? row.allowed_origins : [],
    default_forward_e164: row.default_forward_e164 ?? null,
    twilio_intelligence_service_sid: row.twilio_intelligence_service_sid ?? null,
    twilio_subaccount_sid: row.twilio_subaccount_sid ?? null,
    twilio_subaccount_created_at: row.twilio_subaccount_created_at ?? null,
    call_tracking_ivr_enabled: Boolean(row.call_tracking_ivr_enabled),
    call_tracking_ivr_prompt: row.call_tracking_ivr_prompt ?? null,
  };
}

export async function upsertWebAttributionInstall(params: {
  organizationId: string;
  publishableKeyHash: string;
  allowedOrigins: string[];
}): Promise<void> {
  await sql`
    INSERT INTO web_attribution_install (
      organization_id, publishable_key_hash, allowed_origins, updated_at
    )
    VALUES (
      ${params.organizationId}::uuid,
      ${params.publishableKeyHash},
      ${params.allowedOrigins}::text[],
      NOW()
    )
    ON CONFLICT (organization_id) DO UPDATE SET
      publishable_key_hash = EXCLUDED.publishable_key_hash,
      allowed_origins = EXCLUDED.allowed_origins,
      updated_at = NOW()
  `;
}

export async function updateWebAttributionAllowedOrigins(params: {
  organizationId: string;
  allowedOrigins: string[];
}): Promise<void> {
  await sql`
    UPDATE web_attribution_install
    SET allowed_origins = ${params.allowedOrigins}::text[], updated_at = NOW()
    WHERE organization_id = ${params.organizationId}::uuid
  `;
}

export async function updateWebAttributionCallTrackingSettings(params: {
  organizationId: string;
  defaultForwardE164?: string | null;
  twilioIntelligenceServiceSid?: string | null;
  callTrackingIvrEnabled?: boolean;
  callTrackingIvrPrompt?: string | null;
}): Promise<void> {
  if (params.defaultForwardE164 !== undefined) {
    await sql`
      UPDATE web_attribution_install
      SET default_forward_e164 = ${params.defaultForwardE164?.trim() || null}, updated_at = NOW()
      WHERE organization_id = ${params.organizationId}::uuid
    `;
  }
  if (params.twilioIntelligenceServiceSid !== undefined) {
    await sql`
      UPDATE web_attribution_install
      SET twilio_intelligence_service_sid = ${params.twilioIntelligenceServiceSid?.trim() || null}, updated_at = NOW()
      WHERE organization_id = ${params.organizationId}::uuid
    `;
  }
  if (params.callTrackingIvrEnabled !== undefined) {
    await sql`
      UPDATE web_attribution_install
      SET call_tracking_ivr_enabled = ${params.callTrackingIvrEnabled}, updated_at = NOW()
      WHERE organization_id = ${params.organizationId}::uuid
    `;
  }
  if (params.callTrackingIvrPrompt !== undefined) {
    const p = params.callTrackingIvrPrompt?.trim() || null;
    await sql`
      UPDATE web_attribution_install
      SET call_tracking_ivr_prompt = ${p}, updated_at = NOW()
      WHERE organization_id = ${params.organizationId}::uuid
    `;
  }
}

export async function touchWebAttributionEvent(organizationId: string): Promise<void> {
  await sql`
    UPDATE web_attribution_install
    SET
      last_event_at = NOW(),
      verified_at = COALESCE(verified_at, NOW()),
      updated_at = NOW()
    WHERE organization_id = ${organizationId}::uuid
  `;
}

export async function listWebAttributionSources(
  organizationId: string,
  options?: { includeArchived?: boolean }
): Promise<WebAttributionSourceRow[]> {
  const includeArchived = options?.includeArchived === true;
  const result = await sql`
    SELECT id, organization_id, slug, label, public_token, created_at, archived_at
    FROM web_attribution_sources
    WHERE organization_id = ${organizationId}::uuid
      AND (${includeArchived}::boolean OR archived_at IS NULL)
    ORDER BY created_at ASC
  `;
  return (result.rows ?? []) as WebAttributionSourceRow[];
}

export async function createWebAttributionSource(params: {
  organizationId: string;
  slug: string;
  label: string;
  publicToken: string;
}): Promise<WebAttributionSourceRow> {
  const result = await sql`
    INSERT INTO web_attribution_sources (
      organization_id, slug, label, public_token
    )
    VALUES (
      ${params.organizationId}::uuid,
      ${params.slug},
      ${params.label},
      ${params.publicToken}
    )
    RETURNING id, organization_id, slug, label, public_token, created_at, archived_at
  `;
  return result.rows[0] as WebAttributionSourceRow;
}

export async function archiveWebAttributionSource(params: {
  organizationId: string;
  sourceId: string;
}): Promise<void> {
  await sql`
    UPDATE web_attribution_sources
    SET archived_at = NOW()
    WHERE organization_id = ${params.organizationId}::uuid
      AND id = ${params.sourceId}::uuid
  `;
}

export async function getWebAttributionSourceByToken(
  token: string
): Promise<{ organization_id: string; source_id: string } | null> {
  const result = await sql`
    SELECT organization_id, id AS source_id
    FROM web_attribution_sources
    WHERE public_token = ${token}
      AND archived_at IS NULL
    LIMIT 1
  `;
  const row = (result.rows ?? [])[0] as { organization_id: string; source_id: string } | undefined;
  return row ?? null;
}

export async function getWebAttributionSourceBySlugOrLabel(params: {
  organizationId: string;
  value: string;
}): Promise<{ source_id: string } | null> {
  const v = params.value.trim().toLowerCase();
  if (!v) return null;
  const result = await sql`
    SELECT id AS source_id
    FROM web_attribution_sources
    WHERE organization_id = ${params.organizationId}::uuid
      AND archived_at IS NULL
      AND (
        LOWER(slug) = ${v}
        OR LOWER(label) = ${v}
      )
    LIMIT 1
  `;
  const row = (result.rows ?? [])[0] as { source_id: string } | undefined;
  return row ?? null;
}

export async function getWebAttributionSourceIdBySlug(
  organizationId: string,
  slug: string
): Promise<string | null> {
  const s = slug.trim().toLowerCase();
  if (!s) return null;
  const result = await sql`
    SELECT id::text AS id
    FROM web_attribution_sources
    WHERE organization_id = ${organizationId}::uuid
      AND archived_at IS NULL
      AND LOWER(TRIM(slug)) = ${s}
    LIMIT 1
  `;
  const row = (result.rows ?? [])[0] as { id: string } | undefined;
  return row?.id ?? null;
}

export async function insertWebAttributionEvents(events: WebAttributionEventInsert[]): Promise<void> {
  if (!events.length) return;
  for (const event of events) {
    await sql`
      INSERT INTO web_attribution_events (
        organization_id, source_id, visitor_id, event_type, occurred_at,
        page_url, referrer, user_agent, ip_hash, country, metadata
      )
      VALUES (
        ${event.organizationId}::uuid,
        ${event.sourceId ? `${event.sourceId}` : null}::uuid,
        ${event.visitorId},
        ${event.eventType},
        COALESCE(${event.occurredAt ?? null}::timestamptz, NOW()),
        ${event.pageUrl ?? null},
        ${event.referrer ?? null},
        ${event.userAgent ? event.userAgent.slice(0, 300) : null},
        ${event.ipHash ?? null},
        ${event.country ?? null},
        ${JSON.stringify(event.metadata ?? {})}::jsonb
      )
    `;
  }
}

export async function getRecentWebAttributionEvents(params: {
  organizationId: string;
  limit?: number;
}): Promise<
  Array<{
    id: string;
    source_label: string | null;
    event_type: string;
    occurred_at: string;
    page_url: string | null;
    referrer: string | null;
    metadata: Record<string, unknown>;
  }>
> {
  const limit = Math.max(1, Math.min(200, params.limit ?? 100));
  const result = await sql`
    SELECT
      e.id,
      s.label AS source_label,
      e.event_type,
      e.occurred_at,
      e.page_url,
      e.referrer,
      e.metadata
    FROM web_attribution_events e
    LEFT JOIN web_attribution_sources s
      ON s.id = e.source_id
    WHERE e.organization_id = ${params.organizationId}::uuid
    ORDER BY e.occurred_at DESC
    LIMIT ${limit}
  `;
  return (result.rows ?? []) as Array<{
    id: string;
    source_label: string | null;
    event_type: string;
    occurred_at: string;
    page_url: string | null;
    referrer: string | null;
    metadata: Record<string, unknown>;
  }>;
}

export interface WebAttributionSessionEventRow {
  id: string;
  visitor_id: string;
  source_label: string | null;
  event_type: string;
  occurred_at: string;
  page_url: string | null;
  referrer: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Events for the most recently active visitors. Caller groups by `visitor_id` into sessions.
 * Uses calendar-date filter on `occurred_at` when startDate/endDate set; otherwise last 30 days.
 */
export async function getRecentWebAttributionSessionEvents(params: {
  organizationId: string;
  /** Max distinct visitors (sessions) to include */
  maxVisitors?: number;
  startDate?: string;
  endDate?: string;
}): Promise<WebAttributionSessionEventRow[]> {
  const maxV = Math.max(1, Math.min(80, params.maxVisitors ?? 40));
  const start = params.startDate?.slice(0, 10);
  const end = params.endDate?.slice(0, 10);
  const useRange = Boolean(start && end && start <= end);

  const result = useRange
    ? await sql`
        WITH top_visitors AS (
          SELECT visitor_id
          FROM web_attribution_events
          WHERE organization_id = ${params.organizationId}::uuid
            AND occurred_at::date >= ${start}::date
            AND occurred_at::date <= ${end}::date
          GROUP BY visitor_id
          ORDER BY MAX(occurred_at) DESC
          LIMIT ${maxV}
        )
        SELECT
          e.id,
          e.visitor_id,
          s.label AS source_label,
          e.event_type,
          e.occurred_at,
          e.page_url,
          e.referrer,
          e.metadata
        FROM web_attribution_events e
        LEFT JOIN web_attribution_sources s ON s.id = e.source_id
        WHERE e.organization_id = ${params.organizationId}::uuid
          AND e.occurred_at::date >= ${start}::date
          AND e.occurred_at::date <= ${end}::date
          AND e.visitor_id IN (SELECT visitor_id FROM top_visitors)
        ORDER BY e.visitor_id ASC, e.occurred_at ASC
      `
    : await sql`
        WITH top_visitors AS (
          SELECT visitor_id
          FROM web_attribution_events
          WHERE organization_id = ${params.organizationId}::uuid
            AND occurred_at >= NOW() - INTERVAL '30 days'
          GROUP BY visitor_id
          ORDER BY MAX(occurred_at) DESC
          LIMIT ${maxV}
        )
        SELECT
          e.id,
          e.visitor_id,
          s.label AS source_label,
          e.event_type,
          e.occurred_at,
          e.page_url,
          e.referrer,
          e.metadata
        FROM web_attribution_events e
        LEFT JOIN web_attribution_sources s ON s.id = e.source_id
        WHERE e.organization_id = ${params.organizationId}::uuid
          AND e.occurred_at >= NOW() - INTERVAL '30 days'
          AND e.visitor_id IN (SELECT visitor_id FROM top_visitors)
        ORDER BY e.visitor_id ASC, e.occurred_at ASC
      `;
  return (result.rows ?? []) as WebAttributionSessionEventRow[];
}

export interface WebAttributionRangeTotals {
  uniqueVisitors: number;
  pageLoads: number;
  telClicks: number;
  formSubmits: number;
  webBookings: number;
}

export async function getWebAttributionRangeTotals(params: {
  organizationId: string;
  startDate: string;
  endDate: string;
}): Promise<WebAttributionRangeTotals> {
  const start = params.startDate.slice(0, 10);
  const end = params.endDate.slice(0, 10);
  const result = await sql`
    SELECT
      COUNT(DISTINCT visitor_id)::int AS unique_visitors,
      COUNT(*) FILTER (
        WHERE event_type IN ('landing', 'page_view')
      )::int AS page_loads,
      COUNT(*) FILTER (WHERE event_type = 'tel_click')::int AS tel_clicks,
      COUNT(*) FILTER (WHERE event_type = 'form_submit')::int AS form_submits,
      COUNT(*) FILTER (WHERE event_type = 'booking')::int AS web_bookings
    FROM web_attribution_events
    WHERE organization_id = ${params.organizationId}::uuid
      AND occurred_at::date >= ${start}::date
      AND occurred_at::date <= ${end}::date
  `;
  const row = (result.rows ?? [])[0] as
    | {
        unique_visitors: number;
        page_loads: number;
        tel_clicks: number;
        form_submits: number;
        web_bookings: number;
      }
    | undefined;
  return {
    uniqueVisitors: row?.unique_visitors ?? 0,
    pageLoads: row?.page_loads ?? 0,
    telClicks: row?.tel_clicks ?? 0,
    formSubmits: row?.form_submits ?? 0,
    webBookings: row?.web_bookings ?? 0,
  };
}

export interface WebSourceRangeMetricsRow {
  source_id: string;
  source_label: string;
  unique_visitors: number;
  tel_clicks: number;
  form_submits: number;
  web_bookings: number;
}

export async function getWebSourceMetricsInRange(params: {
  organizationId: string;
  startDate: string;
  endDate: string;
}): Promise<WebSourceRangeMetricsRow[]> {
  const start = params.startDate.slice(0, 10);
  const end = params.endDate.slice(0, 10);
  const result = await sql`
    SELECT
      s.id::text AS source_id,
      s.label AS source_label,
      COUNT(DISTINCT e.visitor_id)::int AS unique_visitors,
      COUNT(*) FILTER (WHERE e.event_type = 'tel_click')::int AS tel_clicks,
      COUNT(*) FILTER (WHERE e.event_type = 'form_submit')::int AS form_submits,
      COUNT(*) FILTER (WHERE e.event_type = 'booking')::int AS web_bookings
    FROM web_attribution_sources s
    LEFT JOIN web_attribution_events e
      ON e.source_id = s.id
      AND e.organization_id = s.organization_id
      AND e.occurred_at::date >= ${start}::date
      AND e.occurred_at::date <= ${end}::date
    WHERE s.organization_id = ${params.organizationId}::uuid
      AND s.archived_at IS NULL
    GROUP BY s.id, s.label
    ORDER BY LOWER(s.label) ASC
  `;
  return (result.rows ?? []) as WebSourceRangeMetricsRow[];
}

export async function countTwilioTrackingCallsInRange(params: {
  organizationId: string;
  startDate: string;
  endDate: string;
}): Promise<number> {
  const start = params.startDate.slice(0, 10);
  const end = params.endDate.slice(0, 10);
  const result = await sql`
    SELECT COUNT(*)::int AS c
    FROM twilio_tracking_calls
    WHERE organization_id = ${params.organizationId}::uuid
      AND created_at::date >= ${start}::date
      AND created_at::date <= ${end}::date
  `;
  const row = (result.rows ?? [])[0] as { c: number } | undefined;
  return row?.c ?? 0;
}

export async function countTwilioCallsBySourceInRange(params: {
  organizationId: string;
  startDate: string;
  endDate: string;
}): Promise<Record<string, number>> {
  const start = params.startDate.slice(0, 10);
  const end = params.endDate.slice(0, 10);
  const result = await sql`
    SELECT source_id::text AS source_id, COUNT(*)::int AS c
    FROM twilio_tracking_calls
    WHERE organization_id = ${params.organizationId}::uuid
      AND source_id IS NOT NULL
      AND created_at::date >= ${start}::date
      AND created_at::date <= ${end}::date
    GROUP BY source_id
  `;
  const out: Record<string, number> = {};
  for (const row of result.rows ?? []) {
    const r = row as { source_id: string; c: number };
    out[r.source_id] = r.c;
  }
  return out;
}

export async function getTopLandingPagesInRange(params: {
  organizationId: string;
  startDate: string;
  endDate: string;
  limit?: number;
}): Promise<Array<{ page_url: string; views: number }>> {
  const start = params.startDate.slice(0, 10);
  const end = params.endDate.slice(0, 10);
  const lim = Math.max(1, Math.min(10, params.limit ?? 3));
  const result = await sql`
    SELECT page_url, COUNT(*)::int AS views
    FROM web_attribution_events
    WHERE organization_id = ${params.organizationId}::uuid
      AND occurred_at::date >= ${start}::date
      AND occurred_at::date <= ${end}::date
      AND event_type IN ('landing', 'page_view')
      AND page_url IS NOT NULL
      AND TRIM(page_url) != ''
    GROUP BY page_url
    ORDER BY views DESC
    LIMIT ${lim}
  `;
  return (result.rows ?? []) as Array<{ page_url: string; views: number }>;
}

export async function getWebAttributionEventCounts(
  organizationId: string
): Promise<Record<string, number>> {
  const result = await sql`
    SELECT event_type, COUNT(*)::int AS count
    FROM web_attribution_events
    WHERE organization_id = ${organizationId}::uuid
      AND occurred_at >= NOW() - INTERVAL '30 days'
    GROUP BY event_type
  `;
  const out: Record<string, number> = {};
  for (const row of result.rows ?? []) {
    const r = row as { event_type: string; count: number };
    out[r.event_type] = r.count;
  }
  return out;
}

export async function getWebAttributionSourceSummary30d(
  organizationId: string
): Promise<
  Array<{
    source_id: string;
    source_label: string;
    calls: number;
    forms: number;
    bookings: number;
  }>
> {
  const result = await sql`
    WITH event_counts AS (
      SELECT
        source_id,
        SUM(CASE WHEN event_type = 'form_submit' THEN 1 ELSE 0 END)::int AS forms,
        SUM(CASE WHEN event_type = 'booking' THEN 1 ELSE 0 END)::int AS bookings
      FROM web_attribution_events
      WHERE organization_id = ${organizationId}::uuid
        AND occurred_at >= NOW() - INTERVAL '30 days'
      GROUP BY source_id
    ),
    call_counts AS (
      SELECT
        source_id,
        COUNT(*)::int AS calls
      FROM twilio_tracking_calls
      WHERE organization_id = ${organizationId}::uuid
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY source_id
    )
    SELECT
      s.id AS source_id,
      s.label AS source_label,
      COALESCE(c.calls, 0) AS calls,
      COALESCE(e.forms, 0) AS forms,
      COALESCE(e.bookings, 0) AS bookings
    FROM web_attribution_sources s
    LEFT JOIN event_counts e ON e.source_id = s.id
    LEFT JOIN call_counts c ON c.source_id = s.id
    WHERE s.organization_id = ${organizationId}::uuid
      AND s.archived_at IS NULL
    ORDER BY LOWER(s.label) ASC
  `;
  return (result.rows ?? []) as Array<{
    source_id: string;
    source_label: string;
    calls: number;
    forms: number;
    bookings: number;
  }>;
}

export async function saveTwilioSubaccountCredentials(params: {
  organizationId: string;
  subaccountSid: string;
  plainAuthToken: string;
  apiKeySid: string;
  plainApiKeySecret: string;
}): Promise<void> {
  await sql`
    UPDATE web_attribution_install
    SET
      twilio_subaccount_sid = ${params.subaccountSid},
      twilio_subaccount_auth_token_encrypted = ${encryptSubaccountSecret(params.plainAuthToken)},
      twilio_subaccount_api_key_sid = ${params.apiKeySid},
      twilio_subaccount_api_key_secret_encrypted = ${encryptSubaccountSecret(params.plainApiKeySecret)},
      twilio_subaccount_created_at = NOW(),
      updated_at = NOW()
    WHERE organization_id = ${params.organizationId}::uuid
  `;
}

/** Temporary helper: refresh only webhook signature token for an existing subaccount. */
export async function updateTwilioSubaccountAuthToken(params: {
  organizationId: string;
  subaccountSid: string;
  plainAuthToken: string;
}): Promise<void> {
  await sql`
    UPDATE web_attribution_install
    SET
      twilio_subaccount_auth_token_encrypted = ${encryptSubaccountSecret(params.plainAuthToken)},
      updated_at = NOW()
    WHERE organization_id = ${params.organizationId}::uuid
      AND twilio_subaccount_sid = ${params.subaccountSid}
  `;
}

/** REST + Intelligence for this org’s Twilio subaccount (API key auth). */
export async function getDecryptedTwilioSubaccountRestCredentials(
  organizationId: string
): Promise<{ accountSid: string; apiKeySid: string; apiKeySecret: string } | null> {
  const result = await sql`
    SELECT twilio_subaccount_sid, twilio_subaccount_api_key_sid, twilio_subaccount_api_key_secret_encrypted
    FROM web_attribution_install
    WHERE organization_id = ${organizationId}::uuid
    LIMIT 1
  `;
  const row = (result.rows ?? [])[0] as
    | {
        twilio_subaccount_sid: string | null;
        twilio_subaccount_api_key_sid: string | null;
        twilio_subaccount_api_key_secret_encrypted: string | null;
      }
    | undefined;
  if (
    !row?.twilio_subaccount_sid ||
    !row.twilio_subaccount_api_key_sid ||
    !row.twilio_subaccount_api_key_secret_encrypted
  ) {
    return null;
  }
  try {
    return {
      accountSid: row.twilio_subaccount_sid,
      apiKeySid: row.twilio_subaccount_api_key_sid,
      apiKeySecret: decryptSubaccountSecret(row.twilio_subaccount_api_key_secret_encrypted),
    };
  } catch {
    return null;
  }
}

/** Webhook signature validation uses the subaccount Auth Token. */
export async function getOrganizationIdByTwilioSubaccountSid(
  accountSid: string
): Promise<string | null> {
  const result = await sql`
    SELECT organization_id
    FROM web_attribution_install
    WHERE twilio_subaccount_sid = ${accountSid}
    LIMIT 1
  `;
  const row = (result.rows ?? [])[0] as { organization_id: string } | undefined;
  return row?.organization_id ?? null;
}

export async function getTwilioWebhookAuthTokenForSubaccountSid(
  accountSid: string
): Promise<string | null> {
  const result = await sql`
    SELECT twilio_subaccount_auth_token_encrypted
    FROM web_attribution_install
    WHERE twilio_subaccount_sid = ${accountSid}
    LIMIT 1
  `;
  const enc = (result.rows ?? [])[0] as { twilio_subaccount_auth_token_encrypted: string | null } | undefined;
  if (!enc?.twilio_subaccount_auth_token_encrypted) return null;
  try {
    return decryptSubaccountSecret(enc.twilio_subaccount_auth_token_encrypted);
  } catch {
    return null;
  }
}

