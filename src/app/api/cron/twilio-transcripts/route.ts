import { NextResponse } from "next/server";
import { initSchema } from "@/lib/db";
import { getWebAttributionInstall } from "@/lib/db/webAttributionQueries";
import {
  listTwilioCallsPendingTranscript,
  updateTwilioTrackingCallTranscript,
} from "@/lib/db/twilioAttributionQueries";
import { getIntelligenceServiceSid, getTwilioClientForOrganization } from "@/lib/twilio/client";
import { createTranscriptFromRecording, fetchTranscriptFullText, fetchTranscriptStatus } from "@/lib/twilio/intelligence";

function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export const dynamic = "force-dynamic";

/** Poll Conversational Intelligence transcripts and store completed text. */
export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await initSchema();
  const rows = await listTwilioCallsPendingTranscript(40);
  let updated = 0;
  for (const row of rows) {
    try {
      const install = await getWebAttributionInstall(row.organization_id);
      const serviceSid = getIntelligenceServiceSid(install?.twilio_intelligence_service_sid ?? null);
      const twilioClient = await getTwilioClientForOrganization(row.organization_id);
      if (!row.intelligence_transcript_sid && row.recording_sid) {
        const created = await createTranscriptFromRecording({
          client: twilioClient,
          recordingSid: row.recording_sid,
          serviceSid: serviceSid,
          customerKey: row.call_sid.slice(0, 64),
        });
        await updateTwilioTrackingCallTranscript({
          callSid: row.call_sid,
          intelligenceTranscriptSid: created.sid,
          transcriptStatus: created.status,
        });
        updated++;
        continue;
      }
      if (!row.intelligence_transcript_sid) continue;
      const st = await fetchTranscriptStatus(twilioClient, row.intelligence_transcript_sid);
      if (st === "completed") {
        const text = await fetchTranscriptFullText(twilioClient, row.intelligence_transcript_sid);
        await updateTwilioTrackingCallTranscript({
          callSid: row.call_sid,
          intelligenceTranscriptSid: row.intelligence_transcript_sid,
          transcriptStatus: "completed",
          transcriptText: text || null,
        });
        updated++;
      } else if (st === "failed" || st === "error" || st === "canceled" || st === "cancelled") {
        await updateTwilioTrackingCallTranscript({
          callSid: row.call_sid,
          intelligenceTranscriptSid: row.intelligence_transcript_sid,
          transcriptStatus: "failed",
        });
        updated++;
      } else {
        await updateTwilioTrackingCallTranscript({
          callSid: row.call_sid,
          intelligenceTranscriptSid: row.intelligence_transcript_sid,
          transcriptStatus: st,
        });
      }
    } catch (e) {
      console.error("[cron/twilio-transcripts]", row.call_sid, e);
    }
  }
  return NextResponse.json({ ok: true, processed: rows.length, updated });
}
