import {
  getCompany,
  getCustomersAllPages,
  getJobsAllPages,
  getInvoicesAllPages,
  getEstimatesAllPages,
  getAppointmentsAllPages,
  getEmployeesAllPages,
  getPros,
} from "../housecallpro";
import { sql } from "@vercel/postgres";
import { initSchema } from "../db";

const DELAY_MS = 100;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractId(record: Record<string, unknown>): string | null {
  const id = record.id ?? record.uuid;
  return id != null ? String(id) : null;
}

function extractCustomerHcpId(job: Record<string, unknown>): string | null {
  const customer = job.customer;
  if (customer && typeof customer === "object" && "id" in customer) {
    return String((customer as { id: unknown }).id);
  }
  return (job.customer_id ?? job.customer_hcp_id) as string | null ?? null;
}

function extractAmount(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = record[k];
    if (v == null) continue;
    const n = typeof v === "number" && !Number.isNaN(v) ? v : typeof v === "string" ? parseFloat(v) : NaN;
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

function extractJobHcpId(record: Record<string, unknown>): string | null {
  const job = record.job ?? record.job_id ?? record.service_request ?? record.request;
  if (job && typeof job === "object" && "id" in job) {
    return String((job as { id: unknown }).id);
  }
  const scalar =
    record.job_id ??
    record.job_hcp_id ??
    record.request_id ??
    record.service_request_id;
  return scalar != null ? String(scalar) : null;
}

export interface SyncResult {
  status: "ok" | "error";
  companyId: string;
  entitiesSynced: Record<string, number>;
  duration: number;
  error?: string;
}

export async function runFullSync(): Promise<SyncResult> {
  const start = Date.now();
  const entitiesSynced: Record<string, number> = {
    customers: 0,
    jobs: 0,
    invoices: 0,
    estimates: 0,
    appointments: 0,
    employees: 0,
    pros: 0,
  };

  try {
    await initSchema();

    const company = (await getCompany()) as { id: string };
    const companyId = company?.id ?? "default";
    if (!companyId) {
      throw new Error("Could not get company ID from Housecall Pro");
    }

    const customers = await getCustomersAllPages();
    await delay(DELAY_MS);
    for (const c of customers) {
      const r = c as Record<string, unknown>;
      const hcpId = extractId(r);
      if (!hcpId) continue;
      await sql`
        INSERT INTO customers (hcp_id, company_id, raw, updated_at)
        VALUES (${hcpId}, ${companyId}, ${JSON.stringify(r)}::jsonb, NOW())
        ON CONFLICT (hcp_id, company_id) DO UPDATE SET
          raw = EXCLUDED.raw,
          updated_at = NOW()
      `;
      entitiesSynced.customers++;
    }

    const jobs = await getJobsAllPages();
    await delay(DELAY_MS);
    for (const j of jobs) {
      const r = j as Record<string, unknown>;
      const hcpId = extractId(r);
      if (!hcpId) continue;
      const customerHcpId = extractCustomerHcpId(r);
      const totalAmount = extractAmount(r, "total_amount", "total", "amount");
      const outstandingBalance = extractAmount(r, "outstanding_balance", "balance_due", "amount_due");
      await sql`
        INSERT INTO jobs (hcp_id, company_id, customer_hcp_id, total_amount, outstanding_balance, raw, updated_at)
        VALUES (${hcpId}, ${companyId}, ${customerHcpId}, ${totalAmount}, ${outstandingBalance}, ${JSON.stringify(r)}::jsonb, NOW())
        ON CONFLICT (hcp_id, company_id) DO UPDATE SET
          customer_hcp_id = EXCLUDED.customer_hcp_id,
          total_amount = EXCLUDED.total_amount,
          outstanding_balance = EXCLUDED.outstanding_balance,
          raw = EXCLUDED.raw,
          updated_at = NOW()
      `;
      entitiesSynced.jobs++;
    }

    const invoices = await getInvoicesAllPages().catch(() => [] as unknown[]);
    await delay(DELAY_MS);
    for (const inv of invoices) {
      const r = inv as Record<string, unknown>;
      const hcpId = extractId(r);
      if (!hcpId) continue;
      const jobHcpId = extractJobHcpId(r);
      await sql`
        INSERT INTO invoices (hcp_id, company_id, job_hcp_id, raw, updated_at)
        VALUES (${hcpId}, ${companyId}, ${jobHcpId}, ${JSON.stringify(r)}::jsonb, NOW())
        ON CONFLICT (hcp_id, company_id) DO UPDATE SET
          job_hcp_id = EXCLUDED.job_hcp_id,
          raw = EXCLUDED.raw,
          updated_at = NOW()
      `;
      entitiesSynced.invoices++;
    }

    const estimates = await getEstimatesAllPages().catch(() => [] as unknown[]);
    await delay(DELAY_MS);
    for (const est of estimates) {
      const r = est as Record<string, unknown>;
      const hcpId = extractId(r);
      if (!hcpId) continue;
      const jobHcpId = extractJobHcpId(r);
      const customerHcpId = extractCustomerHcpId(r);
      await sql`
        INSERT INTO estimates (hcp_id, company_id, job_hcp_id, customer_hcp_id, raw, updated_at)
        VALUES (${hcpId}, ${companyId}, ${jobHcpId}, ${customerHcpId}, ${JSON.stringify(r)}::jsonb, NOW())
        ON CONFLICT (hcp_id, company_id) DO UPDATE SET
          job_hcp_id = EXCLUDED.job_hcp_id,
          customer_hcp_id = EXCLUDED.customer_hcp_id,
          raw = EXCLUDED.raw,
          updated_at = NOW()
      `;
      entitiesSynced.estimates++;
    }

    const appointments = await getAppointmentsAllPages().catch(() => [] as unknown[]);
    await delay(DELAY_MS);
    for (const apt of appointments) {
      const r = apt as Record<string, unknown>;
      const hcpId = extractId(r);
      if (!hcpId) continue;
      const jobHcpId = extractJobHcpId(r);
      await sql`
        INSERT INTO appointments (hcp_id, company_id, job_hcp_id, raw, updated_at)
        VALUES (${hcpId}, ${companyId}, ${jobHcpId}, ${JSON.stringify(r)}::jsonb, NOW())
        ON CONFLICT (hcp_id, company_id) DO UPDATE SET
          job_hcp_id = EXCLUDED.job_hcp_id,
          raw = EXCLUDED.raw,
          updated_at = NOW()
      `;
      entitiesSynced.appointments++;
    }

    const employees = await getEmployeesAllPages().catch(() => [] as unknown[]);
    await delay(DELAY_MS);
    for (const emp of employees) {
      const r = emp as Record<string, unknown>;
      const hcpId = extractId(r);
      if (!hcpId) continue;
      await sql`
        INSERT INTO employees (hcp_id, company_id, raw, updated_at)
        VALUES (${hcpId}, ${companyId}, ${JSON.stringify(r)}::jsonb, NOW())
        ON CONFLICT (hcp_id, company_id) DO UPDATE SET
          raw = EXCLUDED.raw,
          updated_at = NOW()
      `;
      entitiesSynced.employees++;
    }

    const prosRes = await getPros().catch(() => ({ pros: [] as unknown[] }));
    const prosList = Array.isArray(prosRes) ? prosRes : (prosRes as { pros?: unknown[] }).pros ?? (prosRes as { data?: unknown[] }).data ?? [];
    await delay(DELAY_MS);
    for (const p of prosList) {
      const r = p as Record<string, unknown>;
      const hcpId = extractId(r);
      if (!hcpId) continue;
      await sql`
        INSERT INTO pros (hcp_id, company_id, raw, updated_at)
        VALUES (${hcpId}, ${companyId}, ${JSON.stringify(r)}::jsonb, NOW())
        ON CONFLICT (hcp_id, company_id) DO UPDATE SET
          raw = EXCLUDED.raw,
          updated_at = NOW()
      `;
      entitiesSynced.pros++;
    }

    const entityTypes = ["customers", "jobs", "invoices", "estimates", "appointments", "employees", "pros"];
    for (const entityType of entityTypes) {
      await sql`
        INSERT INTO sync_state (company_id, entity_type, last_sync_at)
        VALUES (${companyId}, ${entityType}, NOW())
        ON CONFLICT (company_id, entity_type) DO UPDATE SET last_sync_at = NOW()
      `;
    }

    const duration = Date.now() - start;
    return { status: "ok", companyId, entitiesSynced, duration };
  } catch (err) {
    const duration = Date.now() - start;
    return {
      status: "error",
      companyId: "unknown",
      entitiesSynced,
      duration,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
