import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  getEmployeesAndProsForCsrSelector,
  getJobRevenueAssignments,
  getJobsFromDb,
  getOrganizationById,
  upsertJobRevenueAssignment,
} from "@/lib/db/queries";

const COMPLETED_JOB_STATUSES = new Set([
  "paid",
  "completed",
  "complete",
  "closed",
  "done",
  "paid_in_full",
  "invoiced",
  "finished",
]);

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

function isPaidOrCompleted(job: Record<string, unknown>): boolean {
  const status = (job.status ?? job.job_status ?? job.work_status ?? job.state ?? "")
    .toString()
    .toLowerCase();
  return COMPLETED_JOB_STATUSES.has(status);
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

function getJobDate(job: Record<string, unknown>): string | null {
  const wt = job.work_timestamps as Record<string, unknown> | undefined;
  const sched = job.schedule as Record<string, unknown> | undefined;
  const completed = wt?.completed_at ?? wt?.completed;
  const scheduled = sched?.scheduled_start ?? sched?.scheduledStart ?? job.scheduled_start;
  const created = job.created_at ?? job.createdAt;
  const dateStr = (completed ?? scheduled ?? created) as string | undefined;
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function getCustomerName(job: Record<string, unknown>): string {
  const customer = job.customer as Record<string, unknown> | undefined;
  const customerName =
    job.customer_name ??
    customer?.name ??
    customer?.full_name ??
    [customer?.first_name, customer?.last_name].filter(Boolean).join(" ");
  return String(customerName ?? "Unknown customer").trim() || "Unknown customer";
}

function getTechnicianIds(job: Record<string, unknown>): string[] {
  const assigned = job.assigned_employees ?? job.assigned_pro ?? job.assigned_employee;
  const items = Array.isArray(assigned)
    ? assigned
    : assigned && typeof assigned === "object"
      ? [assigned]
      : [];
  const ids: string[] = [];
  for (const a of items) {
    if (typeof a === "string") {
      ids.push(a);
      continue;
    }
    if (a && typeof a === "object" && "id" in a) {
      ids.push(String((a as { id: unknown }).id));
    }
  }
  if (ids.length > 0) return ids;
  const fallback = job.pro_id ?? job.pro ?? job.employee_id ?? job.assigned_pro_id;
  if (typeof fallback === "string") return [fallback];
  if (fallback && typeof fallback === "object" && "id" in fallback) {
    return [String((fallback as { id: unknown }).id)];
  }
  return [];
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await initSchema();
  const org = await getOrganizationById(session.user.organizationId);
  const companyId = org?.hcp_company_id ?? "default";
  const jobs = await getJobsFromDb(companyId, { limit: 10000 });
  const assignmentRows = await getJobRevenueAssignments(session.user.organizationId);
  const assignmentByJob = new Map(assignmentRows.map((r) => [r.job_hcp_id, r.hcp_employee_id]));

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate") ?? undefined;
  const endDate = searchParams.get("endDate") ?? undefined;

  const unassigned = jobs
    .map((j) => j as Record<string, unknown>)
    .filter((job) => {
      const jobId = job.id != null ? String(job.id) : "";
      if (!jobId) return false;
      if (assignmentByJob.has(jobId)) return false;
      if (!isPaidOrCompleted(job)) return false;
      const amount = getPaidAmountFromJob(job);
      if (amount <= 0) return false;
      const hasTech = getTechnicianIds(job).length > 0;
      if (hasTech) return false;
      const day = getJobDate(job);
      if (startDate && day && day < startDate) return false;
      if (endDate && day && day > endDate) return false;
      return true;
    })
    .slice(0, 200)
    .map((job) => ({
      jobHcpId: String(job.id),
      customerName: getCustomerName(job),
      date: getJobDate(job),
      amount: getPaidAmountFromJob(job),
    }));

  const candidates = await getEmployeesAndProsForCsrSelector(companyId);
  return NextResponse.json({ jobs: unassigned, candidates });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { jobHcpId?: string; hcpEmployeeId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const jobHcpId = String(body.jobHcpId ?? "").trim();
  const hcpEmployeeId = String(body.hcpEmployeeId ?? "").trim();
  if (!jobHcpId || !hcpEmployeeId) {
    return NextResponse.json({ error: "jobHcpId and hcpEmployeeId are required" }, { status: 400 });
  }

  await initSchema();
  await upsertJobRevenueAssignment({
    organization_id: session.user.organizationId,
    job_hcp_id: jobHcpId,
    hcp_employee_id: hcpEmployeeId,
  });
  return NextResponse.json({ ok: true });
}
