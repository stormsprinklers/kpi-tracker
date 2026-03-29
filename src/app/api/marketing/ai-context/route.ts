import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { buildMarketingAiContext } from "@/lib/metrics/marketingOverview";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  const startDate = searchParams.get("startDate")?.slice(0, 10) ?? start.toISOString().slice(0, 10);
  const endDate = searchParams.get("endDate")?.slice(0, 10) ?? end.toISOString().slice(0, 10);

  try {
    await initSchema();
    const ctx = await buildMarketingAiContext(session.user.organizationId, startDate, endDate);
    return NextResponse.json(ctx);
  } catch (e) {
    console.error("[marketing/ai-context]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to build marketing AI context" },
      { status: 500 }
    );
  }
}
