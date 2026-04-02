import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  getRecentWebAttributionSessionEvents,
  getWebAttributionSourceSummary30d,
  getWebAttributionEventCounts,
} from "@/lib/db/webAttributionQueries";
import { buildRecentWebAttributionSessions } from "@/lib/webAttribution/buildSessionPayloads";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await initSchema();
  const organizationId = session.user.organizationId;
  const [sessionRows, counts30d, sourceSummary30d] = await Promise.all([
    getRecentWebAttributionSessionEvents({ organizationId, maxVisitors: 40 }),
    getWebAttributionEventCounts(organizationId),
    getWebAttributionSourceSummary30d(organizationId),
  ]);
  const recentSessions = buildRecentWebAttributionSessions(sessionRows);
  return NextResponse.json({ recentSessions, counts30d, sourceSummary30d });
}

