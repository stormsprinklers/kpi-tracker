import { sql } from "@/lib/db";
import { withDeadlockRetry } from "@/lib/db/deadlockRetry";

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

/** Many webhook providers (e.g. HCP) nest event data under payload.payload. Normalize to the inner data. */
function getWebhookData(payload: Record<string, unknown>): Record<string, unknown> {
  const inner = payload.payload;
  if (inner && typeof inner === "object" && inner !== null && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return payload;
}

export async function persistWebhookEvent(
  event: string,
  payload: Record<string, unknown>,
  organizationId: string,
  companyId: string
): Promise<void> {
  console.log("[WH-LIVE-CHECK] webhookPersist persistWebhookEvent version 2026-03-08-01", { event, organizationId });
  console.log("[Webhook] persistWebhookEvent start", { event, organizationId });

  const data = getWebhookData(payload);

  if (event === "job.appointment.scheduled") {
    try {
      const record = (data.appointment ?? data.job ?? data.data ?? data) as Record<string, unknown>;
      const hcpId = extractId(record);
      if (hcpId) {
        const jobHcpId = extractJobHcpId(record);
        const raw = JSON.stringify(record);
        await sql`
          INSERT INTO appointments (hcp_id, company_id, job_hcp_id, raw, updated_at)
          VALUES (${hcpId}, ${companyId}, ${jobHcpId ?? null}, ${raw}::jsonb, NOW())
          ON CONFLICT (hcp_id, company_id) DO UPDATE SET
            job_hcp_id = EXCLUDED.job_hcp_id,
            raw = EXCLUDED.raw,
            updated_at = NOW()
        `;
      }
      const jobRecord = (data.job ?? (record.job as Record<string, unknown>)) as Record<string, unknown> | null;
      if (jobRecord && extractId(jobRecord)) {
        const jHcpId = extractId(jobRecord);
        const customerHcpId = extractCustomerHcpId(jobRecord);
        const totalAmount = extractAmountInDollars(jobRecord, "total_amount", "subtotal", "total", "amount");
        const outstandingBalance = extractAmountInDollars(jobRecord, "outstanding_balance", "balance_due", "amount_due");
        const jobRaw = JSON.stringify(jobRecord);
        await withDeadlockRetry(() =>
          sql`
          INSERT INTO jobs (hcp_id, company_id, customer_hcp_id, total_amount, outstanding_balance, raw, updated_at)
          VALUES (${jHcpId}, ${companyId}, ${customerHcpId}, ${totalAmount}, ${outstandingBalance}, ${jobRaw}::jsonb, NOW())
          ON CONFLICT (hcp_id, company_id) DO UPDATE SET
            customer_hcp_id = EXCLUDED.customer_hcp_id,
            total_amount = EXCLUDED.total_amount,
            outstanding_balance = EXCLUDED.outstanding_balance,
            raw = EXCLUDED.raw,
            updated_at = NOW()
        `
        );
        if (jobRecord.customer && typeof jobRecord.customer === "object" && jobRecord.customer !== null) {
          const cust = jobRecord.customer as Record<string, unknown>;
          const custId = extractId(cust);
          if (custId) {
            await sql`
              INSERT INTO customers (hcp_id, company_id, raw, updated_at)
              VALUES (${custId}, ${companyId}, ${JSON.stringify(cust)}::jsonb, NOW())
              ON CONFLICT (hcp_id, company_id) DO UPDATE SET raw = EXCLUDED.raw, updated_at = NOW()
            `;
          }
        }
      }
    } catch (persistErr) {
      console.warn("[Webhook] job.appointment.scheduled persist failed:", persistErr);
    }
  } else if (event.startsWith("job.")) {
    const record = (data.job ?? data.data ?? data) as Record<string, unknown>;
    const hcpId = extractId(record);
    if (!hcpId) return;
    const customerHcpId = extractCustomerHcpId(record);
    const totalAmount = extractAmountInDollars(record, "total_amount", "subtotal", "total", "amount");
    const outstandingBalance = extractAmountInDollars(record, "outstanding_balance", "balance_due", "amount_due");
    const raw = JSON.stringify(record);
    await withDeadlockRetry(() =>
      sql`
      INSERT INTO jobs (hcp_id, company_id, customer_hcp_id, total_amount, outstanding_balance, raw, updated_at)
      VALUES (${hcpId}, ${companyId}, ${customerHcpId}, ${totalAmount}, ${outstandingBalance}, ${raw}::jsonb, NOW())
      ON CONFLICT (hcp_id, company_id) DO UPDATE SET
        customer_hcp_id = EXCLUDED.customer_hcp_id,
        total_amount = EXCLUDED.total_amount,
        outstanding_balance = EXCLUDED.outstanding_balance,
        raw = EXCLUDED.raw,
        updated_at = NOW()
    `
    );
    if (record.customer && typeof record.customer === "object" && record.customer !== null) {
      const cust = record.customer as Record<string, unknown>;
      const custId = extractId(cust);
      if (custId) {
        await sql`
          INSERT INTO customers (hcp_id, company_id, raw, updated_at)
          VALUES (${custId}, ${companyId}, ${JSON.stringify(cust)}::jsonb, NOW())
          ON CONFLICT (hcp_id, company_id) DO UPDATE SET raw = EXCLUDED.raw, updated_at = NOW()
        `;
      }
    }
  } else if (event.startsWith("customer.")) {
    const record = (data.customer ?? data.data ?? data) as Record<string, unknown>;
    const hcpId = extractId(record);
    if (!hcpId) return;
    const raw = JSON.stringify(record);
    await sql`
      INSERT INTO customers (hcp_id, company_id, raw, updated_at)
      VALUES (${hcpId}, ${companyId}, ${raw}::jsonb, NOW())
      ON CONFLICT (hcp_id, company_id) DO UPDATE SET raw = EXCLUDED.raw, updated_at = NOW()
    `;
  } else if (event.startsWith("invoice.")) {
    const record = (data.invoice ?? data.data ?? data) as Record<string, unknown>;
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
    const record = (data.estimate ?? data.data ?? data) as Record<string, unknown>;
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
    const record = (data.appointment ?? data.data ?? data) as Record<string, unknown>;
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
    const record = (data.employee ?? data.pro ?? data.data ?? data) as Record<string, unknown>;
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
