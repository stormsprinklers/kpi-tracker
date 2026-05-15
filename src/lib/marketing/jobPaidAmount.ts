/** Align paid job $ with shared collected-revenue helpers (same as technician / key metrics). */
import {
  getCollectedRevenueFromInvoice,
  getCollectedRevenueFromJob,
  isJobPaidOrCompletedForCollectedBody,
} from "@/lib/metrics/jobCollectedRevenue";

export function isPaidOrCompletedJob(job: Record<string, unknown>): boolean {
  return isJobPaidOrCompletedForCollectedBody(job);
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
  return isPaid ? getCollectedRevenueFromJob(job) : 0;
}

export function isBookedJob(job: Record<string, unknown>): boolean {
  const sched = job.schedule as Record<string, unknown> | undefined;
  const start = sched?.scheduled_start ?? sched?.scheduledStart ?? job.scheduled_start;
  if (start && String(start).trim()) return true;
  const s = (job.work_status ?? job.status ?? job.job_status ?? "").toString().trim().toLowerCase();
  return ["scheduled", "in_progress", "completed", "complete"].includes(s);
}

export { getCollectedRevenueFromInvoice as getPaidAmountFromInvoice };
