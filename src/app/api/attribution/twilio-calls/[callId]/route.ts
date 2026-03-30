import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { getTwilioTrackingCallByIdForOrg } from "@/lib/db/twilioAttributionQueries";

export const dynamic = "force-dynamic";

/** GET — full transcript + metadata for one call (same org only). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ callId: string }> }
) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { callId } = await params;
  if (!callId) {
    return NextResponse.json({ error: "callId required" }, { status: 400 });
  }
  await initSchema();
  const call = await getTwilioTrackingCallByIdForOrg(session.user.organizationId, callId);
  if (!call) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ call });
}
