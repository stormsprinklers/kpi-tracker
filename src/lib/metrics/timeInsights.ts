import { sql } from "@/lib/db";
import {
  getJobsFromDb,
  getEmployeesFromDb,
  getOrganizationById,
  getInvoicesFromDb,
  getTimeEntriesByOrganization,
  getCsrSelections,
  type TimeEntry,
} from "../db/queries";
import { calculateExpectedPay } from "../performancePay";

export interface TimeInsightsFilters {
  startDate?: string; // ISO date YYYY-MM-DD
  endDate?: string;   // ISO date YYYY-MM-DD
}

export interface TechnicianJobsPerDay {
  technicianId: string;
  technicianName: string;
  avgJobsPerDay: number;
}

export interface TimeInsightsResult {
  averageJobsPerDayPerTechnician: TechnicianJobsPerDay[];
  averageDriveTimeMinutes: number | null;
  averageLaborTimeMinutes: number | null;
  averageRevenuePerJob: number | null;
  /** Total paid revenue in period ÷ sum of timesheet hours tied to a job (job_hcp_id set), field staff only. */
  averageRevenuePerOnJobHour: number | null;
  /** Total paid revenue in period ÷ sum of all timesheet hours, field staff only (excludes CSR selections or office staff). */
  averageRevenuePerLoggedHour: number | null;
  /** Sum(expected pay) / sum(attributed revenue) from Performance Pay for the period, as 0–100+ (e.g. 35.5 = 35.5%). */
  laborPercentOfRevenue: number | null;
}

const OFFICE_STAFF_ROLES = ["office staff", "office_staff", "officestaff"];

/** Statuses that indicate finished / billable work (HCP varies by field and spelling). */
const DONE_OR_PAID_STATUSES = new Set([
  "completed",
  "complete",
  "closed",
  "done",
  "paid",
  "paid_in_full",
  "invoiced",
  "finished",
]);

function normalizeJobStatus(job: Record<string, unknown>): string {
  const raw =
    job.work_status ??
    job.status ??
    job.job_status ??
    job.state;
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function isCancelledJob(job: Record<string, unknown>): boolean {
  const s = normalizeJobStatus(job);
  return (
    s.includes("cancel") ||
    s === "void" ||
    s === "voided" ||
    s === "declined"
  );
}

/** Same first hop as technician revenue: only these statuses read job-level paid fields. */
function isPaidOrCompletedForJobBody(job: Record<string, unknown>): boolean {
  const s = normalizeJobStatus(job);
  return s === "in_progress" || s === "inprogress" || s === "completed" || s === "complete";
}

/**
 * Include in Time Insights if the job is active/done-like or has paid invoice data.
 * (Strict in_progress|completed-only filter dropped too many HCP jobs that still have timestamps/revenue.)
 */
function shouldIncludeJobInTimeInsights(paidAmount: number, job: Record<string, unknown>): boolean {
  if (paidAmount > 0) return true;
  const s = normalizeJobStatus(job);
  if (s === "in_progress" || s === "inprogress") return true;
  return DONE_OR_PAID_STATUSES.has(s);
}

function isOfficeStaff(role: unknown): boolean {
  const r = (role ?? "").toString().toLowerCase().replace(/\s+/g, " ");
  return OFFICE_STAFF_ROLES.some((o) => r === o || (r.includes("office") && r.includes("staff")));
}

/** HCP ids treated as CSR/office for timesheet RPH: explicit CSR selections, else office-staff role on employees/pros. */
async function getCsrHcpIdsForExclusion(
  organizationId: string,
  companyId: string
): Promise<Set<string>> {
  const selections = await getCsrSelections(organizationId).catch(() => [] as string[]);
  if (selections.length > 0) return new Set(selections);

  const excluded = new Set<string>();
  try {
    const empResult = await sql`
      SELECT hcp_id, raw FROM employees WHERE company_id = ${companyId}
    `;
    for (const row of empResult.rows ?? []) {
      const r = row as { hcp_id: string; raw: Record<string, unknown> };
      const raw = r.raw ?? {};
      if (isOfficeStaff(raw.role ?? raw.employee_type ?? raw.type)) excluded.add(r.hcp_id);
    }
  } catch {
    /* skip */
  }
  try {
    const prosResult = await sql`
      SELECT hcp_id, raw FROM pros WHERE company_id = ${companyId}
    `;
    for (const row of prosResult.rows ?? []) {
      const r = row as { hcp_id: string; raw: Record<string, unknown> };
      const raw = r.raw ?? {};
      if (isOfficeStaff(raw.role ?? raw.employee_type ?? raw.type)) excluded.add(r.hcp_id);
    }
  } catch {
    /* skip */
  }
  return excluded;
}

function hoursFromTimeEntry(e: TimeEntry): number {
  const fromCol =
    typeof e.hours === "number" && !Number.isNaN(e.hours)
      ? e.hours
      : typeof e.hours === "string"
        ? parseFloat(e.hours) || 0
        : 0;
  if (fromCol > 0) return fromCol;
  if (!e.start_time || !e.end_time || !e.entry_date) return 0;
  const [y, mo, d] = e.entry_date.split("-").map(Number);
  const [sh, sm] = e.start_time.split(":").map(Number);
  const [eh, em] = e.end_time.split(":").map(Number);
  const start = new Date(y, (mo || 1) - 1, d || 1, sh || 0, sm || 0, 0, 0);
  const end = new Date(y, (mo || 1) - 1, d || 1, eh || 0, em || 0, 0, 0);
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 0;
  return Math.round((ms / (1000 * 60 * 60)) * 100) / 100;
}

function getTechnicianIds(job: Record<string, unknown>): string[] {
  const assigned = job.assigned_employees ?? job.assigned_pro ?? job.assigned_employee;
  const items = Array.isArray(assigned) ? assigned : assigned && typeof assigned === "object" ? [assigned] : [];
  const ids: string[] = [];
  for (const a of items) {
    if (typeof a === "string") {
      ids.push(a);
      continue;
    }
    if (a && typeof a === "object" && "id" in a) {
      const r = a as Record<string, unknown>;
      if (isOfficeStaff(r.role ?? r.employee_type ?? r.type)) continue;
      ids.push(String(r.id));
    }
  }
  if (ids.length > 0) return ids;
  const fallback = job.pro_id ?? job.pro ?? job.employee_id ?? job.assigned_pro_id;
  if (typeof fallback === "string") return [fallback];
  if (fallback && typeof fallback === "object" && "id" in fallback) return [String((fallback as { id: unknown }).id)];
  return [];
}

function getEmployeeName(emp: Record<string, unknown>): string {
  const first = String(emp.first_name ?? emp.firstName ?? "").trim();
  const last = String(emp.last_name ?? emp.lastName ?? "").trim();
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name || String(emp.email ?? emp.email_address ?? emp.id ?? "Unknown");
}

/** Match technician revenue / key metrics: completed → scheduled → created (no started_at for range). */
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

function jobInDateRange(job: Record<string, unknown>, startDate?: string, endDate?: string): boolean {
  if (!startDate && !endDate) return true;
  const jobDate = getJobDate(job);
  if (!jobDate) return true;
  const jobDay = jobDate.toISOString().slice(0, 10);
  if (startDate && jobDay < startDate) return false;
  if (endDate && jobDay > endDate) return false;
  return true;
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

function parseWorkTimestampFields(wt: Record<string, unknown>): {
  enRouteAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
} {
  const enRoute = wt.on_my_way_at ?? wt.en_route_at ?? wt.en_route;
  const started = wt.started_at ?? wt.started ?? wt.arrived_at ?? wt.arrived;
  const completed = wt.completed_at ?? wt.completed;
  const enRouteDate = enRoute ? new Date(enRoute as string) : null;
  const startedDate = started ? new Date(started as string) : null;
  const completedDate = completed ? new Date(completed as string) : null;
  return {
    enRouteAt: enRouteDate && !Number.isNaN(enRouteDate.getTime()) ? enRouteDate : null,
    startedAt: startedDate && !Number.isNaN(startedDate.getTime()) ? startedDate : null,
    completedAt: completedDate && !Number.isNaN(completedDate.getTime()) ? completedDate : null,
  };
}

function extractTimestampsFromAssigned(job: Record<string, unknown>): {
  enRouteAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
} {
  const assigned = job.assigned_employees ?? job.assigned_pro ?? job.assigned_employee;
  const items = Array.isArray(assigned) ? assigned : assigned && typeof assigned === "object" ? [assigned] : [];
  const out = { enRouteAt: null as Date | null, startedAt: null as Date | null, completedAt: null as Date | null };
  for (const a of items) {
    if (!a || typeof a !== "object") continue;
    const awt = (a as Record<string, unknown>).work_timestamps as Record<string, unknown> | undefined;
    if (!awt) continue;
    const t = parseWorkTimestampFields(awt);
    if (!out.enRouteAt && t.enRouteAt) out.enRouteAt = t.enRouteAt;
    if (!out.startedAt && t.startedAt) out.startedAt = t.startedAt;
    if (!out.completedAt && t.completedAt) out.completedAt = t.completedAt;
    if (out.enRouteAt && out.startedAt && out.completedAt) break;
  }
  return out;
}

/** Job-level work_timestamps; if empty, use per-assignee timestamps (common in HCP payloads). */
function extractTimestamps(job: Record<string, unknown>): {
  enRouteAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
} {
  const wt = job.work_timestamps as Record<string, unknown> | undefined;
  if (wt && typeof wt === "object" && !Array.isArray(wt)) {
    const fromWt = parseWorkTimestampFields(wt);
    if (fromWt.enRouteAt || fromWt.startedAt || fromWt.completedAt) {
      return fromWt;
    }
  }
  return extractTimestampsFromAssigned(job);
}

/** Drive time in minutes. Returns null if timestamps missing. */
function getDriveTimeMinutes(job: Record<string, unknown>): number | null {
  const { enRouteAt, startedAt } = extractTimestamps(job);
  if (!enRouteAt || !startedAt) return null;
  const ms = startedAt.getTime() - enRouteAt.getTime();
  if (ms < 0) return null;
  return Math.round(ms / 60000);
}

/** Job time (on-site) in minutes. Returns null if timestamps missing. */
function getJobTimeMinutes(job: Record<string, unknown>): number | null {
  const { startedAt, completedAt } = extractTimestamps(job);
  if (!startedAt || !completedAt) return null;
  const ms = completedAt.getTime() - startedAt.getTime();
  if (ms < 0) return null;
  return Math.round(ms / 60000);
}

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

/** Match technician revenue / key metrics (cents fallbacks on job). */
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
    inv.total_amount;
  const cents = inv.amount_cents ?? inv.paid_cents;
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

async function resolvePaidAmountForJob(
  companyId: string,
  job: Record<string, unknown>
): Promise<number> {
  const isPaid = isPaidOrCompletedForJobBody(job);
  let paidAmount = isPaid ? getPaidAmountFromJob(job) : 0;
  if (paidAmount <= 0 && job.id) {
    try {
      const invoices = await getInvoicesFromDb(companyId, String(job.id));
      for (const inv of invoices) {
        paidAmount += getPaidAmountFromInvoice(inv as Record<string, unknown>);
      }
    } catch {
      /* skip */
    }
  }
  return paidAmount;
}

export async function getTimeInsights(
  organizationId: string,
  filters?: TimeInsightsFilters
): Promise<TimeInsightsResult> {
  const org = await getOrganizationById(organizationId).catch(() => null);
  const companyId = org?.hcp_company_id?.trim() ?? "";
  if (!companyId) {
    return {
      averageJobsPerDayPerTechnician: [],
      averageDriveTimeMinutes: null,
      averageLaborTimeMinutes: null,
      averageRevenuePerJob: null,
      averageRevenuePerOnJobHour: null,
      averageRevenuePerLoggedHour: null,
      laborPercentOfRevenue: null,
    };
  }

  const { startDate, endDate } = filters ?? {};

  const employees = await getEmployeesFromDb(companyId).catch(() => [] as Record<string, unknown>[]);
  const employeeMap = new Map<string, string>();
  for (const emp of employees) {
    const id = (emp.id ?? emp.uuid) != null ? String(emp.id ?? emp.uuid) : null;
    if (id) employeeMap.set(id, getEmployeeName(emp));
  }

  const jobs = await getJobsFromDb(companyId).catch(() => [] as Record<string, unknown>[]);
  const todayYmd = new Date().toISOString().slice(0, 10);

  /** Same inclusion idea as technician revenue: date + not future-scheduled + not cancelled + paid or active/done status. */
  const included: { job: Record<string, unknown>; paid: number }[] = [];
  for (const j of jobs) {
    if (!jobInDateRange(j, startDate, endDate)) continue;
    if (isFutureScheduledJob(j, todayYmd)) continue;
    if (isCancelledJob(j)) continue;
    const paid = await resolvePaidAmountForJob(companyId, j);
    if (!shouldIncludeJobInTimeInsights(paid, j)) continue;
    included.push({ job: j, paid });
  }

  // 1. Average jobs per day per technician
  const jobsByTechAndDate = new Map<string, Map<string, number>>();
  for (const { job } of included) {
    const techIds = getTechnicianIds(job);
    const jobDate = getJobDate(job);
    const jobDay = jobDate ? jobDate.toISOString().slice(0, 10) : null;
    if (!jobDay) continue;
    for (const techId of techIds) {
      let byDate = jobsByTechAndDate.get(techId);
      if (!byDate) {
        byDate = new Map<string, number>();
        jobsByTechAndDate.set(techId, byDate);
      }
      byDate.set(jobDay, (byDate.get(jobDay) ?? 0) + 1);
    }
  }

  const averageJobsPerDayPerTechnician: TechnicianJobsPerDay[] = [];
  for (const [techId, byDate] of jobsByTechAndDate) {
    const days = byDate.size;
    if (days === 0) continue;
    const totalJobs = [...byDate.values()].reduce((a, b) => a + b, 0);
    const avgJobsPerDay = totalJobs / days;
    averageJobsPerDayPerTechnician.push({
      technicianId: techId,
      technicianName: employeeMap.get(techId) ?? techId,
      avgJobsPerDay: Math.round(avgJobsPerDay * 100) / 100,
    });
  }
  averageJobsPerDayPerTechnician.sort((a, b) => b.avgJobsPerDay - a.avgJobsPerDay);

  // 2. Average drive time
  let totalDriveMinutes = 0;
  let driveCount = 0;
  for (const { job } of included) {
    const drive = getDriveTimeMinutes(job);
    if (drive != null) {
      totalDriveMinutes += drive;
      driveCount++;
    }
  }
  const averageDriveTimeMinutes = driveCount > 0 ? Math.round(totalDriveMinutes / driveCount) : null;

  // 3. Overall labor and revenue rollups (paid amounts include invoice fallback)
  let totalLaborMinutes = 0;
  let laborJobCount = 0;
  let totalPaidRevenue = 0;
  let paidJobCount = 0;
  for (const { job, paid } of included) {
    if (paid > 0) {
      totalPaidRevenue += paid;
      paidJobCount += 1;
    }

    const jobTime = getJobTimeMinutes(job);
    if (jobTime == null) continue;
    totalLaborMinutes += jobTime;
    laborJobCount += 1;
  }

  const averageLaborTimeMinutes =
    laborJobCount > 0 ? Math.round(totalLaborMinutes / laborJobCount) : null;
  const averageRevenuePerJob =
    paidJobCount > 0 ? Math.round((totalPaidRevenue / paidJobCount) * 100) / 100 : null;

  let averageRevenuePerOnJobHour: number | null = null;
  let averageRevenuePerLoggedHour: number | null = null;
  if (startDate && endDate) {
    const csrIds = await getCsrHcpIdsForExclusion(organizationId, companyId);
    const timeEntries = await getTimeEntriesByOrganization(
      organizationId,
      startDate,
      endDate
    ).catch(() => [] as TimeEntry[]);

    let totalOnJobClockHours = 0;
    let totalFieldLoggedHours = 0;
    for (const e of timeEntries) {
      const empId = e.hcp_employee_id ?? "";
      if (!empId || csrIds.has(empId)) continue;
      const h = hoursFromTimeEntry(e);
      if (h <= 0) continue;
      totalFieldLoggedHours += h;
      const jobKey = e.job_hcp_id != null ? String(e.job_hcp_id).trim() : "";
      if (jobKey !== "") totalOnJobClockHours += h;
    }

    if (totalOnJobClockHours > 0) {
      averageRevenuePerOnJobHour =
        Math.round((totalPaidRevenue / totalOnJobClockHours) * 100) / 100;
    }
    if (totalFieldLoggedHours > 0) {
      averageRevenuePerLoggedHour =
        Math.round((totalPaidRevenue / totalFieldLoggedHours) * 100) / 100;
    }
  }

  let laborPercentOfRevenue: number | null = null;
  if (startDate && endDate) {
    try {
      const expectedRows = await calculateExpectedPay({
        organizationId,
        startDate,
        endDate,
      });
      let totalExpectedPay = 0;
      let totalAttributedRevenue = 0;
      for (const r of expectedRows) {
        totalExpectedPay += typeof r.expectedPay === "number" ? r.expectedPay : 0;
        totalAttributedRevenue += typeof r.totalRevenue === "number" ? r.totalRevenue : 0;
      }
      if (totalAttributedRevenue > 0) {
        laborPercentOfRevenue =
          Math.round((totalExpectedPay / totalAttributedRevenue) * 10000) / 100;
      }
    } catch {
      laborPercentOfRevenue = null;
    }
  }

  return {
    averageJobsPerDayPerTechnician,
    averageDriveTimeMinutes,
    averageLaborTimeMinutes,
    averageRevenuePerJob,
    averageRevenuePerOnJobHour,
    averageRevenuePerLoggedHour,
    laborPercentOfRevenue,
  };
}
