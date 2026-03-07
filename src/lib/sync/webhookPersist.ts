import { sql } from "@vercel/postgres";

const OFFICE_STAFF_ROLES = ["office staff", "office_staff", "officestaff"];

function isOfficeStaff(role: unknown): boolean {
  const r = (role ?? "").toString().toLowerCase().replace(/\s+/g, " ");
  return OFFICE_STAFF_ROLES.some((o) => r === o || (r.includes("office") && r.includes("staff")));
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

/** Extract city from address/location objects. HCP varies: address.city, location.city, service_address.city. */
function extractCity(record: Record<string, unknown>): string | null {
  const sources = [
    record.address,
    record.location,
    record.service_address,
    record.serviceAddress,
    (record.customer as Record<string, unknown>)?.address,
  ];
  for (const src of sources) {
    if (src && typeof src === "object" && "city" in src) {
      const city = (src as { city: unknown }).city;
      if (typeof city === "string" && city.trim()) return city.trim();
    }
  }
  return null;
}

/** Extract first technician name from assigned_employees/assigned_pro. Uses last initial format. */
function extractTechnicianName(record: Record<string, unknown>): { name: string; hcpId: string } | null {
  const assigned = record.assigned_employees ?? record.assigned_pro ?? record.assigned_employee;
  const items = Array.isArray(assigned) ? assigned : assigned && typeof assigned === "object" ? [assigned] : [];
  for (const a of items) {
    if (!a || typeof a !== "object") continue;
    const r = a as Record<string, unknown>;
    if (isOfficeStaff(r.role ?? r.employee_type ?? r.type)) continue;
    const id = r.id ?? r.pro_id ?? r.employee_id;
    if (!id) continue;
    const first = String(r.first_name ?? (r as Record<string, unknown>).firstName ?? r.given_name ?? "").trim();
    const last = String(r.last_name ?? (r as Record<string, unknown>).lastName ?? r.family_name ?? "").trim();
    const fallback = (r.full_name ?? r.name ?? r.display_name) as string | undefined;
    let name: string;
    if (first || last) {
      name = last ? `${first} ${last[0]}`.trim() : first || "Unknown";
    } else if (typeof fallback === "string" && fallback.trim()) {
      const parts = fallback.trim().split(/\s+/);
      name = parts.length <= 1 ? fallback.trim() : [...parts.slice(0, -1), parts[parts.length - 1]![0]].join(" ").trim();
    } else {
      name = "Unknown";
    }
    return { name: name || "Unknown", hcpId: String(id) };
  }
  const fallback = record.pro_id ?? record.pro ?? record.employee_id ?? record.assigned_pro_id;
  if (typeof fallback === "string") return { name: "Technician", hcpId: fallback };
  if (fallback && typeof fallback === "object" && "id" in fallback) {
    const r = fallback as Record<string, unknown>;
    const name = extractTechnicianName(r as Record<string, unknown>)?.name ?? "Technician";
    return { name, hcpId: String(r.id) };
  }
  return null;
}

/** Format date for display (e.g. "Wed, Mar 5"). */
function formatScheduledDate(record: Record<string, unknown>): string | null {
  const sched = record.schedule as Record<string, unknown> | undefined;
  const wt = record.work_timestamps as Record<string, unknown> | undefined;
  const dateStr = (sched?.scheduled_start ?? sched?.scheduledStart ?? record.scheduled_start ?? wt?.completed_at ?? wt?.completed ?? record.created_at ?? record.createdAt) as string | undefined;
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" });
}

/** Get scheduled date as YYYY-MM-DD for DB. */
function getScheduledDateIso(record: Record<string, unknown>): string | null {
  const sched = record.schedule as Record<string, unknown> | undefined;
  const wt = record.work_timestamps as Record<string, unknown> | undefined;
  const dateStr = (sched?.scheduled_start ?? sched?.scheduledStart ?? record.scheduled_start ?? wt?.completed_at ?? wt?.completed ?? record.created_at ?? record.createdAt) as string | undefined;
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function hasApprovedOption(estimate: Record<string, unknown>): boolean {
  const options = estimate.options ?? estimate.estimate_options ?? estimate.line_items;
  const arr = Array.isArray(options) ? options : [];
  return arr.some(
    (opt: unknown) =>
      opt && typeof opt === "object" && ((opt as Record<string, unknown>).approval_status === "approved" || (opt as Record<string, unknown>).approval_status === "pro approved")
  );
}

function isPaidStatus(record: Record<string, unknown>): boolean {
  const status = (record.status ?? record.job_status ?? record.work_status ?? record.state ?? "").toString().toLowerCase();
  return ["paid", "completed", "complete", "closed", "done", "paid_in_full", "invoiced", "finished"].includes(status);
}

async function insertActivityFeedItem(params: {
  organizationId: string;
  activityType: string;
  message: string;
  technicianName?: string | null;
  technicianHcpId?: string | null;
  city?: string | null;
  amount?: number | null;
  scheduledDate?: string | null;
  jobHcpId?: string | null;
  eventHcpId?: string | null;
  rawPayload?: Record<string, unknown> | null;
}): Promise<void> {
  await sql`
    INSERT INTO activity_feed (organization_id, activity_type, message, technician_name, technician_hcp_id, city, amount, scheduled_date, job_hcp_id, event_hcp_id, raw_payload)
    VALUES (
      ${params.organizationId},
      ${params.activityType},
      ${params.message},
      ${params.technicianName ?? null},
      ${params.technicianHcpId ?? null},
      ${params.city ?? null},
      ${params.amount ?? null},
      ${params.scheduledDate ?? null},
      ${params.jobHcpId ?? null},
      ${params.eventHcpId ?? null},
      ${params.rawPayload ? JSON.stringify(params.rawPayload) : null}::jsonb
    )
  `;
}

async function maybeEmitActivityFeedItem(
  event: string,
  payload: Record<string, unknown>,
  organizationId: string,
  companyId: string
): Promise<void> {
  try {
    if (event === "job.created") {
      const job = (payload.job ?? payload.data ?? payload) as Record<string, unknown>;
      const city = extractCity(job) ?? "Unknown city";
      const day = formatScheduledDate(job) ?? "soon";
      const tech = extractTechnicianName(job);
      const message = tech
        ? `${tech.name} booked a job in ${city} for ${day}`
        : `A job in ${city} was just booked for ${day}`;
      await insertActivityFeedItem({
        organizationId,
        activityType: "job_booked",
        message,
        technicianName: tech?.name ?? null,
        technicianHcpId: tech?.hcpId ?? null,
        city,
        scheduledDate: getScheduledDateIso(job),
        jobHcpId: extractId(job),
        eventHcpId: extractId(job),
        rawPayload: payload,
      });
    } else if (event.startsWith("appointment.")) {
      const apt = (payload.appointment ?? payload.data ?? payload) as Record<string, unknown>;
      const wt = apt.work_timestamps as Record<string, unknown> | undefined;
      const enRoute = wt?.en_route_at ?? wt?.on_my_way_at ?? wt?.en_route ?? wt?.on_my_way;
      if (!enRoute) return;
      const jobHcpId = extractJobHcpId(apt);
      let job: Record<string, unknown> | null = (apt.job ?? payload.job) as Record<string, unknown> | null;
      if (!job && jobHcpId) {
        const rows = await sql`SELECT raw FROM jobs WHERE hcp_id = ${jobHcpId} AND company_id = ${companyId} LIMIT 1`;
        job = (rows.rows?.[0] as { raw: Record<string, unknown> } | undefined)?.raw ?? null;
      }
      const city = job ? extractCity(job) ?? "Unknown city" : "Unknown city";
      const tech = job ? extractTechnicianName(job) : extractTechnicianName(apt);
      const techName = tech?.name ?? "A technician";
      await insertActivityFeedItem({
        organizationId,
        activityType: "on_my_way",
        message: `${techName} is on their way to a job in ${city}`,
        technicianName: tech?.name ?? null,
        technicianHcpId: tech?.hcpId ?? null,
        city,
        jobHcpId: jobHcpId ?? undefined,
        eventHcpId: extractId(apt),
        rawPayload: payload,
      });
    } else if (event.startsWith("estimate.")) {
      const est = (payload.estimate ?? payload.data ?? payload) as Record<string, unknown>;
      if (!hasApprovedOption(est)) return;
      const amount = extractAmountInDollars(est, "total_amount", "subtotal", "total", "amount");
      const amountStr = amount != null ? amount.toFixed(2) : "—";
      const tech = extractTechnicianName(est);
      const techName = tech?.name ?? "A technician";
      await insertActivityFeedItem({
        organizationId,
        activityType: "estimate_approved",
        message: `${techName} just received approval for an estimate worth $${amountStr}`,
        technicianName: tech?.name ?? null,
        technicianHcpId: tech?.hcpId ?? null,
        amount: amount ?? undefined,
        jobHcpId: extractJobHcpId(est) ?? undefined,
        eventHcpId: extractId(est),
        rawPayload: payload,
      });
    } else if (event.startsWith("invoice.") || event.startsWith("job.")) {
      const record = event.startsWith("invoice.")
        ? (payload.invoice ?? payload.data ?? payload) as Record<string, unknown>
        : (payload.job ?? payload.data ?? payload) as Record<string, unknown>;
      const amountPaid = extractAmountInDollars(record, "amount_paid", "paid_amount", "total_paid");
      const paid = amountPaid != null && amountPaid > 0 ? true : isPaidStatus(record);
      if (!paid) return;
      const amount = amountPaid ?? extractAmountInDollars(record, "total_amount", "subtotal", "total", "amount");
      const amountStr = amount != null && amount > 0 ? amount.toFixed(2) : "—";
      let job: Record<string, unknown> | null = record;
      const jobHcpId = event.startsWith("invoice.") ? extractJobHcpId(record) : extractId(record);
      if (event.startsWith("invoice.") && jobHcpId) {
        const rows = await sql`SELECT raw FROM jobs WHERE hcp_id = ${jobHcpId} AND company_id = ${companyId} LIMIT 1`;
        job = (rows.rows?.[0] as { raw: Record<string, unknown> } | undefined)?.raw ?? record;
      }
      const tech = job ? extractTechnicianName(job) : null;
      const techName = tech?.name ?? "A technician";
      await insertActivityFeedItem({
        organizationId,
        activityType: "paid",
        message: `${techName} just got paid $${amountStr}`,
        technicianName: tech?.name ?? null,
        technicianHcpId: tech?.hcpId ?? null,
        amount: amount ?? undefined,
        jobHcpId: jobHcpId ?? undefined,
        eventHcpId: extractId(record),
        rawPayload: payload,
      });
    }
  } catch (err) {
    console.error("[ActivityFeed] Failed to emit activity item:", err);
  }
}

export async function persistWebhookEvent(
  event: string,
  payload: Record<string, unknown>,
  organizationId: string,
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

  // Emit activity feed items for relevant events
  if (
    event === "job.created" ||
    event.startsWith("appointment.") ||
    event.startsWith("estimate.") ||
    event.startsWith("invoice.") ||
    event.startsWith("job.")
  ) {
    await maybeEmitActivityFeedItem(event, payload, organizationId, companyId);
  }
}
