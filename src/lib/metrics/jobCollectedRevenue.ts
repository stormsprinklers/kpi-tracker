/**
 * Single definition of “cash collected on jobs” for KPIs (invoice fallback included).
 * Used by technician revenue, key metrics, sales metrics, time insights, marketing helpers, etc.
 */
import { getInvoicesFromDb, getJobsFromDb } from "../db/queries";

/** HCP sends amounts in cents; convert when values look like cents (defensive). */
export function jobCollectedRevenueToDollars(value: unknown): number {
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

export function getCollectedRevenueFromInvoice(inv: Record<string, unknown>): number {
  const val =
    inv.paid_amount ??
    inv.amount_paid ??
    inv.total ??
    inv.paid_total ??
    inv.amount ??
    (inv as Record<string, unknown>).total_amount;
  const cents = (inv as Record<string, unknown>).amount_cents ?? (inv as Record<string, unknown>).paid_cents;
  if (typeof cents === "number" && cents > 0) return cents / 100;
  const n =
    typeof val === "number" && !Number.isNaN(val)
      ? val
      : typeof val === "string"
        ? parseFloat(val) || 0
        : 0;
  if (n <= 0) return 0;
  if (Number.isInteger(n) && n > 3000) return n / 100;
  return n;
}

/** Same field precedence as legacy technician/key-metrics logic (job JSON + totals/financial). */
export function getCollectedRevenueFromJob(job: Record<string, unknown>): number {
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
  let totalNum = jobCollectedRevenueToDollars(total);
  if (totalNum <= 0) {
    const cents = job.amount_cents ?? job.total_cents ?? totals?.amount_cents;
    if (typeof cents === "number" && cents > 0) totalNum = cents / 100;
  }
  if (Number.isInteger(totalNum) && totalNum > 3000) totalNum = totalNum / 100;
  const outNum = jobCollectedRevenueToDollars(outstanding);
  return Math.max(0, totalNum - outNum) || totalNum;
}

/** Only these statuses read paid fields from the job body first (invoice fallback always applies when needed). */
export function isJobPaidOrCompletedForCollectedBody(job: Record<string, unknown>): boolean {
  const status = (job.work_status ?? "").toString().trim().toLowerCase();
  return status === "in_progress" || status === "completed";
}

export async function resolveCollectedRevenueForJob(
  companyId: string,
  job: Record<string, unknown>
): Promise<number> {
  const isPaid = isJobPaidOrCompletedForCollectedBody(job);
  let paidAmount = isPaid ? getCollectedRevenueFromJob(job) : 0;
  if (paidAmount <= 0 && job.id) {
    try {
      const invoices = await getInvoicesFromDb(companyId, String(job.id));
      for (const inv of invoices) {
        paidAmount += getCollectedRevenueFromInvoice(inv as Record<string, unknown>);
      }
    } catch {
      /* skip */
    }
  }
  return paidAmount;
}

/** Completed timestamp first, else scheduled start — matches technician KPI date bucketing. */
export function getCollectedRevenueJobDate(job: Record<string, unknown>): Date | null {
  const wt = job.work_timestamps as Record<string, unknown> | undefined;
  const sched = job.schedule as Record<string, unknown> | undefined;
  const completed = wt?.completed_at ?? wt?.completed;
  const scheduled = sched?.scheduled_start ?? sched?.scheduledStart ?? job.scheduled_start;
  const dateStr = (completed ?? scheduled) as string | undefined;
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getScheduledJobDate(job: Record<string, unknown>): Date | null {
  const sched = job.schedule as Record<string, unknown> | undefined;
  const scheduled = sched?.scheduled_start ?? sched?.scheduledStart ?? job.scheduled_start;
  const dateStr = scheduled as string | undefined;
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function jobIsFutureScheduledBeyond(job: Record<string, unknown>, todayYmd: string): boolean {
  const scheduled = getScheduledJobDate(job);
  if (!scheduled) return false;
  const scheduledDay = scheduled.toISOString().slice(0, 10);
  return scheduledDay > todayYmd;
}

/** Inclusive YYYY-MM-DD range on UTC calendar day derived from {@link getCollectedRevenueJobDate}. */
export function jobMatchesCollectedRevenueDateRange(
  job: Record<string, unknown>,
  startDate?: string | null,
  endDate?: string | null
): boolean {
  const start = startDate ?? undefined;
  const end = endDate ?? undefined;
  if (!start && !end) return true;
  const jobDate = getCollectedRevenueJobDate(job);
  if (!jobDate) return false;
  const jobDay = jobDate.toISOString().slice(0, 10);
  if (start && jobDay < start) return false;
  if (end && jobDay > end) return false;
  return true;
}

export async function aggregateCollectedJobRevenueForCompany(
  companyId: string,
  options: { startDate?: string | null; endDate?: string | null }
): Promise<{ totalRevenue: number; paidJobCount: number }> {
  let jobs: Record<string, unknown>[] = [];
  try {
    jobs = await getJobsFromDb(companyId);
  } catch {
    return { totalRevenue: 0, paidJobCount: 0 };
  }
  const todayYmd = new Date().toISOString().slice(0, 10);
  let totalRevenue = 0;
  let paidJobCount = 0;
  const start = options.startDate ?? undefined;
  const end = options.endDate ?? undefined;

  for (const job of jobs) {
    const j = job as Record<string, unknown>;
    if (!jobMatchesCollectedRevenueDateRange(j, start, end)) continue;
    if (jobIsFutureScheduledBeyond(j, todayYmd)) continue;
    const paid = await resolveCollectedRevenueForJob(companyId, j);
    if (paid > 0) {
      totalRevenue += paid;
      paidJobCount += 1;
    }
  }
  return { totalRevenue, paidJobCount };
}
