import { NextResponse } from "next/server";
import { getJobs, getJobInvoices, getEmployees, getPros } from "@/lib/housecallpro";
import { isConfigured } from "@/lib/housecallpro";

/**
 * Debug route to discover Housecall Pro API response structure.
 * Remove or protect in production.
 * GET /api/debug/hcp-sample
 */
export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Housecall Pro not configured" },
      { status: 503 }
    );
  }

  try {
    const [jobsRes, employeesRes, prosRes] = await Promise.all([
      getJobs({ per_page: 2, page: 1 }),
      getEmployees().catch(() => ({ error: "Employees endpoint not available" })),
      getPros().catch(() => ({ error: "Pros endpoint not available" })),
    ]);

    const jobs = Array.isArray(jobsRes) ? jobsRes : (jobsRes as { jobs?: unknown[] })?.jobs ?? jobsRes;
    const jobList = Array.isArray(jobs) ? jobs.slice(0, 2) : [];

    const jobWithInvoices =
      jobList.length > 0 && (jobList[0] as { id?: string }).id
        ? await getJobInvoices(String((jobList[0] as { id: string }).id)).catch(
            (e) => ({ error: String(e) })
          )
        : null;

    // Phase 1: Inspect work_timestamps and assigned_employees for Time Insights
    const firstJob = jobList[0] as Record<string, unknown> | undefined;
    const workTimestampsSample = firstJob?.work_timestamps ?? null;
    const assignedEmployeesSample = firstJob?.assigned_employees ?? firstJob?.assigned_pro ?? null;

    return NextResponse.json({
      jobs_sample: jobList,
      job_invoices_sample: jobWithInvoices,
      employees_sample: employeesRes,
      pros_sample: prosRes,
      work_timestamps_sample: workTimestampsSample,
      assigned_employees_sample: assignedEmployeesSample,
      note: "Use this to confirm field names: assigned_employee, employee_id, assigned_pro, amount_paid, total, work_timestamps (en_route_at, started_at, completed_at), etc.",
    });
  } catch (error) {
    console.error("[HCP Debug] Error:", error);
    return NextResponse.json(
      {
        error: "Debug fetch failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
