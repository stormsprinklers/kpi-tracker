import { getHcpClient } from "../housecallpro";
import {
  getJobsFromDb,
  getEmployeesFromDb,
  getOrganizationById,
} from "../db/queries";

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
  averageRevenuePerHour: number | null;
}

const OFFICE_STAFF_ROLES = ["office staff", "office_staff", "officestaff"];

function isOfficeStaff(role: unknown): boolean {
  const r = (role ?? "").toString().toLowerCase().replace(/\s+/g, " ");
  return OFFICE_STAFF_ROLES.some((o) => r === o || (r.includes("office") && r.includes("staff")));
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

function getJobDate(job: Record<string, unknown>): Date | null {
  const wt = job.work_timestamps as Record<string, unknown> | undefined;
  const sched = job.schedule as Record<string, unknown> | undefined;
  const completed = wt?.completed_at ?? wt?.completed;
  const started = wt?.started_at ?? wt?.started ?? wt?.arrived_at ?? wt?.arrived;
  const scheduled = sched?.scheduled_start ?? sched?.scheduledStart ?? job.scheduled_start;
  const created = job.created_at ?? job.createdAt;
  const dateStr = (completed ?? started ?? scheduled ?? created) as string | undefined;
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

function isKpiJobStatus(job: Record<string, unknown>): boolean {
  const status = String(job.work_status ?? "").trim().toLowerCase();
  return status === "in_progress" || status === "completed";
}

/** Extract timestamps from job. Handles job-level work_timestamps and per-assigned-employee. */
function extractTimestamps(job: Record<string, unknown>): {
  enRouteAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
} {
  const wt = job.work_timestamps as Record<string, unknown> | undefined;
  if (!wt) {
    // Check assigned_employees for per-tech timestamps
    const assigned = job.assigned_employees ?? job.assigned_pro ?? job.assigned_employee;
    const items = Array.isArray(assigned) ? assigned : assigned && typeof assigned === "object" ? [assigned] : [];
    for (const a of items) {
      if (a && typeof a === "object") {
        const awt = (a as Record<string, unknown>).work_timestamps as Record<string, unknown> | undefined;
        if (awt) {
          const enRoute = awt.on_my_way_at ?? awt.en_route_at ?? awt.en_route;
          const started = awt.started_at ?? awt.started ?? awt.arrived_at ?? awt.arrived;
          const completed = awt.completed_at ?? awt.completed;
          const enRouteDate = enRoute ? new Date(enRoute as string) : null;
          const startedDate = started ? new Date(started as string) : null;
          const completedDate = completed ? new Date(completed as string) : null;
          if (enRouteDate && !Number.isNaN(enRouteDate.getTime())) return { enRouteAt: enRouteDate, startedAt: startedDate && !Number.isNaN(startedDate.getTime()) ? startedDate : null, completedAt: completedDate && !Number.isNaN(completedDate.getTime()) ? completedDate : null };
        }
      }
    }
    return { enRouteAt: null, startedAt: null, completedAt: null };
  }

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
  const totalNum = toDollars(total);
  const outNum = toDollars(outstanding);
  return Math.max(0, totalNum - outNum) || totalNum;
}

export async function getTimeInsights(
  organizationId: string,
  filters?: TimeInsightsFilters
): Promise<TimeInsightsResult> {
  let companyId = "default";
  try {
    const org = await getOrganizationById(organizationId);
    if (org?.hcp_company_id) {
      companyId = org.hcp_company_id;
    }
    const client = await getHcpClient(organizationId);
    const company = (await client.getCompany()) as { id?: string; company_id?: string };
    companyId = company?.id ?? company?.company_id ?? companyId;
  } catch {
    const org = await getOrganizationById(organizationId).catch(() => null);
    if (org?.hcp_company_id) companyId = org.hcp_company_id;
  }

  const { startDate, endDate } = filters ?? {};

  const employees = await getEmployeesFromDb(companyId).catch(() => [] as Record<string, unknown>[]);
  const employeeMap = new Map<string, string>();
  for (const emp of employees) {
    const id = (emp.id ?? emp.uuid) != null ? String(emp.id ?? emp.uuid) : null;
    if (id) employeeMap.set(id, getEmployeeName(emp));
  }

  let jobs = await getJobsFromDb(companyId).catch(() => [] as Record<string, unknown>[]);
  if (jobs.length === 0) {
    try {
      const client = await getHcpClient(organizationId);
      const apiJobs = await client.getJobsAllPages();
      jobs = (Array.isArray(apiJobs) ? apiJobs : []) as Record<string, unknown>[];
    } catch {
      /* skip */
    }
  }

  const filteredJobs = jobs.filter(
    (j) => jobInDateRange(j, startDate, endDate) && isKpiJobStatus(j)
  );

  // 1. Average jobs per day per technician
  const jobsByTechAndDate = new Map<string, Map<string, number>>();
  for (const job of filteredJobs) {
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
  for (const job of filteredJobs) {
    const drive = getDriveTimeMinutes(job);
    if (drive != null) {
      totalDriveMinutes += drive;
      driveCount++;
    }
  }
  const averageDriveTimeMinutes = driveCount > 0 ? Math.round(totalDriveMinutes / driveCount) : null;

  // 3. Overall labor and revenue rollups
  let totalLaborMinutes = 0;
  let laborJobCount = 0;
  let totalPaidRevenue = 0;
  let paidJobCount = 0;
  let totalRevenueOnLaborJobs = 0;
  for (const job of filteredJobs) {
    const paid = getPaidAmountFromJob(job);
    if (paid > 0) {
      totalPaidRevenue += paid;
      paidJobCount += 1;
    }

    const jobTime = getJobTimeMinutes(job);
    if (jobTime == null) continue;
    totalLaborMinutes += jobTime;
    laborJobCount += 1;
    if (paid > 0) {
      totalRevenueOnLaborJobs += paid;
    }
  }

  const averageLaborTimeMinutes =
    laborJobCount > 0 ? Math.round(totalLaborMinutes / laborJobCount) : null;
  const averageRevenuePerJob =
    paidJobCount > 0 ? Math.round((totalPaidRevenue / paidJobCount) * 100) / 100 : null;
  const averageRevenuePerHour =
    totalLaborMinutes > 0
      ? Math.round((totalRevenueOnLaborJobs / (totalLaborMinutes / 60)) * 100) / 100
      : null;

  return {
    averageJobsPerDayPerTechnician,
    averageDriveTimeMinutes,
    averageLaborTimeMinutes,
    averageRevenuePerJob,
    averageRevenuePerHour,
  };
}
