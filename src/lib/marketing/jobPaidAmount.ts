/** Align paid job $ with key metrics / technician revenue heuristics. */

function toDollars(value: unknown): number {
  const n =
    typeof value === "number" && !Number.isNaN(value)
      ? value
      : typeof value === "string"
        ? parseFloat(value) || 0
        : 0;
  if (n <= 0) return 0;
  if (Number.isInteger(n) && n > 3000) return n / 100;
  return n;
}

function getPaidAmountFromInvoice(inv: Record<string, unknown>): number {
  const val =
    inv.paid_amount ??
    inv.amount_paid ??
    inv.total ??
    inv.paid_total ??
    inv.amount ??
    (inv as Record<string, unknown>).total_amount;
  const cents = (inv as Record<string, unknown>).amount_cents ?? (inv as Record<string, unknown>).paid_cents;
  if (typeof cents === "number" && cents > 0) return cents / 100;
  const n = typeof val === "number" && !Number.isNaN(val) ? val : typeof val === "string" ? parseFloat(val) || 0 : 0;
  if (n <= 0) return 0;
  if (Number.isInteger(n) && n > 3000) return n / 100;
  return n;
}

function getPaidAmountFromJob(job: Record<string, unknown>): number {
  const totals = job.totals as Record<string, unknown> | undefined;
  const financial = job.financial as Record<string, unknown> | undefined;
  const total =
    job.total_amount ??
    job.amount_paid ??
    job.total_paid ??
    job.total ??
    job.paid_amount ??
    job.revenue ??
    totals?.total_amount ??
    totals?.total ??
    financial?.total_amount ??
    financial?.paid_amount;
  const outstanding =
    job.outstanding_balance ??
    job.balance_due ??
    job.amount_due ??
    totals?.outstanding_balance ??
    financial?.outstanding_balance ??
    0;
  let totalNum = toDollars(total);
  if (totalNum <= 0) {
    const cents = job.amount_cents ?? job.total_cents ?? totals?.amount_cents;
    if (typeof cents === "number" && cents > 0) totalNum = cents / 100;
  }
  if (Number.isInteger(totalNum) && totalNum > 3000) totalNum = totalNum / 100;
  const outNum = toDollars(outstanding);
  return Math.max(0, totalNum - outNum) || totalNum;
}

export function isPaidOrCompletedJob(job: Record<string, unknown>): boolean {
  const status = (job.work_status ?? "").toString().trim().toLowerCase();
  return status === "in_progress" || status === "completed";
}

/**
 * Best-effort paid $ for a job using row denormalized amounts when present (sync path),
 * else raw JSON fields only (no invoice fetch).
 */
export function getMarketingJobPaidAmount(job: Record<string, unknown>): number {
  const colTotal = job.total_amount;
  const colOut = job.outstanding_balance;
  if (typeof colTotal === "number" && colTotal > 0) {
    const paid = colTotal - (typeof colOut === "number" ? colOut : 0);
    return Math.max(0, paid);
  }
  const isPaid = isPaidOrCompletedJob(job);
  return isPaid ? getPaidAmountFromJob(job) : 0;
}

export function isBookedJob(job: Record<string, unknown>): boolean {
  const sched = job.schedule as Record<string, unknown> | undefined;
  const start = sched?.scheduled_start ?? sched?.scheduledStart ?? job.scheduled_start;
  if (start && String(start).trim()) return true;
  const s = (job.work_status ?? job.status ?? job.job_status ?? "").toString().trim().toLowerCase();
  return ["scheduled", "in_progress", "completed", "complete"].includes(s);
}

export { getPaidAmountFromInvoice };
