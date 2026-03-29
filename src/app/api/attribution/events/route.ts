import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  getRecentWebAttributionEvents,
  getWebAttributionEventCounts,
} from "@/lib/db/webAttributionQueries";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await initSchema();
  const organizationId = session.user.organizationId;
  const [recentEvents, counts30d] = await Promise.all([
    getRecentWebAttributionEvents({ organizationId, limit: 100 }),
    getWebAttributionEventCounts(organizationId),
  ]);
  return NextResponse.json({ recentEvents, counts30d });
}

