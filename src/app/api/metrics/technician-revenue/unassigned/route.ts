import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  getCollectedRevenueJobDate,
  jobIsFutureScheduledBeyond,
  jobMatchesCollectedRevenueDateRange,
  resolveCollectedRevenueForJob,
} from "@/lib/metrics/jobCollectedRevenue";
import {
  getEmployeesAndProsForCsrSelector,
  getJobRevenueAssignments,
  getJobsFromDb,
  getOrganizationById,
  upsertJobRevenueAssignment,
} from "@/lib/db/queries";

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

function jobDayYmd(job: Record<string, unknown>): string | null {
  const d = getCollectedRevenueJobDate(job);
  return d ? d.toISOString().slice(0, 10) : null;
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
  const todayYmd = new Date().toISOString().slice(0, 10);

  const unassigned: {
    jobHcpId: string;
    customerName: string;
    date: string | null;
    amount: number;
  }[] = [];

  for (const row of jobs) {
    const job = row as Record<string, unknown>;
    const jobId = job.id != null ? String(job.id) : "";
    if (!jobId) continue;
    if (assignmentByJob.has(jobId)) continue;
    if (!jobMatchesCollectedRevenueDateRange(job, startDate, endDate)) continue;
    if (jobIsFutureScheduledBeyond(job, todayYmd)) continue;

    const amount = await resolveCollectedRevenueForJob(companyId, job);
    if (amount <= 0) continue;
    if (getTechnicianIds(job).length > 0) continue;

    unassigned.push({
      jobHcpId: jobId,
      customerName: getCustomerName(job),
      date: jobDayYmd(job),
      amount,
    });
    if (unassigned.length >= 200) break;
  }

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
