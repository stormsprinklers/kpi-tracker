import {
  getEstimatesFromDb,
  getInvoicesFromDb,
  getJobsFromDb,
  getOrganizationById,
} from "../db/queries";
import { getTechnicianRevenue } from "./technicianRevenue";

export type KeyMetricsRange =
  | "7d"
  | "30d"
  | "all"
  | "thisPayPeriod"
  | "lastPayPeriod";

export interface KeyMetrics {
  jobCount: number;
  revenue: number;
  avgJobValue: number | null;
  conversionRate: number | null;
}

function toDollars(value: unknown): number {
  const n = typeof value === "number" && !Number.isNaN(value) ? value : typeof value === "string" ? parseFloat(value) || 0 : 0;
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

function isPaidOrCompleted(job: Record<string, unknown>): boolean {
  const status = (job.work_status ?? "").toString().trim().toLowerCase();
  return status === "in_progress" || status === "completed";
}

function getJobDate(job: Record<string, unknown>): Date | null {
  const wt = job.work_timestamps as Record<string, unknown> | undefined;
  const sched = job.schedule as Record<string, unknown> | undefined;
  const completed = wt?.completed_at ?? wt?.completed;
  const scheduled = sched?.scheduled_start ?? sched?.scheduledStart ?? job.scheduled_start;
  const created = job.created_at ?? job.createdAt;
  const dateStr = (completed ?? scheduled ?? created) as string | undefined;
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

function jobInDateRange(job: Record<string, unknown>, startDate: string | null, endDate: string | null): boolean {
  if (!startDate || !endDate) return true;
  const jobDate = getJobDate(job);
  if (!jobDate) return true;
  const jobDay = jobDate.toISOString().slice(0, 10);
  return jobDay >= startDate && jobDay <= endDate;
}

function getEstimateDate(estimate: Record<string, unknown>): Date | null {
  const wt = estimate.work_timestamps as Record<string, unknown> | undefined;
  const sched = estimate.schedule as Record<string, unknown> | undefined;
  const completed = wt?.completed_at ?? wt?.completed;
  const scheduled = sched?.scheduled_start ?? sched?.scheduledStart ?? estimate.scheduled_start;
  const created = estimate.created_at ?? estimate.createdAt;
  const updated = estimate.updated_at ?? estimate.updatedAt;
  const dateStr = (completed ?? scheduled ?? created ?? updated) as string | undefined;
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

function isFutureScheduledJob(job: Record<string, unknown>, todayYmd: string): boolean {
  const scheduled = getScheduledJobDate(job);
  if (!scheduled) return false;
  const scheduledDay = scheduled.toISOString().slice(0, 10);
  return scheduledDay > todayYmd;
}

function getPayPeriodRange(offset: 0 | -1): { startDate: string; endDate: string } {
  const dayMs = 24 * 60 * 60 * 1000;
  const periodDays = 14;
  const anchorStart = new Date(Date.UTC(2026, 2, 21)); // 2026-03-21
  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const diffDays = Math.floor((todayUtc.getTime() - anchorStart.getTime()) / dayMs);
  const currentIndex = Math.floor(diffDays / periodDays);
  const index = currentIndex + offset;
  const start = new Date(anchorStart.getTime() + index * periodDays * dayMs);
  const end = new Date(start.getTime() + (periodDays - 1) * dayMs);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function estimateInDateRange(estimate: Record<string, unknown>, startDate: string | null, endDate: string | null): boolean {
  if (!startDate || !endDate) return true;
  const estDate = getEstimateDate(estimate);
  if (!estDate) return true;
  const estDay = estDate.toISOString().slice(0, 10);
  return estDay >= startDate && estDay <= endDate;
}

function hasApprovedOption(estimate: Record<string, unknown>): boolean {
  const options = estimate.options as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(options)) return false;
  return options.some(
    (opt) => opt.approval_status === "approved" || opt.approval_status === "pro approved"
  );
}

function getDateRangeForPeriod(range: KeyMetricsRange): { startDate: string | null; endDate: string | null } {
  if (range === "thisPayPeriod") {
    const p = getPayPeriodRange(0);
    return { startDate: p.startDate, endDate: p.endDate };
  }
  if (range === "lastPayPeriod") {
    const p = getPayPeriodRange(-1);
    return { startDate: p.startDate, endDate: p.endDate };
  }

  const today = new Date();
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);
  const endStr = end.toISOString().slice(0, 10);

  if (range === "all") return { startDate: null, endDate: null };

  const start = new Date(today);
  start.setDate(start.getDate() - (range === "7d" ? 7 : 30));
  const startStr = start.toISOString().slice(0, 10);
  return { startDate: startStr, endDate: endStr };
}

export type KeyMetricsInput =
  | KeyMetricsRange
  | { startDate: string | null; endDate: string | null };

function resolveKeyMetricsWindow(
  input: KeyMetricsInput
): { startDate: string | null; endDate: string | null } {
  if (typeof input === "string") {
    return getDateRangeForPeriod(input);
  }
  return { startDate: input.startDate, endDate: input.endDate };
}

export async function getKeyMetrics(organizationId: string, input: KeyMetricsInput = "7d"): Promise<KeyMetrics> {
  const org = await getOrganizationById(organizationId);
  const companyId = org?.hcp_company_id?.trim() || "";
  if (!companyId) {
    return { jobCount: 0, revenue: 0, avgJobValue: null, conversionRate: null };
  }

  const { startDate, endDate } = resolveKeyMetricsWindow(input);

  let jobs: unknown[] = [];
  try {
    jobs = await getJobsFromDb(companyId);
  } catch {
    /* skip */
  }

  let jobCount = 0;
  let revenue = 0;
  const todayYmd = new Date().toISOString().slice(0, 10);

  for (const job of jobs) {
    const j = job as Record<string, unknown>;
    if (!jobInDateRange(j, startDate, endDate)) continue;
    if (isFutureScheduledJob(j, todayYmd)) continue;

    const isPaid = isPaidOrCompleted(j);
    let paidAmount = isPaid ? getPaidAmountFromJob(j) : 0;
    if (paidAmount <= 0 && j.id) {
      try {
        const invoices = await getInvoicesFromDb(companyId, String(j.id));
        for (const inv of invoices) {
          paidAmount += getPaidAmountFromInvoice(inv as Record<string, unknown>);
        }
      } catch {
        /* skip */
      }
      if (paidAmount <= 0) {
        // DB-only KPI mode: no live API fallback
      }
    }

    revenue += paidAmount;
    if (paidAmount > 0) {
      jobCount += 1;
    }
  }

  let estimates: unknown[] = [];
  try {
    estimates = await getEstimatesFromDb(companyId);
  } catch {
    /* skip */
  }

  let totalEstimates = 0;
  let approvedEstimates = 0;
  for (const est of estimates) {
    const e = est as Record<string, unknown>;
    if (!estimateInDateRange(e, startDate, endDate)) continue;
    totalEstimates += 1;
    if (hasApprovedOption(e)) approvedEstimates += 1;
  }

  // Keep Key Metrics revenue aligned with Technician KPI revenue calculation.
  // This avoids drift between the two cards when source filters/logic evolve.
  const techRevenue = await getTechnicianRevenue(organizationId, {
    startDate: startDate ?? undefined,
    endDate: endDate ?? undefined,
    activeInCurrentYearOnly: true,
  });
  revenue = techRevenue.totalRevenue;

  const conversionRate = totalEstimates > 0 ? (approvedEstimates / totalEstimates) * 100 : null;
  // Job count and average ticket exclude $0 jobs (same divisor as revenue alignment below).
  const avgJobValue = jobCount > 0 ? revenue / jobCount : null;

  return {
    jobCount,
    revenue,
    avgJobValue,
    conversionRate,
  };
}
