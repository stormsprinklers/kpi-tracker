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
    SELECT organization_id, publishable_key_hash, allowed_origins, last_event_at, verified_at, created_at, updated_at
    FROM web_attribution_install
    WHERE organization_id = ${organizationId}::uuid
    LIMIT 1
  `;
  const row = (result.rows ?? [])[0] as WebAttributionInstallRow | undefined;
  if (!row) return null;
  return {
    ...row,
    allowed_origins: Array.isArray(row.allowed_origins) ? row.allowed_origins : [],
  };
}

export async function getWebAttributionInstallByKeyHash(
  publishableKeyHash: string
): Promise<WebAttributionInstallRow | null> {
  const result = await sql`
    SELECT organization_id, publishable_key_hash, allowed_origins, last_event_at, verified_at, created_at, updated_at
    FROM web_attribution_install
    WHERE publishable_key_hash = ${publishableKeyHash}
    LIMIT 1
  `;
  const row = (result.rows ?? [])[0] as WebAttributionInstallRow | undefined;
  if (!row) return null;
  return {
    ...row,
    allowed_origins: Array.isArray(row.allowed_origins) ? row.allowed_origins : [],
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

