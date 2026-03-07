import { getHcpClient } from "../housecallpro";
import {
  getJobsFromDb,
  getEmployeesFromDb,
  getAllJobLineItemsByCompany,
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

export interface LineItemTimeMetric {
  lineItemId?: string;
  name: string;
  avgMinutesPerUnit: number;
  jobCount: number;
}

export interface TimeInsightsResult {
  averageJobsPerDayPerTechnician: TechnicianJobsPerDay[];
  averageDriveTimeMinutes: number | null;
  averageJobTimePerLineItem: LineItemTimeMetric[];
  excludedJobsCount: number; // jobs with multiple line items, excluded from line item report
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
          const enRoute = awt.en_route_at ?? awt.en_route;
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

  const enRoute = wt.en_route_at ?? wt.en_route;
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

function getLineItemKey(item: Record<string, unknown>): string {
  const name = item.name ?? item.description ?? item.title ?? item.service_name ?? "";
  const serviceId = item.service_id ?? item.price_book_item_id ?? item.id ?? "";
  return `${String(name).trim() || "(unnamed)"}|${String(serviceId)}`;
}

function getLineItemQuantity(item: Record<string, unknown>): number {
  const q = item.quantity ?? item.qty ?? item.count ?? 1;
  const n = typeof q === "number" && !Number.isNaN(q) ? q : typeof q === "string" ? parseFloat(q) || 1 : 1;
  return Math.max(1, n);
}

export async function getTimeInsights(
  organizationId: string,
  filters?: TimeInsightsFilters
): Promise<TimeInsightsResult> {
  let companyId = "default";
  try {
    const client = await getHcpClient(organizationId);
    const company = (await client.getCompany()) as { id?: string; company_id?: string };
    companyId = company?.id ?? company?.company_id ?? "default";
  } catch {
    /* fall through */
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

  const filteredJobs = jobs.filter((j) => jobInDateRange(j, startDate, endDate));

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

  // 3. Average job time per line item (single-line-item jobs only)
  const lineItemStats = new Map<string, { totalMinutes: number; jobCount: number; lineItemId?: string; name: string }>();
  let excludedJobsCount = 0;

  const lineItemsByJob = await getAllJobLineItemsByCompany(companyId).catch(() => new Map<string, Record<string, unknown>[]>());

  for (const job of filteredJobs) {
    const jobTime = getJobTimeMinutes(job);
    if (jobTime == null) continue;

    const jobHcpId = (job.id ?? job.uuid) != null ? String(job.id ?? job.uuid) : null;
    if (!jobHcpId) continue;

    const lineItems = lineItemsByJob.get(jobHcpId) ?? [];
    if (lineItems.length === 0) continue;

    // Group by line item key (name|service_id) and sum quantities
    const byKey = new Map<string, { quantity: number; item: Record<string, unknown> }>();
    for (const item of lineItems) {
      const key = getLineItemKey(item);
      const qty = getLineItemQuantity(item);
      const existing = byKey.get(key);
      if (existing) {
        existing.quantity += qty;
      } else {
        byKey.set(key, { quantity: qty, item });
      }
    }

    if (byKey.size > 1) {
      excludedJobsCount++;
      continue;
    }

    const entry = [...byKey.values()][0];
    const quantity = entry.quantity;
    const key = getLineItemKey(entry.item);
    const name = String(entry.item.name ?? entry.item.description ?? entry.item.title ?? entry.item.service_name ?? "(unnamed)").trim() || "(unnamed)";
    const lineItemId = (entry.item.id ?? entry.item.service_id) != null ? String(entry.item.id ?? entry.item.service_id) : undefined;

    const minutesPerUnit = jobTime / quantity;
    const existing = lineItemStats.get(key);
    if (existing) {
      existing.totalMinutes += minutesPerUnit;
      existing.jobCount += 1;
    } else {
      lineItemStats.set(key, {
        totalMinutes: minutesPerUnit,
        jobCount: 1,
        lineItemId,
        name,
      });
    }
  }

  const averageJobTimePerLineItem: LineItemTimeMetric[] = [...lineItemStats.entries()].map(([, v]) => ({
    lineItemId: v.lineItemId,
    name: v.name,
    avgMinutesPerUnit: Math.round((v.totalMinutes / v.jobCount) * 10) / 10,
    jobCount: v.jobCount,
  }));
  averageJobTimePerLineItem.sort((a, b) => b.jobCount - a.jobCount);

  return {
    averageJobsPerDayPerTechnician,
    averageDriveTimeMinutes,
    averageJobTimePerLineItem,
    excludedJobsCount,
  };
}
