import {
  getJobsFromDb,
  getEmployeesFromDb,
  getInvoicesFromDb,
  getProsFromDb,
  getEstimatesFromDb,
  getTimeEntriesByOrganization,
  getJobRevenueAssignments,
  getOrganizationById,
  listCrewsWithMembers,
} from "../db/queries";
import { extractJobHcpId } from "../sync/extractors";

export interface TechnicianRevenue {
  technicianId: string;
  technicianName: string;
  totalRevenue: number;
  conversionRate: number | null;
  revenuePerHour: number | null;
  avgTicket: number | null;
}

export interface CrewRevenue {
  crewId: string;
  crewName: string;
  /** Foreman display name from synced HCP roster (not tied to app login). */
  foremanLabel: string;
  /** HCP employee ids included in this crew rollup */
  technicianIds: string[];
  totalRevenue: number;
  conversionRate: number | null;
  revenuePerHour: number | null;
  avgTicket: number | null;
}

export interface TechnicianRevenueResult {
  technicians: TechnicianRevenue[];
  totalRevenue: number;
  /** Present when the org has at least one configured crew */
  crews?: CrewRevenue[];
}

export interface TechnicianRevenueFilters {
  startDate?: string; // ISO date YYYY-MM-DD
  endDate?: string;   // ISO date YYYY-MM-DD
  /** When true (default), only include technicians with at least one job in the current calendar year */
  activeInCurrentYearOnly?: boolean;
}

const OFFICE_STAFF_ROLES = ["office staff", "office_staff", "officestaff"];

function isOfficeStaff(role: unknown): boolean {
  const r = (role ?? "").toString().toLowerCase().replace(/\s+/g, " ");
  return OFFICE_STAFF_ROLES.some((o) => r === o || (r.includes("office") && r.includes("staff")));
}

// HCP API uses assigned_employees (array). Fallback to assigned_pro, pro_id, etc.
// Excludes office staff (role "office staff" etc.)
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

/** HCP sends amounts in cents. Convert to dollars when value looks like cents (defensive for bad data). */
function toDollars(value: unknown): number {
  const n = typeof value === "number" && !Number.isNaN(value) ? value : typeof value === "string" ? parseFloat(value) || 0 : 0;
  if (n <= 0) return 0;
  // Defensive: integers > 3k are likely cents (HCP format; $30+ as integer = cents)
  if (Number.isInteger(n) && n > 3000) return n / 100;
  return n;
}

function getPaidAmountFromJob(job: Record<string, unknown>): number {
  // HCP may use various field names; also check nested totals/financial
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
  // Last-resort: HCP amounts are cents; values > 10000 are almost certainly cents (no single job is $10k+ in raw units)
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
  // HCP invoices: prefer amount_cents when present (explicit cents)
  const cents = (inv as Record<string, unknown>).amount_cents ?? (inv as Record<string, unknown>).paid_cents;
  if (typeof cents === "number" && cents > 0) return cents / 100;
  const n = typeof val === "number" && !Number.isNaN(val) ? val : typeof val === "string" ? parseFloat(val) || 0 : 0;
  if (n <= 0) return 0;
  // Defensive: large integers likely cents (HCP format)
  if (Number.isInteger(n) && n > 3000) return n / 100;
  return n;
}

function isPaidOrCompleted(job: Record<string, unknown>): boolean {
  const status = (job.work_status ?? "").toString().trim().toLowerCase();
  return status === "in_progress" || status === "completed";
}

/** Format name with last initial only (e.g. "John S" instead of "John Smith"). */
function formatWithLastInitial(first: unknown, last: unknown): string {
  const f = (first ?? "").toString().trim();
  const l = (last ?? "").toString().trim();
  if (!f && !l) return "Unknown";
  if (!l) return f || "Unknown";
  return `${f} ${l[0]}`.trim();
}

/** Convert full name string to last-initial format (e.g. "John Smith" -> "John S"). */
function fullNameToLastInitial(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return fullName.trim() || "Unknown";
  const last = parts.pop()!;
  return [...parts, last[0]].join(" ").trim();
}

function buildNameMap(
  items: unknown[],
  idFields: string[],
  nameFields: string[][]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items) {
    const r = item as Record<string, unknown>;
    const id = idFields.map((f) => r[f]).find(Boolean);
    if (!id) continue;
    const idStr = String(id);
    const first = r.first_name ?? r.given_name ?? (r as Record<string, unknown>).firstName;
    const last = r.last_name ?? r.family_name ?? (r as Record<string, unknown>).lastName;
    const fallback = (r.full_name ?? nameFields.flatMap((fields) => fields.map((f) => r[f])).find(Boolean)) as string | undefined;
    let name: string;
    if (first || last) {
      name = formatWithLastInitial(first, last);
    } else if (typeof fallback === "string" && fallback.trim()) {
      name = fallback.includes(" ") ? fullNameToLastInitial(fallback) : fallback.trim();
    } else {
      name = "Unknown";
    }
    map.set(idStr, String(name));
  }
  return map;
}

/** Extract name from assigned employee/pro object. HCP embeds first_name, last_name, name, etc. Uses last initial only. */
function getNameFromAssigned(r: Record<string, unknown>): string | null {
  const first = r.first_name ?? (r as Record<string, unknown>).firstName ?? r.given_name;
  const last = r.last_name ?? (r as Record<string, unknown>).lastName ?? r.family_name;
  const fallback = (r.full_name ?? r.name ?? r.display_name) as string | undefined;
  if (first || last) return formatWithLastInitial(first, last);
  if (typeof fallback === "string" && fallback.trim()) {
    return fallback.includes(" ") ? fullNameToLastInitial(fallback) : fallback.trim();
  }
  return null;
}

/** Merge names from job's assigned_employees/assigned_pro into nameMap (for former employees not in pros/employees). */
function mergeNamesFromJob(nameMap: Map<string, string>, job: Record<string, unknown>): void {
  const assigned = job.assigned_employees ?? job.assigned_pro ?? job.assigned_employee;
  const items = Array.isArray(assigned) ? assigned : assigned && typeof assigned === "object" ? [assigned] : [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = r.id ?? r.pro_id ?? r.employee_id;
    if (!id) continue;
    const idStr = String(id);
    if (nameMap.has(idStr)) continue;
    const name = getNameFromAssigned(r);
    if (name) nameMap.set(idStr, name);
  }
}

/** Extract job date for filtering. Uses completed_at, then scheduled_start. */
function getJobDate(job: Record<string, unknown>): Date | null {
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

function isFutureScheduledJob(job: Record<string, unknown>, todayYmd: string): boolean {
  const scheduled = getScheduledJobDate(job);
  if (!scheduled) return false;
  const scheduledDay = scheduled.toISOString().slice(0, 10);
  return scheduledDay > todayYmd;
}

function jobInDateRange(job: Record<string, unknown>, startDate?: string, endDate?: string): boolean {
  if (!startDate && !endDate) return true;
  const jobDate = getJobDate(job);
  if (!jobDate) return false;
  const jobDay = jobDate.toISOString().slice(0, 10);
  if (startDate && jobDay < startDate) return false;
  if (endDate && jobDay > endDate) return false;
  return true;
}

/**
 * Technician IDs for conversion: same rules as jobs (including pro_id / employee fallbacks).
 * If the estimate has no assignees, use the linked job's technicians (HCP often omits assignees on estimates).
 * Respects manual job revenue routing so conversion stays aligned with revenue.
 */
function resolveTechnicianIdsForEstimate(
  estimate: Record<string, unknown>,
  jobByHcpId: Map<string, Record<string, unknown>>,
  officeStaffIds: Set<string>,
  manualJobAssignmentByJobId: Map<string, string>
): string[] {
  let ids = getTechnicianIds(estimate).filter((id) => !officeStaffIds.has(id));
  if (ids.length > 0) return ids;

  const jobHcpId = extractJobHcpId(estimate);
  if (!jobHcpId) return [];

  const manual = manualJobAssignmentByJobId.get(jobHcpId);
  if (manual && !officeStaffIds.has(manual)) return [manual];

  const job = jobByHcpId.get(jobHcpId);
  if (!job) return [];

  const j = job as Record<string, unknown>;
  const jobIdStr = j.id != null ? String(j.id) : "";
  const manualFromJobId = jobIdStr ? manualJobAssignmentByJobId.get(jobIdStr) : undefined;
  let fromJob = manualFromJobId ? [manualFromJobId] : getTechnicianIds(j);
  return fromJob.filter((id) => !officeStaffIds.has(id));
}

/** Extract estimate date for filtering. Same pattern as getJobDate. */
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

function estimateInDateRange(
  estimate: Record<string, unknown>,
  startDate?: string,
  endDate?: string
): boolean {
  if (!startDate && !endDate) return true;
  const estDate = getEstimateDate(estimate);
  if (!estDate) return true;
  const estDay = estDate.toISOString().slice(0, 10);
  if (startDate && estDay < startDate) return false;
  if (endDate && estDay > endDate) return false;
  return true;
}

/**
 * True if the estimate is considered "converted" (approved). Technician KPIs only — Key Metrics uses its own logic.
 * Handles common HCP variants: timestamps on the estimate, option approval_status (case-insensitive).
 */
function hasApprovedOption(estimate: Record<string, unknown>): boolean {
  const stampApproved =
    (estimate.customer_approved_at != null && String(estimate.customer_approved_at).trim() !== "") ||
    (estimate.pro_approved_at != null && String(estimate.pro_approved_at).trim() !== "") ||
    (estimate.signed_at != null && String(estimate.signed_at).trim() !== "");
  if (stampApproved) return true;

  const options = estimate.options as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(options)) return false;
  return options.some((opt) => {
    const s = String(opt.approval_status ?? opt.status ?? "").toLowerCase();
    return (
      s === "approved" ||
      s === "pro approved" ||
      s === "customer approved" ||
      s === "accepted"
    );
  });
}

function collectHcpIdsForCrew(def: {
  foremanHcpEmployeeId: string;
  members: { hcpEmployeeId: string }[];
}): string[] {
  const ids = new Set<string>();
  const add = (id: string | null | undefined) => {
    const t = id?.trim();
    if (t) ids.add(t);
  };
  add(def.foremanHcpEmployeeId);
  for (const m of def.members) add(m.hcpEmployeeId);
  return Array.from(ids);
}

function aggregateCrewMetrics(
  hcpIds: string[],
  revenueByTech: Map<string, number>,
  billableJobsByTech: Map<string, number>,
  conversionByTech: Map<string, { total: number; approved: number }>,
  hoursByTechAndDate: Map<string, Map<string, number>>,
  revenueByTechAndDate: Map<string, Map<string, number>>
): Pick<CrewRevenue, "totalRevenue" | "conversionRate" | "revenuePerHour" | "avgTicket"> {
  let totalRevenue = 0;
  let totalJobs = 0;
  let convTotal = 0;
  let convApproved = 0;
  for (const id of hcpIds) {
    totalRevenue += revenueByTech.get(id) ?? 0;
    totalJobs += billableJobsByTech.get(id) ?? 0;
    const c = conversionByTech.get(id);
    if (c) {
      convTotal += c.total;
      convApproved += c.approved;
    }
  }

  const mergedHoursByDate = new Map<string, number>();
  const mergedRevByDate = new Map<string, number>();
  for (const id of hcpIds) {
    const hd = hoursByTechAndDate.get(id);
    const rd = revenueByTechAndDate.get(id);
    if (hd) {
      for (const [d, h] of hd) {
        mergedHoursByDate.set(d, (mergedHoursByDate.get(d) ?? 0) + h);
      }
    }
    if (rd) {
      for (const [d, r] of rd) {
        mergedRevByDate.set(d, (mergedRevByDate.get(d) ?? 0) + r);
      }
    }
  }

  let revenuePerHour: number | null = null;
  if (mergedHoursByDate.size > 0) {
    let totalHours = 0;
    let totalRevenueOnDaysWithHours = 0;
    for (const [dateStr, hours] of mergedHoursByDate) {
      totalHours += hours;
      totalRevenueOnDaysWithHours += mergedRevByDate.get(dateStr) ?? 0;
    }
    revenuePerHour = totalHours > 0 ? totalRevenueOnDaysWithHours / totalHours : null;
  }

  const conversionRate = convTotal > 0 ? (convApproved / convTotal) * 100 : null;
  const avgTicket = totalJobs > 0 ? totalRevenue / totalJobs : null;
  return { totalRevenue, conversionRate, revenuePerHour, avgTicket };
}

export async function getTechnicianRevenue(
  organizationId: string,
  filters?: TechnicianRevenueFilters
): Promise<TechnicianRevenueResult> {
  const nameMap = new Map<string, string>();
  const officeStaffIds = new Set<string>();
  const org = await getOrganizationById(organizationId);
  const companyId = org?.hcp_company_id?.trim() || "";
  if (!companyId) {
    return { technicians: [], totalRevenue: 0 };
  }

  // Build employee name map and office staff IDs (from DB first, then API)
  try {
    const employeesList = await getEmployeesFromDb(companyId);
    const empMap = buildNameMap(
      employeesList,
      ["id", "employee_id", "pro_id"],
      [["name", "display_name"], ["first_name", "last_name"]]
    );
    empMap.forEach((v, k) => nameMap.set(k, v));
    for (const emp of employeesList as Record<string, unknown>[]) {
      const id = emp?.id ?? emp?.employee_id ?? emp?.pro_id;
      if (id && isOfficeStaff(emp?.role ?? emp?.employee_type ?? emp?.type)) officeStaffIds.add(String(id));
    }
  } catch {
    /* skip */
  }

  // Always merge pros into name map and office staff IDs
  try {
    const prosList = await getProsFromDb(companyId);
    const proMap = buildNameMap(
      prosList,
      ["id", "pro_id"],
      [["name", "display_name"], ["first_name", "last_name"]]
    );
    proMap.forEach((v, k) => nameMap.set(k, v));
    for (const p of prosList as Record<string, unknown>[]) {
      const id = p?.id ?? p?.pro_id;
      if (id && isOfficeStaff(p?.role ?? p?.employee_type ?? p?.type)) officeStaffIds.add(String(id));
    }
  } catch {
    /* skip */
  }
  const revenueByTech = new Map<string, number>();
  const billableJobsByTech = new Map<string, number>();
  const revenueByTechAndDate = new Map<string, Map<string, number>>();
  let totalRevenueAllJobs = 0;

  const { startDate, endDate, activeInCurrentYearOnly = true } = filters ?? {};
  const todayYmd = new Date().toISOString().slice(0, 10);
  const assignmentRows = await getJobRevenueAssignments(organizationId).catch(() => []);
  const manualJobAssignmentByJobId = new Map<string, string>();
  for (const row of assignmentRows) {
    if (!row.job_hcp_id || !row.hcp_employee_id) continue;
    manualJobAssignmentByJobId.set(row.job_hcp_id, row.hcp_employee_id);
  }

  // Fetch time entries and build hours-by-date map (techId -> date -> hours)
  const hoursByTechAndDate = new Map<string, Map<string, number>>();
  try {
    const timeEntries = await getTimeEntriesByOrganization(organizationId, startDate, endDate);
    for (const e of timeEntries) {
      const techId = e.hcp_employee_id ?? "unknown";
      const dateStr = e.entry_date;
      const h = typeof e.hours === "number" && !Number.isNaN(e.hours)
        ? e.hours
        : typeof e.hours === "string"
          ? parseFloat(e.hours) || 0
          : 0;
      let byDate = hoursByTechAndDate.get(techId);
      if (!byDate) {
        byDate = new Map<string, number>();
        hoursByTechAndDate.set(techId, byDate);
      }
      byDate.set(dateStr, (byDate.get(dateStr) ?? 0) + h);
    }
  } catch {
    /* skip - no time entries or DB error */
  }

  // DB-only KPI mode: use synced jobs only.
  let jobs: unknown[] = [];
  try {
    jobs = await getJobsFromDb(companyId);
  } catch {
    /* skip */
  }

  for (const job of jobs) {
    const j = job as Record<string, unknown>;
    if (!jobInDateRange(j, startDate, endDate)) continue;
    if (isFutureScheduledJob(j, todayYmd)) continue;
    mergeNamesFromJob(nameMap, j);

    const isPaid = isPaidOrCompleted(j);
    let paidAmount = isPaid ? getPaidAmountFromJob(j) : 0;
    // Fall back to invoices when job amount is 0 (HCP may use different status/amount fields)
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
    if (paidAmount > 0) {
      totalRevenueAllJobs += paidAmount;
    }

    let techIds = getTechnicianIds(j);
    const jobId = j.id != null ? String(j.id) : "";
    const manualAssignedTech = jobId ? manualJobAssignmentByJobId.get(jobId) : undefined;
    if (manualAssignedTech) {
      techIds = [manualAssignedTech];
    }
    techIds = techIds.filter((id) => !officeStaffIds.has(id));
    if (techIds.length === 0) continue;

    const jobDate = getJobDate(j);
    const jobDay = jobDate ? jobDate.toISOString().slice(0, 10) : null;

    const amountPerTech = paidAmount / techIds.length;
    for (const techId of techIds) {
      const current = revenueByTech.get(techId) ?? 0;
      revenueByTech.set(techId, current + amountPerTech);
      if (paidAmount > 0) {
        billableJobsByTech.set(techId, (billableJobsByTech.get(techId) ?? 0) + 1);
      }
      if (jobDay) {
        let byDate = revenueByTechAndDate.get(techId);
        if (!byDate) {
          byDate = new Map<string, number>();
          revenueByTechAndDate.set(techId, byDate);
        }
        byDate.set(jobDay, (byDate.get(jobDay) ?? 0) + amountPerTech);
      }
    }
  }

  // Estimate conversion: DB-only KPI mode.
  const jobByHcpId = new Map<string, Record<string, unknown>>();
  for (const job of jobs) {
    const j = job as Record<string, unknown>;
    const jid = j.id ?? j.uuid;
    if (jid != null) jobByHcpId.set(String(jid), j);
  }

  const conversionByTech = new Map<string, { total: number; approved: number }>();
  let estimates: unknown[] = [];
  try {
    estimates = await getEstimatesFromDb(companyId);
  } catch {
    /* skip */
  }
  for (const est of estimates) {
    const e = est as Record<string, unknown>;
    if (!estimateInDateRange(e, startDate, endDate)) continue;
    const techIds = resolveTechnicianIdsForEstimate(
      e,
      jobByHcpId,
      officeStaffIds,
      manualJobAssignmentByJobId
    );
    if (techIds.length === 0) continue;
    const isConverted = hasApprovedOption(e);
    for (const techId of techIds) {
      const current = conversionByTech.get(techId) ?? { total: 0, approved: 0 };
      current.total += 1;
      if (isConverted) current.approved += 1;
      conversionByTech.set(techId, current);
    }
  }

  // Build set of technicians with at least one job in current calendar year (when filtering)
  const activeInCurrentYear = new Set<string>();
  if (activeInCurrentYearOnly) {
    const currentYear = new Date().getFullYear();
    const yearStart = `${currentYear}-01-01`;
    const yearEnd = `${currentYear}-12-31`;
    for (const job of jobs) {
      const j = job as Record<string, unknown>;
      if (isFutureScheduledJob(j, todayYmd)) continue;
      const jobDate = getJobDate(j);
      if (!jobDate) continue;
      const jobDay = jobDate.toISOString().slice(0, 10);
      if (jobDay < yearStart || jobDay > yearEnd) continue;
      let techIds = getTechnicianIds(j);
      const jobId = j.id != null ? String(j.id) : "";
      const manualAssignedTech = jobId ? manualJobAssignmentByJobId.get(jobId) : undefined;
      if (manualAssignedTech) {
        techIds = [manualAssignedTech];
      }
      techIds = techIds.filter((id) => !officeStaffIds.has(id));
      for (const id of techIds) activeInCurrentYear.add(id);
    }
  }

  const technicians: TechnicianRevenue[] = Array.from(revenueByTech.entries())
    .filter(([id]) => !activeInCurrentYearOnly || activeInCurrentYear.has(id))
    .map(([id, totalRevenue]) => {
      const conv = conversionByTech.get(id);
      const conversionRate =
        conv && conv.total > 0 ? (conv.approved / conv.total) * 100 : null;
      const hoursByDate = hoursByTechAndDate.get(id);
      const revenueByDate = revenueByTechAndDate.get(id);
      let revenuePerHour: number | null = null;
      if (hoursByDate && hoursByDate.size > 0) {
        let totalHours = 0;
        let totalRevenueOnDaysWithHours = 0;
        for (const [dateStr, hours] of hoursByDate) {
          totalHours += hours;
          totalRevenueOnDaysWithHours += revenueByDate?.get(dateStr) ?? 0;
        }
        revenuePerHour = totalHours > 0 ? totalRevenueOnDaysWithHours / totalHours : null;
      }
      const billableJobs = billableJobsByTech.get(id) ?? 0;
      const avgTicket = billableJobs > 0 ? totalRevenue / billableJobs : null;
      return {
        technicianId: id,
        technicianName: nameMap.get(id) ?? (id.startsWith("pro_") || id.startsWith("emp_") ? "Former technician" : `Technician ${id}`),
        totalRevenue,
        conversionRate,
        revenuePerHour,
        avgTicket,
      };
    })
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  const totalRevenue = totalRevenueAllJobs;

  let crews: CrewRevenue[] | undefined;
  try {
    const crewDefs = await listCrewsWithMembers(organizationId);
    if (crewDefs.length > 0) {
      crews = crewDefs.map((def) => {
        const technicianIds = collectHcpIdsForCrew(def);
        const agg = aggregateCrewMetrics(
          technicianIds,
          revenueByTech,
          billableJobsByTech,
          conversionByTech,
          hoursByTechAndDate,
          revenueByTechAndDate
        );
        return {
          crewId: def.id,
          crewName: def.name,
          foremanLabel: def.foremanDisplayName,
          technicianIds,
          ...agg,
        };
      });
    }
  } catch {
    crews = undefined;
  }

  return { technicians, totalRevenue, crews };
}
