import { NextResponse } from "next/server";
import { getTechnicianRevenue } from "@/lib/metrics/technicianRevenue";
import { isConfigured } from "@/lib/housecallpro";

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Housecall Pro not configured" },
      { status: 503 }
    );
  }

  try {
    const result = await getTechnicianRevenue();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Technician Revenue] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch technician revenue",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
