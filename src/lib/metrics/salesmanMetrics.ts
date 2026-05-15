import {
  getEstimatesFromDb,
  getJobsFromDb,
  getOrganizationById,
} from "@/lib/db/queries";
import { extractJobHcpId } from "@/lib/sync/extractors";
import {
  jobIsFutureScheduledBeyond,
  jobMatchesCollectedRevenueDateRange,
  resolveCollectedRevenueForJob,
} from "./jobCollectedRevenue";

export interface SalesmanMetrics {
  totalSales: number;
  conversionRate: number | null;
  averageTicket: number | null;
  estimatesGiven: number;
}

function estimateDate(estimate: Record<string, unknown>): Date | null {
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

function estimateInRange(
  estimate: Record<string, unknown>,
  startDate: string | null,
  endDate: string | null
): boolean {
  if (!startDate || !endDate) return true;
  const d = estimateDate(estimate);
  if (!d) return true;
  const ymd = d.toISOString().slice(0, 10);
  return ymd >= startDate && ymd <= endDate;
}

function normalizedId(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function addMaybeId(set: Set<string>, value: unknown): void {
  const id = normalizedId(value);
  if (id) set.add(id);
}

function addMaybeIds(set: Set<string>, value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      addMaybeId(set, rec.id ?? rec.hcp_id ?? rec.employee_id ?? rec.pro_id);
    } else {
      addMaybeId(set, item);
    }
  }
}

/** Fields commonly used by HCP on estimates and jobs for salesperson attribution. */
function collectSalespersonIdsFromRecord(record: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  addMaybeId(ids, record.employee_id);
  addMaybeId(ids, record.hcp_employee_id);
  addMaybeId(ids, record.pro_id);
  addMaybeId(ids, record.salesperson_id);
  addMaybeId(ids, record.sales_rep_id);
  addMaybeId(ids, record.sold_by_id);
  addMaybeId(ids, record.technician_id);

  addMaybeIds(ids, record.employee_ids);
  addMaybeIds(ids, record.hcp_employee_ids);
  addMaybeIds(ids, record.pro_ids);
  addMaybeIds(ids, record.assigned_employee_ids);
  addMaybeIds(ids, record.technician_ids);
  addMaybeIds(ids, record.employees);
  addMaybeIds(ids, record.pros);

  const createdBy = record.created_by as Record<string, unknown> | undefined;
  addMaybeId(ids, createdBy?.id ?? createdBy?.employee_id ?? createdBy?.hcp_employee_id);

  const soldBy = record.sold_by as Record<string, unknown> | undefined;
  addMaybeId(ids, soldBy?.id ?? soldBy?.employee_id ?? soldBy?.hcp_employee_id);

  const salesRep = record.sales_rep as Record<string, unknown> | undefined;
  addMaybeId(ids, salesRep?.id ?? salesRep?.employee_id ?? salesRep?.hcp_employee_id);

  const employee = record.employee as Record<string, unknown> | undefined;
  addMaybeId(ids, employee?.id ?? employee?.employee_id ?? employee?.hcp_employee_id);

  const pro = record.pro as Record<string, unknown> | undefined;
  addMaybeId(ids, pro?.id ?? pro?.pro_id ?? pro?.hcp_employee_id);

  const assignedEmployee = record.assigned_employee as Record<string, unknown> | undefined;
  addMaybeId(
    ids,
    assignedEmployee?.id ?? assignedEmployee?.employee_id ?? assignedEmployee?.hcp_employee_id
  );

  return ids;
}

function estimateSalespersonIds(estimate: Record<string, unknown>): Set<string> {
  return collectSalespersonIdsFromRecord(estimate);
}

/** Job-level salesperson ids plus optional nested estimate payload(s) and a chosen linked estimate when the job omits ids. */
function jobSalespersonIds(
  job: Record<string, unknown>,
  attributionEstimate: Record<string, unknown> | null
): Set<string> {
  const ids = collectSalespersonIdsFromRecord(job);

  const nestedSingle = job.estimate as Record<string, unknown> | undefined;
  if (nestedSingle && typeof nestedSingle === "object") {
    collectSalespersonIdsFromRecord(nestedSingle).forEach((id) => ids.add(id));
  }

  const arr = job.estimates as unknown[] | undefined;
  if (Array.isArray(arr)) {
    for (const item of arr) {
      if (item && typeof item === "object") {
        collectSalespersonIdsFromRecord(item as Record<string, unknown>).forEach((id) => ids.add(id));
      }
    }
  }

  if (attributionEstimate) {
    collectSalespersonIdsFromRecord(attributionEstimate).forEach((id) => ids.add(id));
  }

  return ids;
}

function estimateUpdatedTs(e: Record<string, unknown>): number {
  const s = String(e.updated_at ?? e.updatedAt ?? e.created_at ?? e.createdAt ?? "");
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

function estimateLooksApprovedForSalesAttribution(estimate: Record<string, unknown>): boolean {
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

function pickAttributionEstimateForJob(
  job: Record<string, unknown>,
  linked: Record<string, unknown>[]
): Record<string, unknown> | null {
  if (linked.length === 0) return null;
  if (linked.length === 1) return linked[0] ?? null;

  const hints = [
    job.selected_estimate_id,
    job.won_estimate_id,
    job.primary_estimate_id,
    job.chosen_estimate_id,
    job.accepted_estimate_id,
    (job.estimate as Record<string, unknown>)?.id,
  ];
  for (const h of hints) {
    if (h == null || h === "") continue;
    const hs = String(h);
    const m = linked.find((e) => String(e.id ?? e.uuid) === hs);
    if (m) return m;
  }

  const approved = linked.filter(estimateLooksApprovedForSalesAttribution);
  const pool = approved.length > 0 ? approved : linked;
  return [...pool].sort((a, b) => estimateUpdatedTs(b) - estimateUpdatedTs(a))[0] ?? null;
}

function isApprovedStatus(value: unknown): boolean {
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  return s === "approved" || s === "pro approved" || s === "won";
}

export async function getSalesmanMetrics(
  organizationId: string,
  hcpEmployeeId: string,
  range: { startDate: string | null; endDate: string | null }
): Promise<SalesmanMetrics> {
  const org = await getOrganizationById(organizationId);
  const companyId = org?.hcp_company_id?.trim() || "";
  if (!companyId) {
    return { totalSales: 0, conversionRate: null, averageTicket: null, estimatesGiven: 0 };
  }

  const estimates = await getEstimatesFromDb(companyId);
  let estimatesGiven = 0;
  let approvedCount = 0;

  for (const raw of estimates) {
    const estimate = raw as Record<string, unknown>;
    if (!estimateInRange(estimate, range.startDate, range.endDate)) continue;
    const salespersonIds = estimateSalespersonIds(estimate);
    if (!salespersonIds.has(hcpEmployeeId)) continue;

    estimatesGiven += 1;
    const options = estimate.options as Array<Record<string, unknown>> | undefined;
    let approvedHere = false;
    if (Array.isArray(options) && options.length > 0) {
      approvedHere = options.some((opt) => isApprovedStatus(opt.approval_status));
    }
    if (!approvedHere && isApprovedStatus(estimate.approval_status ?? estimate.status)) {
      approvedHere = true;
    }
    if (approvedHere) approvedCount += 1;
  }

  const conversionRate = estimatesGiven > 0 ? (approvedCount / estimatesGiven) * 100 : null;

  let jobs: Record<string, unknown>[] = [];
  try {
    jobs = await getJobsFromDb(companyId);
  } catch {
    jobs = [];
  }

  const estimatesByJobId = new Map<string, Record<string, unknown>[]>();
  for (const est of estimates) {
    const e = est as Record<string, unknown>;
    const jid = extractJobHcpId(e);
    if (!jid) continue;
    const list = estimatesByJobId.get(jid) ?? [];
    list.push(e);
    estimatesByJobId.set(jid, list);
  }

  const todayYmd = new Date().toISOString().slice(0, 10);
  let totalSales = 0;
  let collectedJobsAttributed = 0;

  for (const job of jobs) {
    const j = job as Record<string, unknown>;
    if (!jobMatchesCollectedRevenueDateRange(j, range.startDate, range.endDate)) continue;
    if (jobIsFutureScheduledBeyond(j, todayYmd)) continue;

    const paidAmount = await resolveCollectedRevenueForJob(companyId, j);
    if (paidAmount <= 0) continue;

    const jobId = j.id != null ? String(j.id) : "";
    if (!jobId) continue;

    const linked = estimatesByJobId.get(jobId) ?? [];
    const attributionEst = pickAttributionEstimateForJob(j, linked);
    const salespersonIds = jobSalespersonIds(j, attributionEst);
    if (!salespersonIds.has(hcpEmployeeId)) continue;

    totalSales += paidAmount;
    collectedJobsAttributed += 1;
  }

  const averageTicket =
    collectedJobsAttributed > 0 ? totalSales / collectedJobsAttributed : null;

  return {
    totalSales: Math.round(totalSales * 100) / 100,
    conversionRate,
    averageTicket: averageTicket == null ? null : Math.round(averageTicket * 100) / 100,
    estimatesGiven,
  };
}
