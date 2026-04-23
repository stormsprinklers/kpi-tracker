import { getTechnicianIdsFromJob } from "@/lib/jobs/hcpJobTechnicians";
import { sql } from "./index";

export interface SyncFilters {
  workStatus?: string;
  limit?: number;
  startDate?: string; // ISO date YYYY-MM-DD
  endDate?: string;   // ISO date YYYY-MM-DD
}

export async function getJobsFromDb(
  companyId: string,
  filters?: SyncFilters
): Promise<Record<string, unknown>[]> {
  const result = await sql`
    SELECT raw, total_amount, outstanding_balance FROM jobs
    WHERE company_id = ${companyId}
    ORDER BY (raw->>'updated_at') DESC
    LIMIT ${filters?.limit ?? 10000}
  `;
  return (result.rows ?? []).map((r) => {
    const row = r as { raw: Record<string, unknown>; total_amount?: number | string | null; outstanding_balance?: number | string | null };
    const job = { ...row.raw } as Record<string, unknown>;
    const toNum = (v: unknown): number | null =>
      typeof v === "number" && !Number.isNaN(v) ? v : typeof v === "string" ? (parseFloat(v) || null) : null;
    const rawTotal = toNum(row.raw?.total_amount) ?? toNum(row.raw?.subtotal);
    const rawOut = toNum(row.raw?.outstanding_balance) ?? toNum(row.raw?.balance_due) ?? toNum(row.raw?.amount_due);
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
      const colVal = typeof row.outstanding_balance === "string" ? parseFloat(row.outstanding_balance) : Number(row.outstanding_balance);
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
  });
}

export async function getCustomersFromDb(
  companyId: string
): Promise<Record<string, unknown>[]> {
  const result = await sql`
    SELECT raw FROM customers
    WHERE company_id = ${companyId}
  `;
  return (result.rows ?? []).map((r) => (r as { raw: Record<string, unknown> }).raw);
}

export async function getInvoicesFromDb(
  companyId: string,
  jobHcpId?: string
): Promise<Record<string, unknown>[]> {
  if (jobHcpId) {
    const result = await sql`
      SELECT raw FROM invoices
      WHERE company_id = ${companyId} AND job_hcp_id = ${jobHcpId}
    `;
    return (result.rows ?? []).map((r) => (r as { raw: Record<string, unknown> }).raw);
  }
  const result = await sql`
    SELECT raw FROM invoices
    WHERE company_id = ${companyId}
  `;
  return (result.rows ?? []).map((r) => (r as { raw: Record<string, unknown> }).raw);
}

export async function getEstimatesFromDb(
  companyId: string
): Promise<Record<string, unknown>[]> {
  const result = await sql`
    SELECT raw FROM estimates
    WHERE company_id = ${companyId}
  `;
  return (result.rows ?? []).map((r) => (r as { raw: Record<string, unknown> }).raw);
}

/** Get all line items for a company, grouped by job_hcp_id. Returns Map<jobHcpId, lineItems[]>. */
export async function getAllJobLineItemsByCompany(
  companyId: string
): Promise<Map<string, Record<string, unknown>[]>> {
  const result = await sql`
    SELECT job_hcp_id, raw FROM job_line_items
    WHERE company_id = ${companyId}
  `;
  const map = new Map<string, Record<string, unknown>[]>();
  for (const row of result.rows ?? []) {
    const r = row as { job_hcp_id: string; raw: Record<string, unknown> };
    const list = map.get(r.job_hcp_id) ?? [];
    list.push(r.raw);
    map.set(r.job_hcp_id, list);
  }
  return map;
}

/** Get line items for a job from job_line_items table. */
export async function getJobLineItemsFromDb(
  companyId: string,
  jobHcpId: string
): Promise<Record<string, unknown>[]> {
  const result = await sql`
    SELECT raw FROM job_line_items
    WHERE company_id = ${companyId} AND job_hcp_id = ${jobHcpId}
  `;
  return (result.rows ?? []).map((r) => (r as { raw: Record<string, unknown> }).raw);
}

/** Upsert line items for a job. Each line item has hcp_id (line item id), job_hcp_id. */
export async function upsertJobLineItems(
  companyId: string,
  jobHcpId: string,
  lineItems: Record<string, unknown>[]
): Promise<number> {
  let count = 0;
  for (const item of lineItems) {
    const hcpId = (item.id ?? item.uuid) != null ? String(item.id ?? item.uuid) : null;
    if (!hcpId) continue;
    await sql`
      INSERT INTO job_line_items (hcp_id, company_id, job_hcp_id, raw, updated_at)
      VALUES (${hcpId}, ${companyId}, ${jobHcpId}, ${JSON.stringify(item)}::jsonb, NOW())
      ON CONFLICT (hcp_id, company_id) DO UPDATE SET
        job_hcp_id = EXCLUDED.job_hcp_id,
        raw = EXCLUDED.raw,
        updated_at = NOW()
    `;
    count++;
  }
  return count;
}

export async function getEmployeesFromDb(
  companyId: string
): Promise<Record<string, unknown>[]> {
  const result = await sql`
    SELECT raw FROM employees
    WHERE company_id = ${companyId}
  `;
  return (result.rows ?? []).map((r) => (r as { raw: Record<string, unknown> }).raw);
}

/** Returns { id, name } for employee selector. Uses hcp_id from table for reliable id. */
export async function getEmployeesForSelector(
  companyId: string
): Promise<{ id: string; name: string }[]> {
  const result = await sql`
    SELECT hcp_id, raw FROM employees
    WHERE company_id = ${companyId}
    ORDER BY COALESCE(raw->>'first_name', raw->>'last_name', raw->>'email', '') ASC
  `;
  return (result.rows ?? []).map((r) => {
    const row = r as { hcp_id: string; raw: Record<string, unknown> };
    const raw = row.raw ?? {};
    const first = String(raw.first_name ?? raw.firstName ?? "").trim();
    const last = String(raw.last_name ?? raw.lastName ?? "").trim();
    const name = [first, last].filter(Boolean).join(" ").trim()
      || String(raw.email ?? raw.email_address ?? row.hcp_id ?? "Unknown");
    return { id: row.hcp_id, name };
  });
}

/** Find HCP employee id by email for a company. Matches raw->>'email' or raw->>'email_address'. */
export async function getEmployeeHcpIdByEmail(
  companyId: string,
  email: string
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const result = await sql`
    SELECT hcp_id FROM employees
    WHERE company_id = ${companyId}
    AND (
      LOWER(COALESCE(raw->>'email', '')) = ${normalized}
      OR LOWER(COALESCE(raw->>'email_address', '')) = ${normalized}
    )
    LIMIT 1
  `;
  const row = result.rows?.[0] as { hcp_id: string } | undefined;
  return row?.hcp_id ?? null;
}

export async function getProsFromDb(
  companyId: string
): Promise<Record<string, unknown>[]> {
  const result = await sql`
    SELECT raw FROM pros
    WHERE company_id = ${companyId}
  `;
  return (result.rows ?? []).map((r) => (r as { raw: Record<string, unknown> }).raw);
}

export async function getLastSyncAt(
  companyId: string,
  entityType: string
): Promise<Date | null> {
  const result = await sql`
    SELECT last_sync_at FROM sync_state
    WHERE company_id = ${companyId} AND entity_type = ${entityType}
  `;
  const row = result.rows?.[0];
  return row ? new Date((row as { last_sync_at: string }).last_sync_at) : null;
}

/** Get technician photo URLs by organization and HCP employee IDs. Returns map of hcp_employee_id -> photo_url. */
export async function getTechnicianPhotos(
  organizationId: string,
  technicianIds: string[]
): Promise<Record<string, string>> {
  if (technicianIds.length === 0) return {};
  const idSet = new Set(technicianIds);
  const result = await sql`
    SELECT hcp_employee_id, photo_url FROM technician_profiles
    WHERE organization_id = ${organizationId}
    AND photo_url IS NOT NULL AND photo_url != ''
  `;
  const map: Record<string, string> = {};
  for (const row of result.rows ?? []) {
    const r = row as { hcp_employee_id: string; photo_url: string };
    if (idSet.has(r.hcp_employee_id) && r.photo_url) map[r.hcp_employee_id] = r.photo_url;
  }
  return map;
}

/** Upsert technician photo URL. Used after upload. */
export async function upsertTechnicianPhoto(
  organizationId: string,
  hcpEmployeeId: string,
  photoUrl: string
): Promise<void> {
  await sql`
    INSERT INTO technician_profiles (organization_id, hcp_employee_id, photo_url, updated_at)
    VALUES (${organizationId}, ${hcpEmployeeId}, ${photoUrl}, NOW())
    ON CONFLICT (organization_id, hcp_employee_id)
    DO UPDATE SET photo_url = ${photoUrl}, updated_at = NOW()
  `;
}

// CSR selections - admin picks which employees appear in CSR KPIs / Call Insights
export async function getCsrSelections(organizationId: string): Promise<string[]> {
  const result = await sql`
    SELECT hcp_employee_id FROM csr_selections
    WHERE organization_id = ${organizationId}::uuid
  `;
  return (result.rows ?? []).map((r) => (r as { hcp_employee_id: string }).hcp_employee_id);
}

export async function setCsrSelections(
  organizationId: string,
  hcpEmployeeIds: string[]
): Promise<void> {
  await sql`DELETE FROM csr_selections WHERE organization_id = ${organizationId}::uuid`;
  for (const id of hcpEmployeeIds) {
    if (!id || typeof id !== "string") continue;
    await sql`
      INSERT INTO csr_selections (organization_id, hcp_employee_id)
      VALUES (${organizationId}::uuid, ${id.trim()})
    `;
  }
}

/** Returns { id, name } for employees + pros, for CSR selector. */
export async function getEmployeesAndProsForCsrSelector(
  companyId: string
): Promise<{ id: string; name: string }[]> {
  const seen = new Set<string>();
  const list: { id: string; name: string }[] = [];

  const empResult = await sql`
    SELECT hcp_id, raw FROM employees
    WHERE company_id = ${companyId}
    ORDER BY COALESCE(raw->>'first_name', raw->>'last_name', raw->>'email', '') ASC
  `;
  for (const row of empResult.rows ?? []) {
    const r = row as { hcp_id: string; raw: Record<string, unknown> };
    if (seen.has(r.hcp_id)) continue;
    seen.add(r.hcp_id);
    const raw = r.raw ?? {};
    const first = String(raw.first_name ?? raw.firstName ?? "").trim();
    const last = String(raw.last_name ?? raw.lastName ?? "").trim();
    const name = [first, last].filter(Boolean).join(" ").trim()
      || String(raw.email ?? raw.email_address ?? r.hcp_id ?? "Unknown");
    list.push({ id: r.hcp_id, name });
  }

  const prosResult = await sql`
    SELECT hcp_id, raw FROM pros
    WHERE company_id = ${companyId}
    ORDER BY COALESCE(raw->>'first_name', raw->>'last_name', raw->>'email', '') ASC
  `;
  for (const row of prosResult.rows ?? []) {
    const r = row as { hcp_id: string; raw: Record<string, unknown> };
    if (seen.has(r.hcp_id)) continue;
    seen.add(r.hcp_id);
    const raw = r.raw ?? {};
    const first = String(raw.first_name ?? raw.firstName ?? "").trim();
    const last = String(raw.last_name ?? raw.lastName ?? "").trim();
    const name = [first, last].filter(Boolean).join(" ").trim()
      || String(raw.email ?? raw.email_address ?? r.hcp_id ?? "Unknown");
    list.push({ id: r.hcp_id, name });
  }

  list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmployeeInviteCandidate = {
  hcpEmployeeId: string;
  displayName: string;
  /** Lowercase normalized email when valid; null if missing or invalid */
  email: string | null;
  source: "employee" | "pro";
  /** No usable email on the synced HCP record */
  missingEmail: boolean;
  /** Matches an existing org user by email or linked HCP employee id */
  alreadyInOrg: boolean;
};

/**
 * Employees and pros synced from Housecall Pro for this org, with emails from their HCP profile.
 * Used to suggest who can receive an invite (excludes people already in the org).
 */
export async function getEmployeeInviteCandidates(organizationId: string): Promise<EmployeeInviteCandidate[]> {
  const org = await getOrganizationById(organizationId);
  const companyId = org?.hcp_company_id?.trim();
  if (!companyId) return [];

  const users = await getUsersByOrganizationId(organizationId);
  const userEmails = new Set(users.map((u) => u.email.trim().toLowerCase()));
  const userHcpIds = new Set(
    users.map((u) => u.hcp_employee_id?.trim()).filter((id): id is string => !!id && id.length > 0)
  );

  const candidates: EmployeeInviteCandidate[] = [];
  const seenHcp = new Set<string>();

  function pushRow(
    row: { hcp_id: string; raw: Record<string, unknown> },
    source: "employee" | "pro"
  ) {
    const hcpEmployeeId = String(row.hcp_id ?? "").trim();
    if (!hcpEmployeeId || seenHcp.has(hcpEmployeeId)) return;
    seenHcp.add(hcpEmployeeId);

    const raw = row.raw ?? {};
    const rawEmail = String(raw.email ?? raw.email_address ?? raw.emailAddress ?? "").trim();
    const normalized = rawEmail.toLowerCase();
    const hasValidEmail = normalized.length > 0 && SIMPLE_EMAIL_RE.test(normalized);
    const email = hasValidEmail ? normalized : null;

    const first = String(raw.first_name ?? raw.firstName ?? "").trim();
    const last = String(raw.last_name ?? raw.lastName ?? "").trim();
    const displayName =
      [first, last].filter(Boolean).join(" ").trim() ||
      rawEmail ||
      hcpEmployeeId;

    const missingEmail = !hasValidEmail;
    const alreadyInOrg =
      (hasValidEmail && userEmails.has(normalized)) || userHcpIds.has(hcpEmployeeId);

    candidates.push({
      hcpEmployeeId,
      displayName,
      email,
      source,
      missingEmail,
      alreadyInOrg,
    });
  }

  const empResult = await sql`
    SELECT hcp_id, raw FROM employees
    WHERE company_id = ${companyId}
    ORDER BY COALESCE(raw->>'first_name', raw->>'last_name', raw->>'email', '') ASC
  `;
  for (const row of empResult.rows ?? []) {
    pushRow(row as { hcp_id: string; raw: Record<string, unknown> }, "employee");
  }

  const prosResult = await sql`
    SELECT hcp_id, raw FROM pros
    WHERE company_id = ${companyId}
    ORDER BY COALESCE(raw->>'first_name', raw->>'last_name', raw->>'email', '') ASC
  `;
  for (const row of prosResult.rows ?? []) {
    pushRow(row as { hcp_id: string; raw: Record<string, unknown> }, "pro");
  }

  candidates.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));
  return candidates;
}

// Auth queries
export async function getOrganizationsCount(): Promise<number> {
  const result = await sql`SELECT COUNT(*)::int as count FROM organizations`;
  return (result.rows?.[0] as { count: number })?.count ?? 0;
}

export type OrganizationRow = {
  id: string;
  name: string;
  hcp_access_token: string | null;
  hcp_webhook_secret: string | null;
  hcp_company_id: string | null;
  logo_url: string | null;
  trial_ends_at: string | null;
  website: string | null;
  seo_business_name: string | null;
  seo_domain: string | null;
  seo_include_ai_mode: boolean | null;
  pulse_email_enabled: boolean;
  pulse_daily_enabled: boolean;
  pulse_weekly_enabled: boolean;
  pulse_recipient_emails: string | null;
  pulse_daily_recipient_emails: string | null;
  pulse_weekly_recipient_emails: string | null;
  pulse_timezone: string;
  pulse_last_daily_ymd: string | null;
  pulse_last_weekly_end_ymd: string | null;
  created_at: string;
  updated_at: string;
};

export async function getOrganizationById(id: string) {
  const result = await sql`
    SELECT id, name, hcp_access_token, hcp_webhook_secret, hcp_company_id, logo_url, trial_ends_at, website, seo_business_name, seo_domain, seo_include_ai_mode,
      COALESCE(pulse_email_enabled, false) AS pulse_email_enabled,
      COALESCE(pulse_daily_enabled, false) AS pulse_daily_enabled,
      COALESCE(pulse_weekly_enabled, false) AS pulse_weekly_enabled,
      pulse_recipient_emails,
      pulse_daily_recipient_emails,
      pulse_weekly_recipient_emails,
      COALESCE(NULLIF(TRIM(pulse_timezone), ''), 'America/Denver') AS pulse_timezone,
      pulse_last_daily_ymd,
      pulse_last_weekly_end_ymd,
      created_at, updated_at
    FROM organizations WHERE id = ${id}
  `;
  return result.rows?.[0] as OrganizationRow | undefined;
}

export async function upsertOrganizationLogo(organizationId: string, logoUrl: string): Promise<void> {
  await sql`
    UPDATE organizations SET logo_url = ${logoUrl}, updated_at = NOW()
    WHERE id = ${organizationId}::uuid
  `;
}

export async function getOrganizationsWithTokens() {
  const result = await sql`
    SELECT id, name, hcp_company_id, hcp_access_token
    FROM organizations
    WHERE hcp_access_token IS NOT NULL AND hcp_access_token != ''
  `;
  return result.rows as { id: string; name: string; hcp_company_id: string | null; hcp_access_token: string }[];
}

/** Organizations that have SEO configured: website + at least one keyword and one location. */
export async function getOrganizationsWithSeoConfig() {
  const result = await sql`
    SELECT DISTINCT o.id
    FROM organizations o
    WHERE o.website IS NOT NULL AND o.website != ''
      AND EXISTS (SELECT 1 FROM seo_config kw WHERE kw.organization_id = o.id AND kw.config_type = 'keywords')
      AND EXISTS (SELECT 1 FROM seo_config loc WHERE loc.organization_id = o.id AND loc.config_type = 'locations')
  `;
  return (result.rows ?? []).map((r) => (r as { id: string }).id);
}

export async function getOrganizationByHcpCompanyId(hcpCompanyId: string) {
  const result = await sql`
    SELECT id, name, hcp_access_token, hcp_webhook_secret, hcp_company_id
    FROM organizations
    WHERE hcp_company_id = ${hcpCompanyId}
  `;
  return result.rows?.[0] as { id: string; name: string; hcp_access_token: string | null; hcp_webhook_secret: string | null; hcp_company_id: string | null } | undefined;
}

export async function createOrganization(params: {
  name: string;
  hcp_access_token?: string | null;
  hcp_webhook_secret?: string | null;
  hcp_company_id?: string | null;
  trial_ends_at?: Date | string | null;
}) {
  const result = await sql`
    INSERT INTO organizations (name, hcp_access_token, hcp_webhook_secret, hcp_company_id, trial_ends_at, updated_at)
    VALUES (${params.name}, ${params.hcp_access_token ?? null}, ${params.hcp_webhook_secret ?? null}, ${params.hcp_company_id ?? null}, ${params.trial_ends_at ?? null}, NOW())
    RETURNING id, name, hcp_company_id
  `;
  return result.rows?.[0] as { id: string; name: string; hcp_company_id: string | null };
}

export async function updateOrganizationSettings(
  id: string,
  params: { hcp_access_token?: string | null; hcp_webhook_secret?: string | null; hcp_company_id?: string | null }
) {
  await sql`
    UPDATE organizations
    SET
      hcp_access_token = COALESCE(${params.hcp_access_token}, hcp_access_token),
      hcp_webhook_secret = COALESCE(${params.hcp_webhook_secret}, hcp_webhook_secret),
      hcp_company_id = COALESCE(${params.hcp_company_id}, hcp_company_id),
      updated_at = NOW()
    WHERE id = ${id}
  `;
}

export async function updateOrganizationSeoSettings(
  id: string,
  params: { website?: string | null; seo_business_name?: string | null; seo_domain?: string | null; seo_include_ai_mode?: boolean | null }
) {
  if (params.website !== undefined) {
    await sql`
      UPDATE organizations SET website = ${params.website?.trim() || null}, updated_at = NOW() WHERE id = ${id}
    `;
  }
  if (params.seo_business_name !== undefined) {
    await sql`
      UPDATE organizations SET seo_business_name = ${params.seo_business_name?.trim() || null}, updated_at = NOW() WHERE id = ${id}
    `;
  }
  if (params.seo_domain !== undefined) {
    await sql`
      UPDATE organizations SET seo_domain = ${params.seo_domain?.trim() || null}, updated_at = NOW() WHERE id = ${id}
    `;
  }
  if (params.seo_include_ai_mode !== undefined) {
    await sql`
      UPDATE organizations SET seo_include_ai_mode = ${params.seo_include_ai_mode}, updated_at = NOW() WHERE id = ${id}
    `;
  }
}

export async function updateOrganizationPulseSettings(
  id: string,
  params: {
    pulse_email_enabled?: boolean;
    pulse_daily_enabled?: boolean;
    pulse_weekly_enabled?: boolean;
    pulse_recipient_emails?: string | null; // legacy override list (pre-split)
    pulse_daily_recipient_emails?: string | null;
    pulse_weekly_recipient_emails?: string | null;
    pulse_timezone?: string | null;
  }
) {
  if (params.pulse_email_enabled !== undefined) {
    await sql`
      UPDATE organizations SET pulse_email_enabled = ${params.pulse_email_enabled}, updated_at = NOW() WHERE id = ${id}
    `;
  }
  if (params.pulse_daily_enabled !== undefined) {
    await sql`
      UPDATE organizations SET pulse_daily_enabled = ${params.pulse_daily_enabled}, updated_at = NOW() WHERE id = ${id}
    `;
  }
  if (params.pulse_weekly_enabled !== undefined) {
    await sql`
      UPDATE organizations SET pulse_weekly_enabled = ${params.pulse_weekly_enabled}, updated_at = NOW() WHERE id = ${id}
    `;
  }
  if (params.pulse_recipient_emails !== undefined) {
    await sql`
      UPDATE organizations SET pulse_recipient_emails = ${params.pulse_recipient_emails}, updated_at = NOW() WHERE id = ${id}
    `;
  }
  if (params.pulse_daily_recipient_emails !== undefined) {
    await sql`
      UPDATE organizations SET pulse_daily_recipient_emails = ${params.pulse_daily_recipient_emails}, updated_at = NOW() WHERE id = ${id}
    `;
  }
  if (params.pulse_weekly_recipient_emails !== undefined) {
    await sql`
      UPDATE organizations SET pulse_weekly_recipient_emails = ${params.pulse_weekly_recipient_emails}, updated_at = NOW() WHERE id = ${id}
    `;
  }
  if (params.pulse_timezone !== undefined) {
    const tz = params.pulse_timezone?.trim() || "America/Denver";
    await sql`
      UPDATE organizations SET pulse_timezone = ${tz}, updated_at = NOW() WHERE id = ${id}
    `;
  }
}

export async function markPulseDailySent(organizationId: string, ymd: string): Promise<void> {
  await sql`
    UPDATE organizations SET pulse_last_daily_ymd = ${ymd}, updated_at = NOW() WHERE id = ${organizationId}::uuid
  `;
}

export async function markPulseWeeklySent(organizationId: string, endYmd: string): Promise<void> {
  await sql`
    UPDATE organizations SET pulse_last_weekly_end_ymd = ${endYmd}, updated_at = NOW() WHERE id = ${organizationId}::uuid
  `;
}

export async function getOrganizationIdsForPulseDaily(): Promise<string[]> {
  const result = await sql`
    SELECT id::text AS id FROM organizations
    WHERE COALESCE(pulse_email_enabled, false) = true AND COALESCE(pulse_daily_enabled, false) = true
  `;
  return (result.rows ?? []).map((r) => (r as { id: string }).id);
}

export async function getOrganizationIdsForPulseWeekly(): Promise<string[]> {
  const result = await sql`
    SELECT id::text AS id FROM organizations
    WHERE COALESCE(pulse_email_enabled, false) = true AND COALESCE(pulse_weekly_enabled, false) = true
  `;
  return (result.rows ?? []).map((r) => (r as { id: string }).id);
}

export async function getSeoConfig(organizationId: string) {
  const result = await sql`
    SELECT config_type, value, sort_order
    FROM seo_config
    WHERE organization_id = ${organizationId}::uuid
    ORDER BY config_type, sort_order ASC
  `;
  const rows = (result.rows ?? []) as { config_type: string; value: string; sort_order: number }[];
  return {
    keywords: rows.filter((r) => r.config_type === "keywords").map((r) => r.value),
    locations: rows.filter((r) => r.config_type === "locations").map((r) => r.value),
  };
}

export async function setSeoConfig(
  organizationId: string,
  params: { keywords?: string[]; locations?: string[] }
) {
  await sql`DELETE FROM seo_config WHERE organization_id = ${organizationId}::uuid`;
  const inserts: { config_type: string; value: string; sort_order: number }[] = [];
  (params.keywords ?? []).forEach((v, i) => inserts.push({ config_type: "keywords", value: v, sort_order: i }));
  (params.locations ?? []).forEach((v, i) => inserts.push({ config_type: "locations", value: String(v), sort_order: i }));
  for (const row of inserts) {
    await sql`
      INSERT INTO seo_config (organization_id, config_type, value, sort_order)
      VALUES (${organizationId}::uuid, ${row.config_type}, ${row.value}, ${row.sort_order})
    `;
  }
}

export interface SeoServiceArea {
  id: string;
  organization_id: string;
  name: string;
  sort_order: number;
  location_values: string[];
}

export async function getSeoServiceAreas(organizationId: string): Promise<SeoServiceArea[]> {
  const areasResult = await sql`
    SELECT id, organization_id, name, sort_order
    FROM seo_service_areas
    WHERE organization_id = ${organizationId}::uuid
    ORDER BY sort_order ASC, name ASC
  `;
  const areas = (areasResult.rows ?? []) as { id: string; organization_id: string; name: string; sort_order: number }[];
  const out: SeoServiceArea[] = [];
  for (const a of areas) {
    const locResult = await sql`
      SELECT location_value FROM seo_service_area_locations
      WHERE service_area_id = ${a.id}::uuid
      ORDER BY sort_order ASC
    `;
    const locs = (locResult.rows ?? []).map((r) => (r as { location_value: string }).location_value);
    out.push({ ...a, location_values: locs });
  }
  return out;
}

export async function setSeoServiceAreas(
  organizationId: string,
  areas: { id?: string; name: string; location_values: string[] }[]
): Promise<void> {
  const existing = await getSeoServiceAreas(organizationId);
  const existingIds = new Set(existing.map((e) => e.id));
  const keepIds = new Set<string>();

  for (const area of areas) {
    const id = area.id && existingIds.has(area.id) ? area.id : crypto.randomUUID();
    keepIds.add(id);
    if (!area.id || !existingIds.has(area.id)) {
      await sql`
        INSERT INTO seo_service_areas (id, organization_id, name, sort_order)
        VALUES (${id}::uuid, ${organizationId}::uuid, ${area.name}, 0)
      `;
    } else {
      await sql`
        UPDATE seo_service_areas SET name = ${area.name} WHERE id = ${id}::uuid
      `;
    }
    await sql`DELETE FROM seo_service_area_locations WHERE service_area_id = ${id}::uuid`;
    for (let i = 0; i < area.location_values.length; i++) {
      await sql`
        INSERT INTO seo_service_area_locations (service_area_id, location_value, sort_order)
        VALUES (${id}::uuid, ${area.location_values[i]}, ${i})
      `;
    }
  }

  for (const e of existing) {
    if (!keepIds.has(e.id)) {
      await sql`DELETE FROM seo_service_areas WHERE id = ${e.id}::uuid`;
    }
  }
}

export async function getLatestSeoResults(
  organizationId: string,
  configFingerprint: string
): Promise<{ payload: Record<string, unknown>; snapshot_at: string } | null> {
  const result = await sql`
    SELECT payload, snapshot_at
    FROM seo_results_cache
    WHERE organization_id = ${organizationId}::uuid
      AND config_fingerprint = ${configFingerprint}
      AND snapshot_at >= NOW() - INTERVAL '7 days'
    ORDER BY snapshot_at DESC
    LIMIT 1
  `;
  const row = (result.rows ?? [])[0] as { payload: Record<string, unknown>; snapshot_at: string } | undefined;
  return row ?? null;
}

export async function insertSeoResults(
  organizationId: string,
  configFingerprint: string,
  payload: Record<string, unknown>
): Promise<void> {
  await sql`
    INSERT INTO seo_results_cache (organization_id, config_fingerprint, payload)
    VALUES (${organizationId}::uuid, ${configFingerprint}, ${JSON.stringify(payload)}::jsonb)
  `;
}

export async function invalidateSeoCache(organizationId: string): Promise<void> {
  await sql`
    DELETE FROM seo_results_cache
    WHERE organization_id = ${organizationId}::uuid
  `;
}

export interface SeoFetchProgress {
  chunk_index: number;
  total_combos: number;
  combos_per_chunk: number;
  partial_organic: unknown[];
  partial_local: unknown[];
  partial_ai: unknown[];
}

export async function getSeoFetchProgress(
  organizationId: string,
  configFingerprint: string
): Promise<SeoFetchProgress | null> {
  const result = await sql`
    SELECT chunk_index, total_combos, combos_per_chunk, partial_organic, partial_local, partial_ai
    FROM seo_fetch_progress
    WHERE organization_id = ${organizationId}::uuid
      AND config_fingerprint = ${configFingerprint}
  `;
  const row = (result.rows ?? [])[0] as SeoFetchProgress | undefined;
  return row ?? null;
}

export async function upsertSeoFetchProgress(
  organizationId: string,
  configFingerprint: string,
  params: {
    chunk_index: number;
    total_combos: number;
    combos_per_chunk: number;
    partial_organic: unknown[];
    partial_local: unknown[];
    partial_ai: unknown[];
  }
): Promise<void> {
  await sql`
    INSERT INTO seo_fetch_progress (
      organization_id, config_fingerprint, chunk_index, total_combos, combos_per_chunk,
      partial_organic, partial_local, partial_ai, updated_at
    )
    VALUES (
      ${organizationId}::uuid,
      ${configFingerprint},
      ${params.chunk_index},
      ${params.total_combos},
      ${params.combos_per_chunk},
      ${JSON.stringify(params.partial_organic)}::jsonb,
      ${JSON.stringify(params.partial_local)}::jsonb,
      ${JSON.stringify(params.partial_ai)}::jsonb,
      NOW()
    )
    ON CONFLICT (organization_id, config_fingerprint) DO UPDATE SET
      chunk_index = EXCLUDED.chunk_index,
      partial_organic = EXCLUDED.partial_organic,
      partial_local = EXCLUDED.partial_local,
      partial_ai = EXCLUDED.partial_ai,
      updated_at = NOW()
  `;
}

export async function deleteSeoFetchProgress(
  organizationId: string,
  configFingerprint: string
): Promise<void> {
  await sql`
    DELETE FROM seo_fetch_progress
    WHERE organization_id = ${organizationId}::uuid
      AND config_fingerprint = ${configFingerprint}
  `;
}

export async function getLocationsCache(cacheKey: string): Promise<unknown[] | null> {
  const result = await sql`
    SELECT payload
    FROM seo_locations_cache
    WHERE cache_key = ${cacheKey}
      AND cached_at >= NOW() - INTERVAL '7 days'
  `;
  const row = (result.rows ?? [])[0] as { payload: unknown } | undefined;
  if (!row?.payload) return null;
  return Array.isArray(row.payload) ? row.payload : null;
}

export async function setLocationsCache(cacheKey: string, payload: unknown[]): Promise<void> {
  await sql`
    INSERT INTO seo_locations_cache (cache_key, payload)
    VALUES (${cacheKey}, ${JSON.stringify(payload)}::jsonb)
    ON CONFLICT (cache_key) DO UPDATE SET
      payload = EXCLUDED.payload,
      cached_at = NOW()
  `;
}

export type UserAuthRow = {
  id: string;
  email: string;
  password_hash: string | null;
  organization_id: string | null;
  role: string;
  hcp_employee_id: string | null;
  org_name: string | null;
  hcp_company_id: string | null;
  org_logo_url: string | null;
  two_factor_enabled: boolean;
  two_factor_channel: string | null;
  phone_e164: string | null;
  two_factor_sms_verified: boolean;
  two_factor_email_verified: boolean;
};

export async function getUserByEmail(email: string) {
  const result = await sql`
    SELECT u.id, u.email, u.password_hash, u.organization_id, u.role, u.hcp_employee_id, o.name as org_name, o.hcp_company_id, o.logo_url as org_logo_url,
      COALESCE(u.two_factor_enabled, false) AS two_factor_enabled,
      u.two_factor_channel,
      u.phone_e164,
      COALESCE(u.two_factor_sms_verified, false) AS two_factor_sms_verified,
      COALESCE(u.two_factor_email_verified, false) AS two_factor_email_verified
    FROM users u
    LEFT JOIN organizations o ON o.id = u.organization_id
    WHERE LOWER(u.email) = LOWER(${email})
  `;
  return result.rows?.[0] as UserAuthRow | undefined;
}

export async function getUserById(id: string) {
  const result = await sql`
    SELECT u.id, u.email, u.password_hash, u.organization_id, u.role, u.hcp_employee_id, o.name as org_name, o.hcp_company_id, o.logo_url as org_logo_url,
      COALESCE(u.two_factor_enabled, false) AS two_factor_enabled,
      u.two_factor_channel,
      u.phone_e164,
      COALESCE(u.two_factor_sms_verified, false) AS two_factor_sms_verified,
      COALESCE(u.two_factor_email_verified, false) AS two_factor_email_verified
    FROM users u
    LEFT JOIN organizations o ON o.id = u.organization_id
    WHERE u.id = ${id}::uuid
  `;
  return result.rows?.[0] as UserAuthRow | undefined;
}

export async function updateUserTwoFactorSettings(
  userId: string,
  params: {
    two_factor_enabled?: boolean;
    two_factor_channel?: "sms" | "email" | null;
    phone_e164?: string | null;
    two_factor_sms_verified?: boolean;
    two_factor_email_verified?: boolean;
  }
) {
  if (params.two_factor_enabled !== undefined) {
    await sql`
      UPDATE users SET two_factor_enabled = ${params.two_factor_enabled} WHERE id = ${userId}::uuid
    `;
  }
  if (params.two_factor_channel !== undefined) {
    await sql`
      UPDATE users SET two_factor_channel = ${params.two_factor_channel} WHERE id = ${userId}::uuid
    `;
  }
  if (params.phone_e164 !== undefined) {
    await sql`
      UPDATE users SET phone_e164 = ${params.phone_e164} WHERE id = ${userId}::uuid
    `;
  }
  if (params.two_factor_sms_verified !== undefined) {
    await sql`
      UPDATE users SET two_factor_sms_verified = ${params.two_factor_sms_verified} WHERE id = ${userId}::uuid
    `;
  }
  if (params.two_factor_email_verified !== undefined) {
    await sql`
      UPDATE users SET two_factor_email_verified = ${params.two_factor_email_verified} WHERE id = ${userId}::uuid
    `;
  }
}

export async function createUser(params: {
  email: string;
  password_hash: string;
  organization_id: string;
  role: "admin" | "employee" | "salesman" | "investor";
  hcp_employee_id?: string | null;
  two_factor_enabled?: boolean;
  two_factor_channel?: "sms" | "email" | null;
  phone_e164?: string | null;
  two_factor_sms_verified?: boolean;
  two_factor_email_verified?: boolean;
}) {
  const result = await sql`
    INSERT INTO users (
      email,
      password_hash,
      organization_id,
      role,
      hcp_employee_id,
      two_factor_enabled,
      two_factor_channel,
      phone_e164,
      two_factor_sms_verified,
      two_factor_email_verified
    )
    VALUES (
      ${params.email},
      ${params.password_hash},
      ${params.organization_id},
      ${params.role},
      ${params.hcp_employee_id ?? null},
      ${params.two_factor_enabled ?? false},
      ${params.two_factor_channel ?? null},
      ${params.phone_e164 ?? null},
      ${params.two_factor_sms_verified ?? false},
      ${params.two_factor_email_verified ?? false}
    )
    RETURNING id, email, organization_id, role, hcp_employee_id
  `;
  return result.rows?.[0] as { id: string; email: string; organization_id: string; role: string; hcp_employee_id: string | null };
}

export async function getUsersByOrganizationId(organizationId: string) {
  const result = await sql`
    SELECT id, email, role, hcp_employee_id, created_at
    FROM users
    WHERE organization_id = ${organizationId}
    ORDER BY created_at ASC
  `;
  return result.rows as { id: string; email: string; role: string; hcp_employee_id: string | null; created_at: string }[];
}

export async function deleteUser(id: string, organizationId: string) {
  await sql`
    DELETE FROM users
    WHERE id = ${id} AND organization_id = ${organizationId}
  `;
}

export type PermissionKey =
  | "dashboard"
  | "timesheets"
  | "call_insights"
  | "time_insights"
  | "profit"
  | "marketing"
  | "performance_pay"
  | "users"
  | "settings"
  | "billing"
  | "developer_console"
  | "can_edit";

export type UserPermissions = Record<PermissionKey, boolean>;

const PERMISSION_KEYS: PermissionKey[] = [
  "dashboard",
  "timesheets",
  "call_insights",
  "time_insights",
  "profit",
  "marketing",
  "performance_pay",
  "users",
  "settings",
  "billing",
  "developer_console",
  "can_edit",
];

function isOfficeStaffRole(role: unknown): boolean {
  const r = (role ?? "").toString().toLowerCase().replace(/\s+/g, " ");
  return ["office staff", "office_staff", "officestaff"].some(
    (o) => r === o || (r.includes("office") && r.includes("staff"))
  );
}

export async function getEmployeeHcpRole(
  companyId: string,
  hcpId: string
): Promise<"technician" | "office_staff" | null> {
  const result = await sql`
    SELECT raw->>'role' as role, raw->>'employee_type' as employee_type
    FROM employees
    WHERE company_id = ${companyId} AND hcp_id = ${hcpId}
    LIMIT 1
  `;
  const row = (result.rows ?? [])[0] as { role?: string; employee_type?: string } | undefined;
  if (!row) return null;
  const r = row.role ?? row.employee_type ?? "";
  return isOfficeStaffRole(r) ? "office_staff" : "technician";
}

export function getDefaultPermissionsForRole(
  role: string,
  isCsr: boolean
): UserPermissions {
  const allFalse = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false])) as UserPermissions;
  if (role === "admin") {
    return {
      ...allFalse,
      dashboard: true,
      timesheets: true,
      call_insights: true,
      time_insights: true,
      profit: true,
      marketing: true,
      performance_pay: true,
      users: true,
      settings: true,
      billing: true,
      developer_console: true,
      can_edit: true,
    };
  }
  if (role === "investor") {
    return {
      ...allFalse,
      dashboard: true,
      timesheets: true,
      call_insights: true,
      time_insights: true,
      profit: true,
      marketing: true,
      performance_pay: true,
      users: true,
      billing: true,
      developer_console: true,
      can_edit: false,
    };
  }
  if (role === "employee" || role === "salesman") {
    const base = { ...allFalse, dashboard: true, timesheets: false, can_edit: true };
    if (isCsr) {
      base.call_insights = true;
    }
    return base;
  }
  return { ...allFalse, dashboard: true };
}

export async function getUserPermissions(userId: string): Promise<UserPermissions> {
  const result = await sql`
    SELECT permissions FROM user_permissions WHERE user_id = ${userId}::uuid
  `;
  const row = (result.rows ?? [])[0] as { permissions: Record<string, unknown> } | undefined;
  if (row?.permissions && typeof row.permissions === "object") {
    const stored = row.permissions as Record<string, boolean>;
    const out = {} as UserPermissions;
    for (const k of PERMISSION_KEYS) {
      out[k] = stored[k] === true;
    }
    return out;
  }
  const userResult = await sql`
    SELECT u.role, u.hcp_employee_id, o.hcp_company_id
    FROM users u
    LEFT JOIN organizations o ON o.id = u.organization_id
    WHERE u.id = ${userId}::uuid
  `;
  const userRow = (userResult.rows ?? [])[0] as {
    role: string;
    hcp_employee_id: string | null;
    hcp_company_id: string | null;
  } | undefined;
  if (!userRow) return getDefaultPermissionsForRole("employee", false);

  let isCsr = false;
  if (userRow.role === "employee" && userRow.hcp_employee_id && userRow.hcp_company_id) {
    const hcpRole = await getEmployeeHcpRole(userRow.hcp_company_id, userRow.hcp_employee_id);
    isCsr = hcpRole === "office_staff";
  }

  return getDefaultPermissionsForRole(userRow.role, isCsr);
}

export async function setUserPermissions(
  userId: string,
  permissions: Partial<UserPermissions>
): Promise<void> {
  const current = await getUserPermissions(userId);
  const merged = { ...current, ...permissions };
  await sql`
    INSERT INTO user_permissions (user_id, permissions)
    VALUES (${userId}::uuid, ${JSON.stringify(merged)}::jsonb)
    ON CONFLICT (user_id) DO UPDATE SET permissions = EXCLUDED.permissions
  `;
}

// Password reset tokens
export async function createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date) {
  await sql`
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES (${userId}, ${tokenHash}, ${expiresAt.toISOString()})
  `;
}

export interface PasswordResetTokenRow {
  id: string;
  user_id: string;
  expires_at: string;
}

export async function findValidPasswordResetToken(
  tokenHash: string
): Promise<PasswordResetTokenRow | undefined> {
  const result = await sql`
    SELECT prt.id, prt.user_id, prt.expires_at
    FROM password_reset_tokens prt
    WHERE prt.token_hash = ${tokenHash}
    AND prt.expires_at > NOW()
    LIMIT 1
  `;
  const row = result.rows?.[0];
  return row ? (row as PasswordResetTokenRow) : undefined;
}

export async function deletePasswordResetToken(id: string) {
  await sql`
    DELETE FROM password_reset_tokens WHERE id = ${id}
  `;
}

export async function deletePasswordResetTokensForUser(userId: string) {
  await sql`
    DELETE FROM password_reset_tokens WHERE user_id = ${userId}
  `;
}

export async function updateUserPassword(userId: string, passwordHash: string) {
  await sql`
    UPDATE users SET password_hash = ${passwordHash} WHERE id = ${userId}
  `;
}

// Organization invitations (admin email invite → join org)
export async function getOrganizationUserByEmail(organizationId: string, email: string) {
  const result = await sql`
    SELECT id::text FROM users
    WHERE organization_id = ${organizationId}::uuid AND LOWER(TRIM(email)) = LOWER(TRIM(${email}))
    LIMIT 1
  `;
  return result.rows?.[0] as { id: string } | undefined;
}

export async function deletePendingInvitationsForOrgEmail(organizationId: string, email: string) {
  await sql`
    DELETE FROM organization_invitations
    WHERE organization_id = ${organizationId}::uuid
      AND LOWER(TRIM(email)) = LOWER(TRIM(${email}))
      AND accepted_at IS NULL
  `;
}

export async function createOrganizationInvitation(params: {
  organization_id: string;
  email: string;
  token_hash: string;
  role: "admin" | "employee" | "salesman" | "investor";
  invited_by_user_id: string;
  expires_at: Date;
}) {
  const result = await sql`
    INSERT INTO organization_invitations (
      organization_id, email, token_hash, role, invited_by_user_id, expires_at
    )
    VALUES (
      ${params.organization_id}::uuid,
      ${params.email},
      ${params.token_hash},
      ${params.role},
      ${params.invited_by_user_id}::uuid,
      ${params.expires_at.toISOString()}
    )
    RETURNING id::text
  `;
  return result.rows?.[0] as { id: string };
}

export type OrganizationInvitationRow = {
  id: string;
  organization_id: string;
  email: string;
  role: string;
  expires_at: string;
  org_name: string | null;
};

export async function findValidOrganizationInvitation(
  tokenHash: string
): Promise<OrganizationInvitationRow | undefined> {
  const result = await sql`
    SELECT
      oi.id::text,
      oi.organization_id::text,
      oi.email,
      oi.role,
      oi.expires_at::text,
      o.name AS org_name
    FROM organization_invitations oi
    LEFT JOIN organizations o ON o.id = oi.organization_id
    WHERE oi.token_hash = ${tokenHash}
      AND oi.accepted_at IS NULL
      AND oi.expires_at > NOW()
    LIMIT 1
  `;
  const row = result.rows?.[0];
  return row ? (row as OrganizationInvitationRow) : undefined;
}

export async function deleteOrganizationInvitation(id: string) {
  await sql`DELETE FROM organization_invitations WHERE id = ${id}::uuid`;
}

// Crews (foreman + members by HCP employee id — synced employees/pros, app account not required)
export type CrewMemberRow = {
  hcpEmployeeId: string;
  displayName: string;
};

export type CrewWithMembersRow = {
  id: string;
  name: string;
  foremanHcpEmployeeId: string;
  foremanDisplayName: string;
  members: CrewMemberRow[];
};

export async function assertValidCrewHcpIdsForOrganization(
  organizationId: string,
  hcpEmployeeIds: string[]
): Promise<void> {
  const org = await getOrganizationById(organizationId);
  const companyId = org?.hcp_company_id?.trim();
  if (!companyId) {
    throw new Error("Connect Housecall Pro to manage crews");
  }
  const roster = await getEmployeesAndProsForCsrSelector(companyId);
  const allowed = new Set(roster.map((r) => r.id.trim()).filter(Boolean));
  const unique = [...new Set(hcpEmployeeIds.map((id) => id.trim()).filter(Boolean))];
  for (const id of unique) {
    if (!allowed.has(id)) {
      throw new Error(`"${id}" is not a synced employee or pro for this organization`);
    }
  }
}

async function buildHcpNameMap(organizationId: string): Promise<Map<string, string>> {
  const org = await getOrganizationById(organizationId);
  const companyId = org?.hcp_company_id?.trim();
  if (!companyId) return new Map();
  const roster = await getEmployeesAndProsForCsrSelector(companyId);
  return new Map(roster.map((e) => [e.id.trim(), e.name]));
}

export async function listCrewsWithMembers(organizationId: string): Promise<CrewWithMembersRow[]> {
  const nameByHcp = await buildHcpNameMap(organizationId);
  const crewRows = await sql`
    SELECT c.id::text, c.name, TRIM(c.foreman_hcp_employee_id) AS foreman_hcp
    FROM crews c
    WHERE c.organization_id = ${organizationId}::uuid
    ORDER BY c.name ASC
  `;
  const out: CrewWithMembersRow[] = [];
  for (const row of crewRows.rows ?? []) {
    const r = row as { id: string; name: string; foreman_hcp: string };
    const fh = (r.foreman_hcp ?? "").trim();
    const memRes = await sql`
      SELECT TRIM(hcp_employee_id) AS hid
      FROM crew_members
      WHERE crew_id = ${r.id}::uuid
      ORDER BY hcp_employee_id ASC
    `;
    const memberIds = (memRes.rows ?? [])
      .map((m) => (m as { hid: string }).hid)
      .filter((id): id is string => Boolean(id?.trim()));
    const members: CrewMemberRow[] = memberIds.map((hid) => ({
      hcpEmployeeId: hid,
      displayName: nameByHcp.get(hid) ?? hid,
    }));
    out.push({
      id: r.id,
      name: r.name,
      foremanHcpEmployeeId: fh,
      foremanDisplayName: nameByHcp.get(fh) ?? fh,
      members,
    });
  }
  return out;
}

export async function getCrewById(crewId: string, organizationId: string): Promise<CrewWithMembersRow | null> {
  const nameByHcp = await buildHcpNameMap(organizationId);
  const check = await sql`
    SELECT c.id::text, c.name, TRIM(c.foreman_hcp_employee_id) AS foreman_hcp
    FROM crews c
    WHERE c.id = ${crewId}::uuid AND c.organization_id = ${organizationId}::uuid
    LIMIT 1
  `;
  const row = check.rows?.[0] as { id: string; name: string; foreman_hcp: string } | undefined;
  if (!row) return null;
  const fh = (row.foreman_hcp ?? "").trim();
  const memRes = await sql`
    SELECT TRIM(hcp_employee_id) AS hid
    FROM crew_members
    WHERE crew_id = ${row.id}::uuid
    ORDER BY hcp_employee_id ASC
  `;
  const memberIds = (memRes.rows ?? [])
    .map((m) => (m as { hid: string }).hid)
    .filter((id): id is string => Boolean(id?.trim()));
  const members: CrewMemberRow[] = memberIds.map((hid) => ({
    hcpEmployeeId: hid,
    displayName: nameByHcp.get(hid) ?? hid,
  }));
  return {
    id: row.id,
    name: row.name,
    foremanHcpEmployeeId: fh,
    foremanDisplayName: nameByHcp.get(fh) ?? fh,
    members,
  };
}

export async function createCrew(params: {
  organizationId: string;
  name: string;
  foremanHcpEmployeeId: string;
  memberHcpEmployeeIds: string[];
}): Promise<{ id: string }> {
  const trimmed = params.name.trim();
  if (!trimmed) throw new Error("Crew name is required");
  const foreman = params.foremanHcpEmployeeId.trim();
  if (!foreman) throw new Error("Foreman is required");

  const memberIds = params.memberHcpEmployeeIds.map((x) => x.trim()).filter(Boolean);
  await assertValidCrewHcpIdsForOrganization(params.organizationId, [foreman, ...memberIds]);

  const res = await sql`
    INSERT INTO crews (organization_id, name, foreman_hcp_employee_id)
    VALUES (${params.organizationId}::uuid, ${trimmed}, ${foreman})
    RETURNING id::text
  `;
  const id = (res.rows?.[0] as { id: string }).id;
  const seen = new Set<string>([foreman]);
  for (const hid of memberIds) {
    if (seen.has(hid)) continue;
    seen.add(hid);
    await sql`
      INSERT INTO crew_members (crew_id, hcp_employee_id)
      VALUES (${id}::uuid, ${hid})
      ON CONFLICT (crew_id, hcp_employee_id) DO NOTHING
    `;
  }
  return { id };
}

export async function updateCrew(
  crewId: string,
  organizationId: string,
  params: {
    name?: string;
    foremanHcpEmployeeId?: string;
    memberHcpEmployeeIds?: string[];
  }
): Promise<void> {
  if (
    params.name === undefined &&
    params.foremanHcpEmployeeId === undefined &&
    params.memberHcpEmployeeIds === undefined
  ) {
    return;
  }
  const existing = await getCrewById(crewId, organizationId);
  if (!existing) throw new Error("Crew not found");

  const nextForeman = params.foremanHcpEmployeeId?.trim() ?? existing.foremanHcpEmployeeId;
  const nextMembers =
    params.memberHcpEmployeeIds !== undefined
      ? params.memberHcpEmployeeIds.map((x) => x.trim()).filter(Boolean)
      : existing.members.map((m) => m.hcpEmployeeId);

  if (params.foremanHcpEmployeeId !== undefined || params.memberHcpEmployeeIds !== undefined) {
    await assertValidCrewHcpIdsForOrganization(organizationId, [nextForeman, ...nextMembers]);
  }

  if (params.name !== undefined) {
    const t = params.name.trim();
    if (!t) throw new Error("Crew name is required");
    await sql`UPDATE crews SET name = ${t}, updated_at = NOW() WHERE id = ${crewId}::uuid`;
  }
  if (params.foremanHcpEmployeeId !== undefined) {
    await sql`
      UPDATE crews SET foreman_hcp_employee_id = ${nextForeman}, updated_at = NOW()
      WHERE id = ${crewId}::uuid
    `;
  }
  if (params.memberHcpEmployeeIds !== undefined) {
    await sql`DELETE FROM crew_members WHERE crew_id = ${crewId}::uuid`;
    const seen = new Set<string>([nextForeman]);
    for (const hid of nextMembers) {
      if (seen.has(hid)) continue;
      seen.add(hid);
      await sql`
        INSERT INTO crew_members (crew_id, hcp_employee_id)
        VALUES (${crewId}::uuid, ${hid})
      `;
    }
  }
  await sql`UPDATE crews SET updated_at = NOW() WHERE id = ${crewId}::uuid`;
}

export async function deleteCrew(crewId: string, organizationId: string): Promise<boolean> {
  const res = await sql`
    DELETE FROM crews WHERE id = ${crewId}::uuid AND organization_id = ${organizationId}::uuid
    RETURNING id
  `;
  return (res.rows?.length ?? 0) > 0;
}

// Time entries (timesheets)
export interface TimeEntry {
  id: string;
  organization_id: string;
  hcp_employee_id: string;
  entry_date: string;
  start_time: string | null;
  end_time: string | null;
  hours: number | null;
  job_hcp_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function getTimeEntriesByEmployee(
  organizationId: string,
  hcpEmployeeId: string,
  startDate?: string,
  endDate?: string
): Promise<TimeEntry[]> {
  const start = startDate ?? "1900-01-01";
  const end = endDate ?? "2099-12-31";
  const result = await sql`
    SELECT id, organization_id, hcp_employee_id, entry_date::text, start_time::text, end_time::text, hours::double precision as hours, job_hcp_id, notes, created_at, updated_at
    FROM time_entries
    WHERE organization_id = ${organizationId} AND hcp_employee_id = ${hcpEmployeeId}
    AND entry_date >= ${start}::date AND entry_date <= ${end}::date
    ORDER BY entry_date DESC, start_time DESC NULLS LAST
    LIMIT 500
  `;
  return result.rows as TimeEntry[];
}

/** Admin-only: get all time entries for the org in a date range (all employees) */
export async function getTimeEntriesByOrganization(
  organizationId: string,
  startDate?: string,
  endDate?: string
): Promise<TimeEntry[]> {
  const start = startDate ?? "1900-01-01";
  const end = endDate ?? "2099-12-31";
  const result = await sql`
    SELECT id, organization_id, hcp_employee_id, entry_date::text, start_time::text, end_time::text, hours::double precision as hours, job_hcp_id, notes, created_at, updated_at
    FROM time_entries
    WHERE organization_id = ${organizationId}
    AND entry_date >= ${start}::date AND entry_date <= ${end}::date
    ORDER BY hcp_employee_id ASC, entry_date DESC, start_time DESC NULLS LAST
    LIMIT 2000
  `;
  return result.rows as TimeEntry[];
}

export async function createTimeEntry(params: {
  organization_id: string;
  hcp_employee_id: string;
  entry_date: string;
  start_time?: string | null;
  end_time?: string | null;
  hours?: number | null;
  job_hcp_id?: string | null;
  notes?: string | null;
}): Promise<TimeEntry> {
  const result = await sql`
    INSERT INTO time_entries (organization_id, hcp_employee_id, entry_date, start_time, end_time, hours, job_hcp_id, notes, updated_at)
    VALUES (${params.organization_id}, ${params.hcp_employee_id}, ${params.entry_date}::date, ${params.start_time ?? null}, ${params.end_time ?? null}, ${params.hours ?? null}, ${params.job_hcp_id ?? null}, ${params.notes ?? null}, NOW())
    RETURNING id, organization_id, hcp_employee_id, entry_date::text, start_time::text, end_time::text, hours::double precision as hours, job_hcp_id, notes, created_at, updated_at
  `;
  return result.rows?.[0] as TimeEntry;
}

/** Upsert imported CSV time entry for exact day+employee. */
export async function upsertImportedTimeEntry(params: {
  organization_id: string;
  hcp_employee_id: string;
  entry_date: string;
  hours: number;
  notes?: string | null;
}): Promise<TimeEntry> {
  const note = params.notes ?? "[Imported CSV]";
  const existing = await sql`
    SELECT id
    FROM time_entries
    WHERE organization_id = ${params.organization_id}::uuid
      AND hcp_employee_id = ${params.hcp_employee_id}
      AND entry_date = ${params.entry_date}::date
      AND notes LIKE '[Imported CSV%'
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  const existingId = (existing.rows?.[0] as { id?: string } | undefined)?.id;

  if (existingId) {
    const updated = await sql`
      UPDATE time_entries
      SET
        start_time = NULL,
        end_time = NULL,
        hours = ${params.hours},
        notes = ${note},
        updated_at = NOW()
      WHERE id = ${existingId}::uuid
      RETURNING id, organization_id, hcp_employee_id, entry_date::text, start_time::text, end_time::text, hours::double precision as hours, job_hcp_id, notes, created_at, updated_at
    `;
    return updated.rows?.[0] as TimeEntry;
  }

  const inserted = await sql`
    INSERT INTO time_entries (organization_id, hcp_employee_id, entry_date, start_time, end_time, hours, job_hcp_id, notes, updated_at)
    VALUES (${params.organization_id}::uuid, ${params.hcp_employee_id}, ${params.entry_date}::date, NULL, NULL, ${params.hours}, NULL, ${note}, NOW())
    RETURNING id, organization_id, hcp_employee_id, entry_date::text, start_time::text, end_time::text, hours::double precision as hours, job_hcp_id, notes, created_at, updated_at
  `;
  return inserted.rows?.[0] as TimeEntry;
}

export interface TimesheetImportNameMapping {
  csv_name: string;
  hcp_employee_id: string;
}

export async function getTimesheetImportNameMappings(
  organizationId: string
): Promise<TimesheetImportNameMapping[]> {
  const result = await sql`
    SELECT csv_name, hcp_employee_id
    FROM timesheet_import_name_mappings
    WHERE organization_id = ${organizationId}::uuid
    ORDER BY csv_name ASC
  `;
  return (result.rows ?? []) as TimesheetImportNameMapping[];
}

export async function upsertTimesheetImportNameMapping(params: {
  organization_id: string;
  csv_name: string;
  hcp_employee_id: string;
}): Promise<void> {
  await sql`
    INSERT INTO timesheet_import_name_mappings (organization_id, csv_name, hcp_employee_id, created_at, updated_at)
    VALUES (${params.organization_id}::uuid, ${params.csv_name}, ${params.hcp_employee_id}, NOW(), NOW())
    ON CONFLICT (organization_id, csv_name) DO UPDATE SET
      hcp_employee_id = ${params.hcp_employee_id},
      updated_at = NOW()
  `;
}

export async function updateTimeEntry(
  id: string,
  organizationId: string,
  hcpEmployeeId: string,
  params: { entry_date?: string; start_time?: string | null; end_time?: string | null; hours?: number | null; job_hcp_id?: string | null; notes?: string | null }
): Promise<TimeEntry | null> {
  const result = await sql`
    UPDATE time_entries
    SET
      entry_date = COALESCE(${params.entry_date ?? null}::date, entry_date),
      start_time = COALESCE(${params.start_time ?? null}::time, start_time),
      end_time = COALESCE(${params.end_time ?? null}::time, end_time),
      hours = COALESCE(${params.hours ?? null}, hours),
      job_hcp_id = COALESCE(${params.job_hcp_id ?? null}, job_hcp_id),
      notes = COALESCE(${params.notes ?? null}, notes),
      updated_at = NOW()
    WHERE id = ${id} AND organization_id = ${organizationId} AND hcp_employee_id = ${hcpEmployeeId}
    RETURNING id, organization_id, hcp_employee_id, entry_date::text, start_time::text, end_time::text, hours::double precision as hours, job_hcp_id, notes, created_at, updated_at
  `;
  return (result.rows?.[0] as TimeEntry) ?? null;
}

export async function deleteTimeEntry(id: string, organizationId: string, hcpEmployeeId: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM time_entries
    WHERE id = ${id} AND organization_id = ${organizationId} AND hcp_employee_id = ${hcpEmployeeId}
  `;
  return (result.rowCount ?? 0) > 0;
}

/** Admin-only: update any time entry in the org (no hcp_employee_id check) */
export async function updateTimeEntryForAdmin(
  id: string,
  organizationId: string,
  params: { entry_date?: string; start_time?: string | null; end_time?: string | null; hours?: number | null; job_hcp_id?: string | null; notes?: string | null }
): Promise<TimeEntry | null> {
  const result = await sql`
    UPDATE time_entries
    SET
      entry_date = COALESCE(${params.entry_date ?? null}::date, entry_date),
      start_time = COALESCE(${params.start_time ?? null}::time, start_time),
      end_time = COALESCE(${params.end_time ?? null}::time, end_time),
      hours = COALESCE(${params.hours ?? null}, hours),
      job_hcp_id = COALESCE(${params.job_hcp_id ?? null}, job_hcp_id),
      notes = COALESCE(${params.notes ?? null}, notes),
      updated_at = NOW()
    WHERE id = ${id} AND organization_id = ${organizationId}
    RETURNING id, organization_id, hcp_employee_id, entry_date::text, start_time::text, end_time::text, hours::double precision as hours, job_hcp_id, notes, created_at, updated_at
  `;
  return (result.rows?.[0] as TimeEntry) ?? null;
}

/** Admin-only: delete any time entry in the org (no hcp_employee_id check) */
export async function deleteTimeEntryForAdmin(id: string, organizationId: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM time_entries
    WHERE id = ${id} AND organization_id = ${organizationId}
  `;
  return (result.rowCount ?? 0) > 0;
}

const WEBHOOK_LOG_BODY_MAX_LEN = 512 * 1024; // 512KB to avoid driver/param limits

// Webhook logs (debug)
export async function insertWebhookLog(params: {
  organizationId: string;
  source: string;
  rawBody: string | null;
  headers: Record<string, string>;
  status: "processed" | "skipped" | "received";
  skipReason?: string | null;
}) {
  const rawBody =
    params.rawBody != null && params.rawBody.length > WEBHOOK_LOG_BODY_MAX_LEN
      ? params.rawBody.slice(0, WEBHOOK_LOG_BODY_MAX_LEN) + "\n\n...[truncated]"
      : params.rawBody;
  // #region agent log
  console.log("[WH-DBG] H2 insertWebhookLog DB write", JSON.stringify({ hypothesisId: "H2", organizationId: params.organizationId, source: params.source }));
  // #endregion
  await sql`
    INSERT INTO webhook_logs (organization_id, source, raw_body, headers, status, skip_reason)
    VALUES (
      ${params.organizationId}::uuid,
      ${params.source},
      ${rawBody},
      ${JSON.stringify(params.headers)}::jsonb,
      ${params.status},
      ${params.skipReason ?? null}
    )
  `;
}

export interface WebhookLog {
  id: string;
  organization_id: string;
  source: string;
  raw_body: string | null;
  headers: Record<string, string>;
  status: string;
  skip_reason: string | null;
  created_at: string;
}

export async function getWebhookLogs(organizationId: string, limit = 50): Promise<WebhookLog[]> {
  // #region agent log
  console.log("[WH-DBG] H3 getWebhookLogs query", JSON.stringify({ hypothesisId: "H3", organizationId, limit }));
  // #endregion
  const result = await sql`
    SELECT id, organization_id, source, raw_body, headers, status, skip_reason, created_at
    FROM webhook_logs
    WHERE organization_id = ${organizationId}::uuid
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  const rows = (result.rows ?? []) as WebhookLog[];
  // #region agent log
  console.log("[WH-DBG] H3 getWebhookLogs result", JSON.stringify({ hypothesisId: "H3", organizationId, rowCount: rows.length, firstId: rows[0]?.id }));
  // #endregion
  return rows;
}

export async function getWebhookLogById(
  organizationId: string,
  id: string
): Promise<WebhookLog | null> {
  const result = await sql`
    SELECT id, organization_id, source, raw_body, headers, status, skip_reason, created_at
    FROM webhook_logs
    WHERE organization_id = ${organizationId}::uuid AND id = ${id}::uuid
  `;
  const row = (result.rows ?? [])[0] as WebhookLog | undefined;
  return row ?? null;
}

/** Get webhook forwarding config for an organization. */
export async function getWebhookForwarding(
  organizationId: string
): Promise<{ source: string; enabled: boolean; forward_url: string | null }[]> {
  const result = await sql`
    SELECT source, enabled, forward_url
    FROM webhook_forwarding
    WHERE organization_id = ${organizationId}::uuid
  `;
  return (result.rows ?? []) as { source: string; enabled: boolean; forward_url: string | null }[];
}

/** Upsert webhook forwarding config for a source. */
export async function upsertWebhookForwarding(
  organizationId: string,
  source: string,
  params: { enabled: boolean; forward_url: string | null }
): Promise<void> {
  await sql`
    INSERT INTO webhook_forwarding (organization_id, source, enabled, forward_url, updated_at)
    VALUES (
      ${organizationId}::uuid,
      ${source},
      ${params.enabled},
      ${params.forward_url},
      NOW()
    )
    ON CONFLICT (organization_id, source) DO UPDATE SET
      enabled = ${params.enabled},
      forward_url = ${params.forward_url},
      updated_at = NOW()
  `;
}

export interface CallRecordForCsr {
  id: string;
  call_date: string;
  call_time: string | null;
  duration_seconds: number | null;
  customer_name: string | null;
  customer_city: string | null;
  transcript: string | null;
  booking_value: string;
  customer_phone: string | null;
  job_hcp_id?: string | null;
  /** Debug: associated job from jobs table (HCP webhook) */
  job_debug?: Record<string, unknown> | null;
  /** Debug: associated call payload from GHL webhook (raw_payload) */
  call_debug?: Record<string, unknown> | null;
}

/** Get recent jobs (from job.appointment.booked / job.scheduled etc.) for phone-to-job matching.
 * Uses payload's updated_at (not table column) so full-sync doesn't skew ordering. */
export async function getRecentJobsForPhoneMatch(
  companyId: string,
  limit = 20
): Promise<{ hcp_id: string; raw: Record<string, unknown> }[]> {
  const result = await sql`
    SELECT hcp_id, raw
    FROM jobs
    WHERE company_id = ${companyId}
    ORDER BY (raw->>'updated_at') DESC NULLS LAST, (raw->>'created_at') DESC NULLS LAST
    LIMIT ${limit}
  `;
  return (result.rows ?? []) as { hcp_id: string; raw: Record<string, unknown> }[];
}

export async function getCallRecordsForCsr(
  organizationId: string,
  hcpEmployeeId: string,
  filters?: { startDate?: string; endDate?: string }
): Promise<CallRecordForCsr[]> {
  const start = filters?.startDate ?? "2000-01-01";
  const end = filters?.endDate ?? "2100-12-31";
  const result = await sql`
    SELECT
      c.id,
      c.call_date::text,
      c.call_time::text,
      c.duration_seconds,
      c.customer_name,
      c.customer_city,
      c.transcript,
      c.booking_value,
      c.customer_phone,
      c.job_hcp_id,
      c.call_headers AS call_debug,
      j.raw AS job_debug
    FROM call_records c
    LEFT JOIN jobs j ON j.hcp_id = c.job_hcp_id AND j.company_id = c.company_id
    WHERE c.organization_id = ${organizationId}::uuid
      AND c.hcp_employee_id = ${hcpEmployeeId}
      AND c.call_date >= ${start}
      AND c.call_date <= ${end}
    ORDER BY c.call_date DESC, c.call_time DESC NULLS LAST
  `;
  return (result.rows ?? []) as CallRecordForCsr[];
}

/** Call records where hcp_employee_id IS NULL (CSR N/A or unmatched). For "Awaiting Assignment" detail view. */
export async function getCallRecordsForAwaitingAssignment(
  organizationId: string,
  filters?: { startDate?: string; endDate?: string }
): Promise<CallRecordForCsr[]> {
  const start = filters?.startDate ?? "2000-01-01";
  const end = filters?.endDate ?? "2100-12-31";
  const result = await sql`
    SELECT
      c.id,
      c.call_date::text,
      c.call_time::text,
      c.duration_seconds,
      c.customer_name,
      c.customer_city,
      c.transcript,
      c.booking_value,
      c.customer_phone,
      c.job_hcp_id,
      c.call_headers AS call_debug,
      j.raw AS job_debug
    FROM call_records c
    LEFT JOIN jobs j ON j.hcp_id = c.job_hcp_id AND j.company_id = c.company_id
    WHERE c.organization_id = ${organizationId}::uuid
      AND c.hcp_employee_id IS NULL
      AND c.call_date >= ${start}
      AND c.call_date <= ${end}
    ORDER BY c.call_date DESC, c.call_time DESC NULLS LAST
  `;
  return (result.rows ?? []) as CallRecordForCsr[];
}

export async function updateCallRecordForAdmin(
  organizationId: string,
  callRecordId: string,
  params: { hcp_employee_id?: string | null; booking_value?: "won" | "lost" | "non-opportunity" }
): Promise<void> {
  await sql`
    UPDATE call_records
    SET
      hcp_employee_id = COALESCE(${params.hcp_employee_id ?? null}, hcp_employee_id),
      booking_value = COALESCE(${params.booking_value ?? null}, booking_value)
    WHERE organization_id = ${organizationId}::uuid
      AND id = ${callRecordId}::uuid
  `;
}

export interface JobRevenueAssignment {
  job_hcp_id: string;
  hcp_employee_id: string;
}

export async function getJobRevenueAssignments(
  organizationId: string
): Promise<JobRevenueAssignment[]> {
  const result = await sql`
    SELECT job_hcp_id, hcp_employee_id
    FROM job_revenue_assignments
    WHERE organization_id = ${organizationId}::uuid
  `;
  return (result.rows ?? []) as JobRevenueAssignment[];
}

export async function upsertJobRevenueAssignment(params: {
  organization_id: string;
  job_hcp_id: string;
  hcp_employee_id: string;
}): Promise<void> {
  await sql`
    INSERT INTO job_revenue_assignments (organization_id, job_hcp_id, hcp_employee_id, created_at, updated_at)
    VALUES (${params.organization_id}::uuid, ${params.job_hcp_id}, ${params.hcp_employee_id}, NOW(), NOW())
    ON CONFLICT (organization_id, job_hcp_id) DO UPDATE SET
      hcp_employee_id = ${params.hcp_employee_id},
      updated_at = NOW()
  `;
}

export interface GoogleBusinessProfile {
  organization_id: string;
  account_id: string | null;
  location_id: string | null;
  location_name: string | null;
  /** True when OAuth completed (refresh token stored). Never expose token to clients. */
  google_account_connected: boolean;
}

export async function getGoogleBusinessProfile(
  organizationId: string
): Promise<GoogleBusinessProfile | null> {
  const result = await sql`
    SELECT
      organization_id,
      account_id,
      location_id,
      location_name,
      (google_refresh_token IS NOT NULL AND TRIM(google_refresh_token) != '') AS google_account_connected
    FROM google_business_profiles
    WHERE organization_id = ${organizationId}::uuid
    LIMIT 1
  `;
  const row = (result.rows ?? [])[0] as GoogleBusinessProfile | undefined;
  return row ?? null;
}

export async function getGoogleRefreshToken(organizationId: string): Promise<string | null> {
  const result = await sql`
    SELECT google_refresh_token FROM google_business_profiles
    WHERE organization_id = ${organizationId}::uuid
    LIMIT 1
  `;
  const row = result.rows?.[0] as { google_refresh_token?: string | null } | undefined;
  const t = row?.google_refresh_token?.trim();
  return t || null;
}

export async function upsertGoogleBusinessOAuthRefreshToken(params: {
  organization_id: string;
  google_refresh_token: string;
}): Promise<void> {
  await sql`
    INSERT INTO google_business_profiles (organization_id, google_refresh_token, updated_at)
    VALUES (${params.organization_id}::uuid, ${params.google_refresh_token}, NOW())
    ON CONFLICT (organization_id) DO UPDATE SET
      google_refresh_token = ${params.google_refresh_token},
      updated_at = NOW()
  `;
}

export async function upsertGoogleBusinessProfile(params: {
  organization_id: string;
  account_id: string;
  location_id: string;
  location_name?: string | null;
}): Promise<void> {
  await sql`
    INSERT INTO google_business_profiles (organization_id, account_id, location_id, location_name, updated_at)
    VALUES (${params.organization_id}::uuid, ${params.account_id}, ${params.location_id}, ${params.location_name ?? null}, NOW())
    ON CONFLICT (organization_id) DO UPDATE SET
      account_id = ${params.account_id},
      location_id = ${params.location_id},
      location_name = ${params.location_name ?? null},
      updated_at = NOW()
  `;
}

export async function clearGoogleBusinessConnection(organizationId: string): Promise<void> {
  await sql`
    UPDATE google_business_profiles
    SET
      google_refresh_token = NULL,
      account_id = NULL,
      location_id = NULL,
      location_name = NULL,
      updated_at = NOW()
    WHERE organization_id = ${organizationId}::uuid
  `;
}

export interface GoogleBusinessReview {
  review_id: string;
  reviewer_name: string | null;
  star_rating: number | null;
  comment: string | null;
  create_time: string | null;
  update_time: string | null;
  /** Legacy single column; kept in sync with first assignment for older readers. */
  assigned_hcp_employee_id: string | null;
  /** All technicians credited for this review (junction table). */
  assigned_hcp_employee_ids: string[];
}

export async function upsertGoogleBusinessReview(params: {
  organization_id: string;
  review_id: string;
  reviewer_name?: string | null;
  star_rating?: number | null;
  comment?: string | null;
  create_time?: string | null;
  update_time?: string | null;
  raw?: Record<string, unknown>;
}): Promise<void> {
  await sql`
    INSERT INTO google_business_reviews (
      organization_id,
      review_id,
      reviewer_name,
      star_rating,
      comment,
      create_time,
      update_time,
      raw,
      synced_at,
      updated_at
    )
    VALUES (
      ${params.organization_id}::uuid,
      ${params.review_id},
      ${params.reviewer_name ?? null},
      ${params.star_rating ?? null},
      ${params.comment ?? null},
      ${params.create_time ?? null},
      ${params.update_time ?? null},
      ${JSON.stringify(params.raw ?? {})}::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (organization_id, review_id) DO UPDATE SET
      reviewer_name = EXCLUDED.reviewer_name,
      star_rating = EXCLUDED.star_rating,
      comment = EXCLUDED.comment,
      create_time = EXCLUDED.create_time,
      update_time = EXCLUDED.update_time,
      raw = EXCLUDED.raw,
      synced_at = NOW(),
      updated_at = NOW()
  `;
}

export async function getGoogleBusinessReviewsByOrg(
  organizationId: string
): Promise<GoogleBusinessReview[]> {
  const result = await sql`
    SELECT
      gbr.review_id,
      gbr.reviewer_name,
      gbr.star_rating,
      gbr.comment,
      gbr.create_time::text,
      gbr.update_time::text,
      gbr.assigned_hcp_employee_id,
      COALESCE(
        (SELECT array_agg(a.hcp_employee_id ORDER BY a.hcp_employee_id)
         FROM google_business_review_assignments a
         WHERE a.google_business_review_id = gbr.id),
        ARRAY[]::text[]
      ) AS assigned_hcp_employee_ids
    FROM google_business_reviews gbr
    WHERE gbr.organization_id = ${organizationId}::uuid
    ORDER BY COALESCE(gbr.update_time, gbr.create_time) DESC NULLS LAST
  `;
  return (result.rows ?? []).map((row) => {
    const r = row as GoogleBusinessReview & { assigned_hcp_employee_ids?: string[] | null };
    let ids = Array.isArray(r.assigned_hcp_employee_ids) ? r.assigned_hcp_employee_ids : [];
    if (ids.length === 0 && r.assigned_hcp_employee_id?.trim()) {
      ids = [r.assigned_hcp_employee_id.trim()];
    }
    return {
      ...r,
      assigned_hcp_employee_ids: ids,
    };
  }) as GoogleBusinessReview[];
}

/** Orgs with Google OAuth + Business Profile location (eligible for review sync cron). */
export async function getOrganizationIdsWithGoogleReviewSync(): Promise<string[]> {
  const result = await sql`
    SELECT organization_id::text AS organization_id
    FROM google_business_profiles
    WHERE google_refresh_token IS NOT NULL
      AND TRIM(google_refresh_token) != ''
      AND account_id IS NOT NULL
      AND TRIM(account_id) != ''
      AND location_id IS NOT NULL
      AND TRIM(location_id) != ''
  `;
  return (result.rows ?? []).map((r) => (r as { organization_id: string }).organization_id);
}

export async function getJobsWithCustomersForCompany(
  companyId: string
): Promise<
  {
    job_hcp_id: string;
    job_raw: Record<string, unknown>;
    job_updated_at: string;
    customer_raw: Record<string, unknown> | null;
  }[]
> {
  const result = await sql`
    SELECT j.hcp_id AS job_hcp_id, j.raw AS job_raw, j.updated_at::text AS job_updated_at, c.raw AS customer_raw
    FROM jobs j
    LEFT JOIN customers c ON c.hcp_id = j.customer_hcp_id AND c.company_id = j.company_id
    WHERE j.company_id = ${companyId}
      AND j.updated_at >= NOW() - INTERVAL '14 days'
  `;
  const out: {
    job_hcp_id: string;
    job_raw: Record<string, unknown>;
    job_updated_at: string;
    customer_raw: Record<string, unknown> | null;
  }[] = [];
  for (const row of result.rows ?? []) {
    const r = row as {
      job_hcp_id: string;
      job_raw: unknown;
      job_updated_at: string;
      customer_raw: unknown;
    };
    out.push({
      job_hcp_id: String(r.job_hcp_id ?? ""),
      job_raw: (r.job_raw ?? {}) as Record<string, unknown>,
      job_updated_at: r.job_updated_at ?? "",
      customer_raw: r.customer_raw ? (r.customer_raw as Record<string, unknown>) : null,
    });
  }
  return out;
}

export async function assignGoogleBusinessReview(params: {
  organization_id: string;
  review_id: string;
  assigned_hcp_employee_id: string | null;
}): Promise<void> {
  const ids =
    params.assigned_hcp_employee_id && params.assigned_hcp_employee_id.trim()
      ? [params.assigned_hcp_employee_id.trim()]
      : [];
  await replaceGoogleBusinessReviewAssignmentRows({
    organization_id: params.organization_id,
    review_id: params.review_id,
    hcp_employee_ids: ids,
    source: "manual",
  });
}

/** Apply many manual review assignments in order (e.g. admin “save all” on Reviews page). */
export async function bulkAssignGoogleBusinessReviews(
  organizationId: string,
  items: { review_id: string; hcp_employee_id: string | null }[]
): Promise<void> {
  for (const item of items) {
    await assignGoogleBusinessReview({
      organization_id: organizationId,
      review_id: item.review_id,
      assigned_hcp_employee_id: item.hcp_employee_id?.trim() ? item.hcp_employee_id.trim() : null,
    });
  }
}

export async function replaceGoogleBusinessReviewAssignmentRows(params: {
  organization_id: string;
  review_id: string;
  hcp_employee_ids: string[];
  source: "manual" | "auto_customer" | "auto_mention";
}): Promise<void> {
  const unique = Array.from(
    new Set(params.hcp_employee_ids.map((id) => id.trim()).filter(Boolean))
  );
  const primary = unique.length > 0 ? unique[0] : null;
  await sql`
    DELETE FROM google_business_review_assignments a
    USING google_business_reviews gbr
    WHERE gbr.id = a.google_business_review_id
      AND gbr.organization_id = ${params.organization_id}::uuid
      AND gbr.review_id = ${params.review_id}
  `;
  await sql`
    UPDATE google_business_reviews
    SET assigned_hcp_employee_id = ${primary},
        updated_at = NOW()
    WHERE organization_id = ${params.organization_id}::uuid
      AND review_id = ${params.review_id}
  `;
  if (unique.length === 0) return;
  for (const hcp_employee_id of unique) {
    await sql`
      INSERT INTO google_business_review_assignments (google_business_review_id, hcp_employee_id, source)
      SELECT gbr.id, ${hcp_employee_id}, ${params.source}
      FROM google_business_reviews gbr
      WHERE gbr.organization_id = ${params.organization_id}::uuid
        AND gbr.review_id = ${params.review_id}
      ON CONFLICT (google_business_review_id, hcp_employee_id) DO UPDATE SET
        source = EXCLUDED.source
    `;
  }
}

export async function getAssignedGoogleReviewCounts(
  organizationId: string,
  hcpEmployeeIds: string[]
): Promise<Record<string, number>> {
  if (hcpEmployeeIds.length === 0) return {};
  const ids = Array.from(new Set(hcpEmployeeIds.filter(Boolean)));
  if (ids.length === 0) return {};
  const result = await sql`
    SELECT gbra.hcp_employee_id, COUNT(DISTINCT gbr.id)::int AS count
    FROM google_business_review_assignments gbra
    INNER JOIN google_business_reviews gbr ON gbr.id = gbra.google_business_review_id
    WHERE gbr.organization_id = ${organizationId}::uuid
    GROUP BY gbra.hcp_employee_id
  `;
  const map: Record<string, number> = {};
  for (const row of result.rows ?? []) {
    const r = row as { hcp_employee_id: string; count: number };
    if (ids.includes(r.hcp_employee_id)) {
      map[r.hcp_employee_id] = r.count;
    }
  }
  return map;
}

export async function getAssignedGoogleReviewCountsForPeriod(
  organizationId: string,
  hcpEmployeeIds: string[],
  startDate: string,
  endDate: string
): Promise<Record<string, number>> {
  if (hcpEmployeeIds.length === 0) return {};
  const ids = new Set(
    Array.from(new Set(hcpEmployeeIds.filter(Boolean))).map((id) => id.trim())
  );
  if (ids.size === 0) return {};
  /** Posted date of the review: create_time first (stable). update_time changes on edits/sync and broke period filters. */
  const result = await sql`
    SELECT gbra.hcp_employee_id, COUNT(DISTINCT gbr.id)::int AS count
    FROM google_business_review_assignments gbra
    INNER JOIN google_business_reviews gbr ON gbr.id = gbra.google_business_review_id
    WHERE gbr.organization_id = ${organizationId}::uuid
      AND COALESCE(gbr.create_time, gbr.update_time) IS NOT NULL
      AND (COALESCE(gbr.create_time, gbr.update_time))::date >= ${startDate}::date
      AND (COALESCE(gbr.create_time, gbr.update_time))::date <= ${endDate}::date
    GROUP BY gbra.hcp_employee_id
  `;
  const map: Record<string, number> = {};
  for (const row of result.rows ?? []) {
    const r = row as { hcp_employee_id: string; count: number };
    const empId = String(r.hcp_employee_id ?? "").trim();
    if (empId && ids.has(empId)) {
      map[empId] = r.count;
    }
  }
  return map;
}

/** Assigned Google reviews in period with star_rating = 5 (posted date, same rules as getAssignedGoogleReviewCountsForPeriod). */
export async function getAssignedFiveStarGoogleReviewCountsForPeriod(
  organizationId: string,
  hcpEmployeeIds: string[],
  startDate: string,
  endDate: string
): Promise<Record<string, number>> {
  if (hcpEmployeeIds.length === 0) return {};
  const ids = new Set(
    Array.from(new Set(hcpEmployeeIds.filter(Boolean))).map((id) => id.trim())
  );
  if (ids.size === 0) return {};
  const result = await sql`
    SELECT gbra.hcp_employee_id, COUNT(DISTINCT gbr.id)::int AS count
    FROM google_business_review_assignments gbra
    INNER JOIN google_business_reviews gbr ON gbr.id = gbra.google_business_review_id
    WHERE gbr.organization_id = ${organizationId}::uuid
      AND (
        gbr.star_rating = 5
        OR UPPER(TRIM(COALESCE(gbr.raw->>'starRating', ''))) = 'FIVE'
      )
      AND COALESCE(gbr.create_time, gbr.update_time) IS NOT NULL
      AND (COALESCE(gbr.create_time, gbr.update_time))::date >= ${startDate}::date
      AND (COALESCE(gbr.create_time, gbr.update_time))::date <= ${endDate}::date
    GROUP BY gbra.hcp_employee_id
  `;
  const map: Record<string, number> = {};
  for (const row of result.rows ?? []) {
    const r = row as { hcp_employee_id: string; count: number };
    const empId = String(r.hcp_employee_id ?? "").trim();
    if (empId && ids.has(empId)) {
      map[empId] = r.count;
    }
  }
  return map;
}

const COMPLETED_JOB_STATUSES = [
  "paid",
  "completed",
  "complete",
  "closed",
  "done",
  "paid_in_full",
  "invoiced",
  "finished",
];

function isJobCompleted(raw: Record<string, unknown>): boolean {
  const status = (raw.status ?? raw.job_status ?? raw.work_status ?? raw.state ?? "")
    .toString()
    .toLowerCase();
  return COMPLETED_JOB_STATUSES.includes(status);
}

export interface ActivityFeedEvent {
  type: "job_completed" | "csr_booking";
  timestamp: string;
  technicianName?: string;
  amount?: number;
  csrName?: string;
  dateLabel?: string;
  city?: string;
}

export async function getActivityFeed(
  organizationId: string,
  limit = 5
): Promise<ActivityFeedEvent[]> {
  const org = await getOrganizationById(organizationId);
  const companyId = org?.hcp_company_id;
  if (!companyId) return [];

  const nameMap = new Map<string, string>();
  const empResult = await sql`
    SELECT hcp_id, raw FROM employees WHERE company_id = ${companyId}
  `;
  for (const row of empResult.rows ?? []) {
    const r = row as { hcp_id: string; raw: Record<string, unknown> };
    const raw = r.raw ?? {};
    const first = String(raw.first_name ?? raw.firstName ?? "").trim();
    const last = String(raw.last_name ?? raw.lastName ?? "").trim();
    const name = [first, last].filter(Boolean).join(" ").trim() || "Unknown";
    nameMap.set(r.hcp_id, name);
  }
  const prosResult = await sql`
    SELECT hcp_id, raw FROM pros WHERE company_id = ${companyId}
  `;
  for (const row of prosResult.rows ?? []) {
    const r = row as { hcp_id: string; raw: Record<string, unknown> };
    if (nameMap.has(r.hcp_id)) continue;
    const raw = r.raw ?? {};
    const first = String(raw.first_name ?? raw.firstName ?? "").trim();
    const last = String(raw.last_name ?? raw.lastName ?? "").trim();
    const name = [first, last].filter(Boolean).join(" ").trim() || "Unknown";
    nameMap.set(r.hcp_id, name);
  }

  const events: ActivityFeedEvent[] = [];

  const jobsResult = await sql`
    SELECT hcp_id, raw, total_amount, updated_at
    FROM jobs
    WHERE company_id = ${companyId}
    ORDER BY COALESCE(raw->>'updated_at', updated_at::text) DESC NULLS LAST
    LIMIT 50
  `;
  for (const row of jobsResult.rows ?? []) {
    const r = row as { hcp_id: string; raw: Record<string, unknown>; total_amount: number | string | null; updated_at: string };
    const raw = r.raw ?? {};
    if (!isJobCompleted(raw)) continue;
    const ts = (raw.updated_at ?? r.updated_at ?? "") as string;
    if (!ts) continue;
    const techIds = getTechnicianIdsFromJob(raw);
    const technicianName = techIds.length > 0
      ? nameMap.get(techIds[0]) ?? "A technician"
      : "A technician";
    const amt = r.total_amount != null ? parseFloat(String(r.total_amount)) : 0;
    events.push({
      type: "job_completed",
      timestamp: ts,
      technicianName,
      amount: amt > 0 ? amt : undefined,
    });
  }

  const callsResult = await sql`
    SELECT hcp_employee_id, csr_first_name_raw, call_date, customer_city, created_at
    FROM call_records
    WHERE organization_id = ${organizationId}::uuid
      AND booking_value = 'won'
    ORDER BY created_at DESC
    LIMIT 15
  `;
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const ordinal = (n: number) => {
    const s = String(n);
    if (n >= 11 && n <= 13) return s + "th";
    const last = s.slice(-1);
    if (last === "1") return s + "st";
    if (last === "2") return s + "nd";
    if (last === "3") return s + "rd";
    return s + "th";
  };
  for (const row of callsResult.rows ?? []) {
    const r = row as { hcp_employee_id: string | null; csr_first_name_raw: string | null; call_date: string; customer_city: string | null; created_at: string };
    const csrName = r.hcp_employee_id
      ? nameMap.get(r.hcp_employee_id) ?? r.csr_first_name_raw ?? "A CSR"
      : r.csr_first_name_raw ?? "A CSR";
    const d = new Date(r.call_date);
    const dateLabel = Number.isNaN(d.getTime())
      ? ""
      : `${dayNames[d.getDay()]} the ${ordinal(d.getDate())}`;
    events.push({
      type: "csr_booking",
      timestamp: r.created_at,
      csrName,
      dateLabel: dateLabel || undefined,
      city: r.customer_city?.trim() || undefined,
    });
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return events.slice(0, limit);
}

// Performance pay
export interface PerformancePayOrg {
  organization_id: string;
  setup_completed: boolean;
  pay_period_start_weekday: number;
  /** IANA time zone for pay period calendar boundaries (e.g. America/Denver). */
  pay_period_timezone: string;
  /** First day of pay period #0 (snapped to pay_period_start_weekday). Null = default grid from 1970. */
  pay_period_anchor_date: string | null;
  /** Flat bonus in dollars per assigned 5★ Google review in the pay period (org-wide). */
  bonus_per_five_star_review: number | null;
  updated_at: string;
}

export interface PerformancePayRole {
  id: string;
  organization_id: string;
  name: string;
  source: "hcp" | "custom";
}

export interface PerformancePayAssignment {
  organization_id: string;
  hcp_employee_id: string;
  role_id: string | null;
  overridden: boolean;
}

export interface PerformancePayConfig {
  organization_id: string;
  scope_type: "role" | "employee";
  scope_id: string;
  structure_type: string;
  config_json: Record<string, unknown>;
  bonuses_json: Record<string, unknown>[];
  updated_at: string;
}

export async function getPerformancePayOrg(organizationId: string): Promise<PerformancePayOrg | null> {
  const result = await sql`
    SELECT organization_id, setup_completed, pay_period_start_weekday,
      COALESCE(NULLIF(TRIM(pay_period_timezone), ''), 'UTC') AS pay_period_timezone,
      pay_period_anchor_date::text AS pay_period_anchor_date,
      bonus_per_five_star_review::float8 AS bonus_per_five_star_review,
      updated_at
    FROM performance_pay_org
    WHERE organization_id = ${organizationId}::uuid
  `;
  const row = result.rows?.[0] as PerformancePayOrg | undefined;
  if (!row) return null;
  const b = row.bonus_per_five_star_review;
  let bonus: number | null = null;
  if (typeof b === "number" && !Number.isNaN(b)) bonus = b;
  else if (b != null && String(b).trim() !== "") {
    const n = Number(b);
    if (!Number.isNaN(n)) bonus = n;
  }
  const anchorRaw = row.pay_period_anchor_date;
  const anchor =
    anchorRaw != null && String(anchorRaw).trim() !== ""
      ? String(anchorRaw).trim().slice(0, 10)
      : null;
  return { ...row, bonus_per_five_star_review: bonus, pay_period_anchor_date: anchor };
}

export async function upsertPerformancePayOrg(
  organizationId: string,
  params: {
    setup_completed?: boolean;
    pay_period_start_weekday?: number;
    pay_period_timezone?: string;
    pay_period_anchor_date?: string | null;
  }
): Promise<void> {
  const tzInsert =
    params.pay_period_timezone !== undefined && String(params.pay_period_timezone).trim() !== ""
      ? String(params.pay_period_timezone).trim()
      : "UTC";
  const tzUpdate =
    params.pay_period_timezone !== undefined
      ? String(params.pay_period_timezone).trim() || "UTC"
      : null;

  const anchorProvided = params.pay_period_anchor_date !== undefined;
  const anchorSqlValue =
    anchorProvided && params.pay_period_anchor_date !== null && params.pay_period_anchor_date !== ""
      ? String(params.pay_period_anchor_date).trim().slice(0, 10)
      : null;

  await sql`
    INSERT INTO performance_pay_org (
      organization_id, setup_completed, pay_period_start_weekday, pay_period_timezone, pay_period_anchor_date, updated_at
    )
    VALUES (
      ${organizationId}::uuid,
      ${params.setup_completed ?? false},
      ${params.pay_period_start_weekday ?? 1},
      ${tzInsert},
      ${anchorProvided ? anchorSqlValue : null},
      NOW()
    )
    ON CONFLICT (organization_id) DO UPDATE SET
      setup_completed = COALESCE(${params.setup_completed ?? null}::boolean, performance_pay_org.setup_completed),
      pay_period_start_weekday = COALESCE(${params.pay_period_start_weekday ?? null}::int, performance_pay_org.pay_period_start_weekday),
      pay_period_timezone = COALESCE(${tzUpdate}::text, performance_pay_org.pay_period_timezone),
      pay_period_anchor_date = CASE
        WHEN ${anchorProvided}::boolean THEN ${anchorSqlValue}::date
        ELSE performance_pay_org.pay_period_anchor_date
      END,
      updated_at = NOW()
  `;
}

/** Set org-wide $ per 5★ Google review (expected pay). Pass null to clear. */
export async function setPerformancePayOrgFiveStarBonus(
  organizationId: string,
  bonusPerReview: number | null
): Promise<void> {
  await sql`
    INSERT INTO performance_pay_org (organization_id, setup_completed, pay_period_start_weekday, bonus_per_five_star_review, updated_at)
    VALUES (${organizationId}::uuid, false, 1, ${bonusPerReview}, NOW())
    ON CONFLICT (organization_id) DO UPDATE SET
      bonus_per_five_star_review = ${bonusPerReview},
      updated_at = NOW()
  `;
}

export async function getPerformancePayRoles(organizationId: string): Promise<PerformancePayRole[]> {
  const result = await sql`
    SELECT id, organization_id, name, source
    FROM performance_pay_roles
    WHERE organization_id = ${organizationId}::uuid
    ORDER BY source ASC, name ASC
  `;
  return (result.rows ?? []) as PerformancePayRole[];
}

/** Ensure HCP roles (Technician, Office Staff) exist for the org. Returns all roles. */
export async function ensureHcpPerformancePayRoles(organizationId: string): Promise<PerformancePayRole[]> {
  const existing = await getPerformancePayRoles(organizationId);
  const hasTechnician = existing.some((r) => r.source === "hcp" && r.name.toLowerCase() === "technician");
  const hasOfficeStaff = existing.some((r) => r.source === "hcp" && r.name.toLowerCase() === "office staff");
  if (!hasTechnician) {
    await sql`
      INSERT INTO performance_pay_roles (organization_id, name, source)
      SELECT ${organizationId}::uuid, 'Technician', 'hcp'
      WHERE NOT EXISTS (SELECT 1 FROM performance_pay_roles WHERE organization_id = ${organizationId}::uuid AND LOWER(name) = 'technician' AND source = 'hcp')
    `;
  }
  if (!hasOfficeStaff) {
    await sql`
      INSERT INTO performance_pay_roles (organization_id, name, source)
      SELECT ${organizationId}::uuid, 'Office Staff', 'hcp'
      WHERE NOT EXISTS (SELECT 1 FROM performance_pay_roles WHERE organization_id = ${organizationId}::uuid AND LOWER(name) = 'office staff' AND source = 'hcp')
    `;
  }
  return getPerformancePayRoles(organizationId);
}

export async function createPerformancePayRole(
  organizationId: string,
  name: string
): Promise<PerformancePayRole> {
  const result = await sql`
    INSERT INTO performance_pay_roles (organization_id, name, source)
    VALUES (${organizationId}::uuid, ${name}, 'custom')
    RETURNING id, organization_id, name, source
  `;
  return result.rows?.[0] as PerformancePayRole;
}

export async function getPerformancePayAssignments(organizationId: string): Promise<PerformancePayAssignment[]> {
  const result = await sql`
    SELECT organization_id, hcp_employee_id, role_id::text, overridden
    FROM performance_pay_assignments
    WHERE organization_id = ${organizationId}::uuid
  `;
  return (result.rows ?? []).map((r) => {
    const row = r as Record<string, unknown> & { role_id: string | null };
    return { ...row, role_id: row.role_id } as PerformancePayAssignment;
  });
}

export async function upsertPerformancePayAssignment(
  organizationId: string,
  hcpEmployeeId: string,
  params: { role_id: string | null; overridden?: boolean }
): Promise<void> {
  await sql`
    INSERT INTO performance_pay_assignments (organization_id, hcp_employee_id, role_id, overridden)
    VALUES (${organizationId}::uuid, ${hcpEmployeeId}, ${params.role_id}::uuid, ${params.overridden ?? false})
    ON CONFLICT (organization_id, hcp_employee_id) DO UPDATE SET
      role_id = ${params.role_id}::uuid,
      overridden = COALESCE(${params.overridden ?? null}::boolean, performance_pay_assignments.overridden)
  `;
}

export async function getPerformancePayConfigs(organizationId: string): Promise<PerformancePayConfig[]> {
  const result = await sql`
    SELECT organization_id, scope_type, scope_id, structure_type, config_json, bonuses_json, updated_at
    FROM performance_pay_configs
    WHERE organization_id = ${organizationId}::uuid
    ORDER BY scope_type, scope_id
  `;
  return (result.rows ?? []).map((r) => {
    const row = r as { config_json: unknown; bonuses_json: unknown };
    return {
      ...row,
      config_json: (typeof row.config_json === "object" && row.config_json != null) ? row.config_json as Record<string, unknown> : {},
      bonuses_json: Array.isArray(row.bonuses_json) ? (row.bonuses_json as Record<string, unknown>[]) : [],
    };
  }) as PerformancePayConfig[];
}

export async function getPerformancePayConfig(
  organizationId: string,
  scopeType: "role" | "employee",
  scopeId: string
): Promise<PerformancePayConfig | null> {
  const result = await sql`
    SELECT organization_id, scope_type, scope_id, structure_type, config_json, bonuses_json, updated_at
    FROM performance_pay_configs
    WHERE organization_id = ${organizationId}::uuid AND scope_type = ${scopeType} AND scope_id = ${scopeId}
  `;
  const row = result.rows?.[0];
  if (!row) return null;
  const r = row as { config_json: unknown; bonuses_json: unknown };
  return {
    ...r,
    config_json: (typeof r.config_json === "object" && r.config_json != null) ? r.config_json as Record<string, unknown> : {},
    bonuses_json: Array.isArray(r.bonuses_json) ? (r.bonuses_json as Record<string, unknown>[]) : [],
  } as PerformancePayConfig;
}

export async function upsertPerformancePayConfig(
  organizationId: string,
  params: {
    scope_type: "role" | "employee";
    scope_id: string;
    structure_type: string;
    config_json: Record<string, unknown>;
    bonuses_json: Record<string, unknown>[];
  }
): Promise<void> {
  await sql`
    INSERT INTO performance_pay_configs (organization_id, scope_type, scope_id, structure_type, config_json, bonuses_json, updated_at)
    VALUES (${organizationId}::uuid, ${params.scope_type}, ${params.scope_id}, ${params.structure_type}, ${JSON.stringify(params.config_json)}::jsonb, ${JSON.stringify(params.bonuses_json)}::jsonb, NOW())
    ON CONFLICT (organization_id, scope_type, scope_id) DO UPDATE SET
      structure_type = ${params.structure_type},
      config_json = ${JSON.stringify(params.config_json)}::jsonb,
      bonuses_json = ${JSON.stringify(params.bonuses_json)}::jsonb,
      updated_at = NOW()
  `;
}

export async function deletePerformancePayConfig(
  organizationId: string,
  scopeType: "role" | "employee",
  scopeId: string
): Promise<void> {
  await sql`
    DELETE FROM performance_pay_configs
    WHERE organization_id = ${organizationId}::uuid AND scope_type = ${scopeType} AND scope_id = ${scopeId}
  `;
}

export type AiDashboardType = "main" | "calls" | "profit" | "time" | "marketing";

export async function getAiDashboardInsights(
  organizationId: string,
  dashboardType: AiDashboardType
): Promise<{ insights: string[]; generatedAt: string } | null> {
  const result = await sql`
    SELECT insights_json, generated_at
    FROM ai_dashboard_insights
    WHERE organization_id = ${organizationId}::uuid AND dashboard_type = ${dashboardType}
  `;
  const row = result.rows?.[0] as { insights_json: unknown; generated_at: string } | undefined;
  if (!row) return null;
  const insights = Array.isArray(row.insights_json) ? (row.insights_json as string[]) : [];
  return { insights, generatedAt: row.generated_at };
}

export async function upsertAiDashboardInsights(
  organizationId: string,
  dashboardType: AiDashboardType,
  insights: string[]
): Promise<void> {
  await sql`
    INSERT INTO ai_dashboard_insights (organization_id, dashboard_type, insights_json, generated_at)
    VALUES (${organizationId}::uuid, ${dashboardType}, ${JSON.stringify(insights)}::jsonb, NOW())
    ON CONFLICT (organization_id, dashboard_type) DO UPDATE SET
      insights_json = ${JSON.stringify(insights)}::jsonb,
      generated_at = NOW()
  `;
}

// Time-off requests and notifications
export interface TimeOffRequestRange {
  id: string;
  batch_id: string;
  hcp_employee_id: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  status: "pending" | "approved" | "declined";
  admin_reason: string | null;
  created_at: string;
}

export async function createTimeOffRequest(params: {
  organization_id: string;
  batch_id: string;
  hcp_employee_id: string;
  start_date: string;
  end_date: string;
  start_time?: string | null;
  end_time?: string | null;
}): Promise<void> {
  await sql`
    INSERT INTO time_off_requests (organization_id, batch_id, hcp_employee_id, start_date, end_date, start_time, end_time, status)
    VALUES (${params.organization_id}::uuid, ${params.batch_id}::uuid, ${params.hcp_employee_id},
      ${params.start_date}::date, ${params.end_date}::date,
      ${params.start_time ?? null}, ${params.end_time ?? null}, 'pending')
  `;
}

export async function getTimeOffRequestsByOrg(
  organizationId: string,
  filters?: { startDate?: string; endDate?: string }
): Promise<TimeOffRequestRange[]> {
  const start = filters?.startDate ?? "2000-01-01";
  const end = filters?.endDate ?? "2100-12-31";
  const result = await sql`
    SELECT id, batch_id::text, hcp_employee_id, start_date::text, end_date::text,
      start_time::text, end_time::text, status, admin_reason, created_at::text
    FROM time_off_requests
    WHERE organization_id = ${organizationId}::uuid
      AND start_date <= ${end}
      AND end_date >= ${start}
    ORDER BY created_at DESC, start_date ASC
  `;
  return (result.rows ?? []) as TimeOffRequestRange[];
}

export async function updateTimeOffRequestBatch(
  organizationId: string,
  batchId: string,
  status: "approved" | "declined",
  adminReason?: string | null
): Promise<void> {
  await sql`
    UPDATE time_off_requests
    SET status = ${status}, admin_reason = ${adminReason ?? null}
    WHERE organization_id = ${organizationId}::uuid AND batch_id = ${batchId}::uuid
  `;
}

export interface NotificationRow {
  id: string;
  organization_id: string;
  user_id: string;
  type: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export async function createNotification(params: {
  organization_id: string;
  user_id: string;
  type: string;
  data: Record<string, unknown>;
}): Promise<void> {
  await sql`
    INSERT INTO notifications (organization_id, user_id, type, data)
    VALUES (${params.organization_id}::uuid, ${params.user_id}::uuid, ${params.type}, ${JSON.stringify(params.data)}::jsonb)
  `;
}

export async function getNotificationsForUser(
  userId: string,
  limit = 50
): Promise<NotificationRow[]> {
  const result = await sql`
    SELECT id, organization_id::text, user_id::text, type, data, read_at::text, created_at::text
    FROM notifications
    WHERE user_id = ${userId}::uuid
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return (result.rows ?? []) as NotificationRow[];
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const result = await sql`
    SELECT COUNT(*)::int as count FROM notifications
    WHERE user_id = ${userId}::uuid AND read_at IS NULL
  `;
  return (result.rows?.[0] as { count: number })?.count ?? 0;
}

export async function markNotificationRead(id: string, userId: string): Promise<void> {
  await sql`
    UPDATE notifications SET read_at = NOW()
    WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
  `;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await sql`
    UPDATE notifications SET read_at = NOW()
    WHERE user_id = ${userId}::uuid AND read_at IS NULL
  `;
}

export async function getAdminUserIds(organizationId: string): Promise<string[]> {
  const result = await sql`
    SELECT id::text FROM users
    WHERE organization_id = ${organizationId}::uuid AND role = 'admin'
  `;
  return (result.rows ?? []).map((r) => (r as { id: string }).id);
}

export async function getUserIdByHcpEmployeeId(
  organizationId: string,
  hcpEmployeeId: string
): Promise<string | null> {
  const result = await sql`
    SELECT id::text FROM users
    WHERE organization_id = ${organizationId}::uuid AND hcp_employee_id = ${hcpEmployeeId}
    LIMIT 1
  `;
  const row = result.rows?.[0] as { id: string } | undefined;
  return row?.id ?? null;
}
