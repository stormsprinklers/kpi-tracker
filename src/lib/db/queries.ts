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
    // Use columns when present (stored in dollars)
    if (row.total_amount != null) {
      job.total_amount = typeof row.total_amount === "string" ? parseFloat(row.total_amount) : row.total_amount;
    } else if (row.raw?.total_amount != null || row.raw?.subtotal != null) {
      // Fallback: extract from raw (HCP uses cents) and convert to dollars
      const cents = typeof row.raw?.total_amount === "number" ? row.raw.total_amount : typeof row.raw?.subtotal === "number" ? row.raw.subtotal : parseFloat(String(row.raw?.total_amount ?? row.raw?.subtotal ?? 0)) || 0;
      job.total_amount = cents / 100;
    }
    if (row.outstanding_balance != null) {
      job.outstanding_balance = typeof row.outstanding_balance === "string" ? parseFloat(row.outstanding_balance) : row.outstanding_balance;
    } else if (row.raw?.outstanding_balance != null || row.raw?.balance_due != null || row.raw?.amount_due != null) {
      const cents = typeof row.raw?.outstanding_balance === "number" ? row.raw.outstanding_balance : typeof row.raw?.balance_due === "number" ? row.raw.balance_due : typeof row.raw?.amount_due === "number" ? row.raw.amount_due : parseFloat(String(row.raw?.outstanding_balance ?? row.raw?.balance_due ?? row.raw?.amount_due ?? 0)) || 0;
      job.outstanding_balance = cents / 100;
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
