import { sql } from "@vercel/postgres";

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
  return (result.rows ?? []).map((r) => r.raw as Record<string, unknown>);
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
    return (result.rows ?? []).map((r) => r.raw as Record<string, unknown>);
  }
  const result = await sql`
    SELECT raw FROM invoices
    WHERE company_id = ${companyId}
  `;
  return (result.rows ?? []).map((r) => r.raw as Record<string, unknown>);
}

export async function getEstimatesFromDb(
  companyId: string
): Promise<Record<string, unknown>[]> {
  const result = await sql`
    SELECT raw FROM estimates
    WHERE company_id = ${companyId}
  `;
  return (result.rows ?? []).map((r) => r.raw as Record<string, unknown>);
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
  return (result.rows ?? []).map((r) => r.raw as Record<string, unknown>);
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
  return (result.rows ?? []).map((r) => r.raw as Record<string, unknown>);
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
  return (result.rows ?? []).map((r) => r.raw as Record<string, unknown>);
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
    SELECT id, name, hcp_access_token, hcp_webhook_secret, hcp_company_id, created_at, updated_at
    FROM organizations WHERE id = ${id}
  `;
  return result.rows?.[0] as { id: string; name: string; hcp_access_token: string | null; hcp_webhook_secret: string | null; hcp_company_id: string | null; created_at: string; updated_at: string } | undefined;
}

export async function getOrganizationsWithTokens() {
  const result = await sql`
    SELECT id, name, hcp_company_id, hcp_access_token
    FROM organizations
    WHERE hcp_access_token IS NOT NULL AND hcp_access_token != ''
  `;
  return result.rows as { id: string; name: string; hcp_company_id: string | null; hcp_access_token: string }[];
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
}) {
  const result = await sql`
    INSERT INTO organizations (name, hcp_access_token, hcp_webhook_secret, hcp_company_id, updated_at)
    VALUES (${params.name}, ${params.hcp_access_token ?? null}, ${params.hcp_webhook_secret ?? null}, ${params.hcp_company_id ?? null}, NOW())
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

export async function getUserByEmail(email: string) {
  const result = await sql`
    SELECT u.id, u.email, u.password_hash, u.organization_id, u.role, u.hcp_employee_id, o.name as org_name, o.hcp_company_id
    FROM users u
    JOIN organizations o ON o.id = u.organization_id
    WHERE LOWER(u.email) = LOWER(${email})
  `;
  return result.rows?.[0] as {
    id: string;
    email: string;
    password_hash: string;
    organization_id: string;
    role: string;
    hcp_employee_id: string | null;
    org_name: string;
    hcp_company_id: string | null;
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
      c.raw_payload AS call_debug,
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
