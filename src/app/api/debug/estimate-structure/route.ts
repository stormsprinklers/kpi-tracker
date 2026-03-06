import { NextResponse } from "next/server";
import { getCompany } from "@/lib/housecallpro";
import { getEstimatesFromDb } from "@/lib/db/queries";
import { isConfigured } from "@/lib/housecallpro";

/**
 * Debug: returns full raw structure of first estimate from DB to find job-link field.
 * GET /api/debug/estimate-structure
 */
export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Housecall Pro not configured" },
      { status: 503 }
    );
  }

  try {
    const company = (await getCompany()) as { id?: string };
    const companyId = company?.id ?? "default";
    const estimates = await getEstimatesFromDb(companyId);
    const first = estimates[0] as Record<string, unknown> | undefined;

    if (!first) {
      return NextResponse.json({
        message: "No estimates in database. Run a sync first.",
        count: 0,
      });
    }

    return NextResponse.json({
      message: "Full raw structure of first estimate from DB",
      count: estimates.length,
      first_estimate_all_keys: Object.keys(first),
      first_estimate_full: first,
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
