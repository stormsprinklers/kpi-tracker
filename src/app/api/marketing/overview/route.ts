import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { buildMarketingOverviewResponse } from "@/lib/metrics/marketingOverview";

export const dynamic = "force-dynamic";

function defaultRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 13);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dr = defaultRange();
  const startDate = searchParams.get("startDate")?.slice(0, 10) ?? dr.start;
  const endDate = searchParams.get("endDate")?.slice(0, 10) ?? dr.end;

  if (startDate > endDate) {
    return NextResponse.json({ error: "startDate must be on or before endDate" }, { status: 400 });
  }

  try {
    await initSchema();
    const overview = await buildMarketingOverviewResponse(
      session.user.organizationId,
      startDate,
      endDate
    );
    return NextResponse.json(overview);
  } catch (e) {
    console.error("[marketing/overview]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to build marketing overview" },
      { status: 500 }
    );
  }
}
