import { sql } from "@vercel/postgres";

export interface SyncFilters {
  workStatus?: string;
  limit?: number;
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
