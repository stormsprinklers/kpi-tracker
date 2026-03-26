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

// Auth queries
export async function getOrganizationsCount(): Promise<number> {
  const result = await sql`SELECT COUNT(*)::int as count FROM organizations`;
  return (result.rows?.[0] as { count: number })?.count ?? 0;
}

export async function getOrganizationById(id: string) {
  const result = await sql`
    SELECT id, name, hcp_access_token, hcp_webhook_secret, hcp_company_id, logo_url, trial_ends_at, website, seo_business_name, seo_domain, seo_include_ai_mode, created_at, updated_at
    FROM organizations WHERE id = ${id}
  `;
  return result.rows?.[0] as { id: string; name: string; hcp_access_token: string | null; hcp_webhook_secret: string | null; hcp_company_id: string | null; logo_url: string | null; trial_ends_at: string | null; website: string | null; seo_business_name: string | null; seo_domain: string | null; seo_include_ai_mode: boolean | null; created_at: string; updated_at: string } | undefined;
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

export async function getUserByEmail(email: string) {
  const result = await sql`
    SELECT u.id, u.email, u.password_hash, u.organization_id, u.role, u.hcp_employee_id, o.name as org_name, o.hcp_company_id, o.logo_url as org_logo_url
    FROM users u
    LEFT JOIN organizations o ON o.id = u.organization_id
    WHERE LOWER(u.email) = LOWER(${email})
  `;
  return result.rows?.[0] as {
    id: string;
    email: string;
    password_hash: string | null;
    organization_id: string | null;
    role: string;
    hcp_employee_id: string | null;
    org_name: string | null;
    hcp_company_id: string | null;
    org_logo_url: string | null;
  } | undefined;
}

export async function createUser(params: {
  email: string;
  password_hash: string;
  organization_id: string;
  role: "admin" | "employee" | "investor";
  hcp_employee_id?: string | null;
}) {
  const result = await sql`
    INSERT INTO users (email, password_hash, organization_id, role, hcp_employee_id)
    VALUES (${params.email}, ${params.password_hash}, ${params.organization_id}, ${params.role}, ${params.hcp_employee_id ?? null})
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
  if (role === "employee") {
    const base = { ...allFalse, dashboard: true, timesheets: true, can_edit: true };
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

function getTechnicianIdsFromJob(job: Record<string, unknown>): string[] {
  const assigned = job.assigned_employees ?? job.assigned_pro ?? job.assigned_employee;
  const items = Array.isArray(assigned) ? assigned : assigned && typeof assigned === "object" ? [assigned] : [];
  const ids: string[] = [];
  for (const a of items) {
    if (typeof a === "string") {
      ids.push(a);
      continue;
    }
    if (a && typeof a === "object" && "id" in a) {
      ids.push(String((a as { id: unknown }).id));
    }
  }
  if (ids.length > 0) return ids;
  const fallback = job.pro_id ?? job.pro ?? job.employee_id ?? job.assigned_pro_id;
  if (typeof fallback === "string") return [fallback];
  if (fallback && typeof fallback === "object" && "id" in fallback) {
    return [String((fallback as { id: unknown }).id)];
  }
  return [];
}

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
    SELECT organization_id, setup_completed, pay_period_start_weekday, updated_at
    FROM performance_pay_org
    WHERE organization_id = ${organizationId}::uuid
  `;
  return (result.rows?.[0] as PerformancePayOrg) ?? null;
}

export async function upsertPerformancePayOrg(
  organizationId: string,
  params: { setup_completed?: boolean; pay_period_start_weekday?: number }
): Promise<void> {
  await sql`
    INSERT INTO performance_pay_org (organization_id, setup_completed, pay_period_start_weekday, updated_at)
    VALUES (${organizationId}::uuid, ${params.setup_completed ?? false}, ${params.pay_period_start_weekday ?? 1}, NOW())
    ON CONFLICT (organization_id) DO UPDATE SET
      setup_completed = COALESCE(${params.setup_completed ?? null}::boolean, performance_pay_org.setup_completed),
      pay_period_start_weekday = COALESCE(${params.pay_period_start_weekday ?? null}::int, performance_pay_org.pay_period_start_weekday),
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
