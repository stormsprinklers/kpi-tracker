import { NextResponse } from "next/server";
import { getJobs, getCustomers, getEstimates } from "@/lib/housecallpro";
import { isConfigured } from "@/lib/housecallpro";

/**
 * Debug: returns raw API response structure to diagnose pagination and field names.
 * GET /api/debug/hcp-raw-pagination
 */
export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Housecall Pro not configured" },
      { status: 503 }
    );
  }

  try {
    const [jobsRes, customersRes, estimatesRes] = await Promise.all([
      getJobs({ per_page: 5, page: 1 }),
      getCustomers({ per_page: 5, page: 1 }),
      getEstimates({ per_page: 5, page: 1 }),
    ]);

    const jobsData = jobsRes as Record<string, unknown>;
    const customersData = customersRes as Record<string, unknown>;
    const estimatesData = estimatesRes as Record<string, unknown>;

    const firstEstimate = Array.isArray(estimatesData)
      ? estimatesData[0]
      : (estimatesData.estimates as unknown[])?.[0];

    return NextResponse.json({
      jobs_top_level_keys: Object.keys(jobsData),
      jobs_next_page_url: jobsData.next_page_url,
      jobs_count: Array.isArray(jobsData) ? jobsData.length : (jobsData.jobs as unknown[])?.length,
      customers_top_level_keys: Object.keys(customersData),
      customers_next_page_url: customersData.next_page_url,
      estimates_top_level_keys: Object.keys(estimatesData),
      estimates_next_page_url: estimatesData.next_page_url,
      first_estimate_keys: firstEstimate ? Object.keys(firstEstimate as object) : null,
      first_estimate_sample: firstEstimate
        ? {
            id: (firstEstimate as Record<string, unknown>).id,
            job_id: (firstEstimate as Record<string, unknown>).job_id,
            job: (firstEstimate as Record<string, unknown>).job,
            request_id: (firstEstimate as Record<string, unknown>).request_id,
            service_request_id: (firstEstimate as Record<string, unknown>).service_request_id,
            service_request: (firstEstimate as Record<string, unknown>).service_request,
            request: (firstEstimate as Record<string, unknown>).request,
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Debug fetch failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
