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

export async function getEmployeesFromDb(
  companyId: string
): Promise<Record<string, unknown>[]> {
  const result = await sql`
    SELECT raw FROM employees
    WHERE company_id = ${companyId}
  `;
  return (result.rows ?? []).map((r) => r.raw as Record<string, unknown>);
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
  role: "admin" | "employee";
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
    SELECT id, organization_id, hcp_employee_id, entry_date::text, start_time::text, end_time::text, hours, job_hcp_id, notes, created_at, updated_at
    FROM time_entries
    WHERE organization_id = ${organizationId} AND hcp_employee_id = ${hcpEmployeeId}
    AND entry_date >= ${start}::date AND entry_date <= ${end}::date
    ORDER BY entry_date DESC, start_time DESC NULLS LAST
    LIMIT 500
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
    RETURNING id, organization_id, hcp_employee_id, entry_date::text, start_time::text, end_time::text, hours, job_hcp_id, notes, created_at, updated_at
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
    RETURNING id, organization_id, hcp_employee_id, entry_date::text, start_time::text, end_time::text, hours, job_hcp_id, notes, created_at, updated_at
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
