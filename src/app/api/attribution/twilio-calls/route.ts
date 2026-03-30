import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { listTwilioTrackingCallsForOrg } from "@/lib/db/twilioAttributionQueries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await initSchema();
  const { searchParams } = new URL(request.url);
  const phoneNumberId = searchParams.get("phoneNumberId")?.trim() || undefined;
  const limitRaw = searchParams.get("limit");
  const limit = Math.min(200, Math.max(1, Number.parseInt(limitRaw || "120", 10) || 120));
  const rows = await listTwilioTrackingCallsForOrg(session.user.organizationId, limit, phoneNumberId);
  return NextResponse.json({ calls: rows });
}
