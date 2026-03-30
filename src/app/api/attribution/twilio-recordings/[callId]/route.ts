import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { getTwilioTrackingCallByIdForOrg } from "@/lib/db/twilioAttributionQueries";
import { fetchTwilioRecordingMp3 } from "@/lib/twilio/client";

export const dynamic = "force-dynamic";

/**
 * GET — stream MP3 for a tracking call’s recording (cookie session; org must own the call).
 * Use as <audio src="…"> after the user is logged in.
 */
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
  if (!call?.recording_sid) {
    return NextResponse.json({ error: "No recording for this call" }, { status: 404 });
  }
  const mediaRes = await fetchTwilioRecordingMp3(session.user.organizationId, call.recording_sid);
  if (!mediaRes?.body) {
    return NextResponse.json({ error: "Recording unavailable" }, { status: 502 });
  }
  return new NextResponse(mediaRes.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "private, max-age=300",
    },
  });
}
