import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getKeyMetrics } from "@/lib/metrics/keyMetrics";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const metrics = await getKeyMetrics(session.user.organizationId);
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
