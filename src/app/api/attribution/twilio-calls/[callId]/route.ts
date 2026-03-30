import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  getTwilioTrackingCallByIdForOrg,
  updateTwilioTrackingCallTranscript,
} from "@/lib/db/twilioAttributionQueries";
import { getTwilioClientForOrganization } from "@/lib/twilio/client";
import { fetchTranscriptFullText, fetchTranscriptStatus } from "@/lib/twilio/intelligence";

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
  let call = await getTwilioTrackingCallByIdForOrg(session.user.organizationId, callId);
  if (!call) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // On-demand backfill so transcript text appears without waiting for cron poll.
  if (!call.transcript_text && call.intelligence_transcript_sid) {
    try {
      const twilioClient = await getTwilioClientForOrganization(session.user.organizationId);
      const st = await fetchTranscriptStatus(twilioClient, call.intelligence_transcript_sid);
      if (st === "completed") {
        const text = await fetchTranscriptFullText(twilioClient, call.intelligence_transcript_sid);
        await updateTwilioTrackingCallTranscript({
          callSid: call.call_sid,
          intelligenceTranscriptSid: call.intelligence_transcript_sid,
          transcriptStatus: "completed",
          transcriptText: text || null,
        });
      } else {
        await updateTwilioTrackingCallTranscript({
          callSid: call.call_sid,
          intelligenceTranscriptSid: call.intelligence_transcript_sid,
          transcriptStatus: st,
        });
      }
      call = await getTwilioTrackingCallByIdForOrg(session.user.organizationId, callId);
      if (!call) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    } catch {
      // Keep current stored payload if Twilio transcript fetch fails.
    }
  }
  return NextResponse.json({ call });
}
