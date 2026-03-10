import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { getCallInsights } from "@/lib/metrics/callInsights";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await initSchema();

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate") ?? undefined;
  const endDate = searchParams.get("endDate") ?? undefined;

  try {
    const result = await getCallInsights(session.user.organizationId, {
      startDate,
      endDate,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Call Insights] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch call insights",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
