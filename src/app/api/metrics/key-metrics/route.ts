import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getKeyMetrics, type KeyMetricsRange } from "@/lib/metrics/keyMetrics";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rangeParam = searchParams.get("range") ?? "7d";
  const range = (rangeParam === "30d" || rangeParam === "all" ? rangeParam : "7d") as "7d" | "30d" | "all";

  try {
    const metrics = await getKeyMetrics(session.user.organizationId, range);
    return NextResponse.json(metrics);
  } catch (error) {
    console.error("[Key Metrics] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch key metrics",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
