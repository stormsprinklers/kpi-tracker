import { sql } from "@vercel/postgres";

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

/** HCP returns amounts in cents. Convert to dollars for revenue columns. */
function extractAmountInDollars(record: Record<string, unknown>, ...keys: string[]): number | null {
  const cents = extractAmount(record, ...keys);
  return cents != null ? cents / 100 : null;
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

export async function persistWebhookEvent(
  event: string,
  payload: Record<string, unknown>,
  companyId: string
): Promise<void> {

  if (event.startsWith("job.")) {
    const record = (payload.job ?? payload.data ?? payload) as Record<string, unknown>;
    const hcpId = extractId(record);
    if (!hcpId) return;
    const customerHcpId = extractCustomerHcpId(record);
    const totalAmount = extractAmountInDollars(record, "total_amount", "subtotal", "total", "amount");
    const outstandingBalance = extractAmountInDollars(record, "outstanding_balance", "balance_due", "amount_due");
    const raw = JSON.stringify(record);
    await sql`
      INSERT INTO jobs (hcp_id, company_id, customer_hcp_id, total_amount, outstanding_balance, raw, updated_at)
      VALUES (${hcpId}, ${companyId}, ${customerHcpId}, ${totalAmount}, ${outstandingBalance}, ${raw}::jsonb, NOW())
      ON CONFLICT (hcp_id, company_id) DO UPDATE SET
        customer_hcp_id = EXCLUDED.customer_hcp_id,
        total_amount = EXCLUDED.total_amount,
        outstanding_balance = EXCLUDED.outstanding_balance,
        raw = EXCLUDED.raw,
        updated_at = NOW()
    `;
  } else if (event.startsWith("customer.")) {
    const record = (payload.customer ?? payload.data ?? payload) as Record<string, unknown>;
    const hcpId = extractId(record);
    if (!hcpId) return;
    const raw = JSON.stringify(record);
    await sql`
      INSERT INTO customers (hcp_id, company_id, raw, updated_at)
      VALUES (${hcpId}, ${companyId}, ${raw}::jsonb, NOW())
      ON CONFLICT (hcp_id, company_id) DO UPDATE SET raw = EXCLUDED.raw, updated_at = NOW()
    `;
  } else if (event.startsWith("invoice.")) {
    const record = (payload.invoice ?? payload.data ?? payload) as Record<string, unknown>;
    const hcpId = extractId(record);
    if (!hcpId) return;
    const jobHcpId = extractJobHcpId(record);
    const raw = JSON.stringify(record);
    await sql`
      INSERT INTO invoices (hcp_id, company_id, job_hcp_id, raw, updated_at)
      VALUES (${hcpId}, ${companyId}, ${jobHcpId}, ${raw}::jsonb, NOW())
      ON CONFLICT (hcp_id, company_id) DO UPDATE SET
        job_hcp_id = EXCLUDED.job_hcp_id,
        raw = EXCLUDED.raw,
        updated_at = NOW()
    `;
  } else if (event.startsWith("estimate.")) {
    const record = (payload.estimate ?? payload.data ?? payload) as Record<string, unknown>;
    const hcpId = extractId(record);
    if (!hcpId) return;
    const jobHcpId = extractJobHcpId(record);
    const customerHcpId = extractCustomerHcpId(record);
    const raw = JSON.stringify(record);
    await sql`
      INSERT INTO estimates (hcp_id, company_id, job_hcp_id, customer_hcp_id, raw, updated_at)
      VALUES (${hcpId}, ${companyId}, ${jobHcpId}, ${customerHcpId}, ${raw}::jsonb, NOW())
      ON CONFLICT (hcp_id, company_id) DO UPDATE SET
        job_hcp_id = EXCLUDED.job_hcp_id,
        customer_hcp_id = EXCLUDED.customer_hcp_id,
        raw = EXCLUDED.raw,
        updated_at = NOW()
    `;
  } else if (event.startsWith("appointment.")) {
    const record = (payload.appointment ?? payload.data ?? payload) as Record<string, unknown>;
    const hcpId = extractId(record);
    if (!hcpId) return;
    const jobHcpId = extractJobHcpId(record);
    const raw = JSON.stringify(record);
    await sql`
      INSERT INTO appointments (hcp_id, company_id, job_hcp_id, raw, updated_at)
      VALUES (${hcpId}, ${companyId}, ${jobHcpId}, ${raw}::jsonb, NOW())
      ON CONFLICT (hcp_id, company_id) DO UPDATE SET
        job_hcp_id = EXCLUDED.job_hcp_id,
        raw = EXCLUDED.raw,
        updated_at = NOW()
    `;
  } else if (event.startsWith("employee.") || event.startsWith("pro.")) {
    const record = (payload.employee ?? payload.pro ?? payload.data ?? payload) as Record<string, unknown>;
    const hcpId = extractId(record);
    if (!hcpId) return;
    const raw = JSON.stringify(record);
    await sql`
      INSERT INTO employees (hcp_id, company_id, raw, updated_at)
      VALUES (${hcpId}, ${companyId}, ${raw}::jsonb, NOW())
      ON CONFLICT (hcp_id, company_id) DO UPDATE SET raw = EXCLUDED.raw, updated_at = NOW()
    `;
  }
}
