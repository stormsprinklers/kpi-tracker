import { NextResponse } from "next/server";
import { initSchema } from "@/lib/db";
import {
  getOrganizationIdByTwilioSubaccountSid,
  getWebAttributionInstall,
} from "@/lib/db/webAttributionQueries";
import {
  findActivePhoneNumberByE164,
  upsertTwilioTrackingCallFromRecording,
  updateTwilioTrackingCallTranscript,
} from "@/lib/db/twilioAttributionQueries";
import {
  getTwilioClient,
  getTwilioClientForOrganization,
  getIntelligenceServiceSid,
  getTwilioRecordingWebhookUrl,
  parseTwilioFormBody,
  validateTwilioWebhookRequest,
} from "@/lib/twilio/client";
import { createTranscriptFromRecording } from "@/lib/twilio/intelligence";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await initSchema();
  const text = await request.text();
  const params = parseTwilioFormBody(text);
  const sig = request.headers.get("x-twilio-signature");
  const url = getTwilioRecordingWebhookUrl();
  if (!(await validateTwilioWebhookRequest(url, params, sig))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const status = (params.RecordingStatus ?? "").toLowerCase();
  if (status !== "completed") {
    return new NextResponse("", { status: 200 });
  }

  const callSid = params.CallSid ?? "";
  const recordingSid = params.RecordingSid ?? null;
  const durationRaw = params.RecordingDuration;
  const durationSeconds = durationRaw ? parseInt(durationRaw, 10) : null;

  if (!callSid) {
    return new NextResponse("", { status: 200 });
  }

  let fromE164: string | null = params.Caller ?? params.From ?? null;
  let toE164: string | null = params.Called ?? params.To ?? null;

  const accountSid = params.AccountSid ?? "";
  const orgFromAccount = accountSid ? await getOrganizationIdByTwilioSubaccountSid(accountSid) : null;
  const mainSid =
    process.env.TWILIO_MASTER_ACCOUNT_SID?.trim() || process.env.TWILIO_ACCOUNT_SID?.trim() || "";

  try {
    if (orgFromAccount) {
      const client = await getTwilioClientForOrganization(orgFromAccount);
      const call = await client.calls(callSid).fetch();
      fromE164 = call.from ?? fromE164;
      toE164 = call.to ?? toE164;
    } else if (accountSid && mainSid && accountSid === mainSid) {
      const client = getTwilioClient();
      const call = await client.calls(callSid).fetch();
      fromE164 = call.from ?? fromE164;
      toE164 = call.to ?? toE164;
    }
  } catch {
    // keep query params only
  }

  const phoneRow = toE164 ? await findActivePhoneNumberByE164(toE164) : null;
  if (!phoneRow) {
    return new NextResponse("", { status: 200 });
  }

  await upsertTwilioTrackingCallFromRecording({
    organizationId: phoneRow.organization_id,
    sourceId: phoneRow.source_id,
    phoneNumberId: phoneRow.id,
    callSid,
    recordingSid,
    fromE164,
    toE164,
    durationSeconds: Number.isFinite(durationSeconds as number) ? durationSeconds : null,
    callbackPayload: params as Record<string, unknown>,
  });

  const install = await getWebAttributionInstall(phoneRow.organization_id);
  const twilioClient = await getTwilioClientForOrganization(phoneRow.organization_id);

  if (recordingSid) {
    try {
      const serviceSid = getIntelligenceServiceSid(install?.twilio_intelligence_service_sid ?? null);
      const created = await createTranscriptFromRecording({
        client: twilioClient,
        recordingSid,
        serviceSid,
        customerKey: callSid.slice(0, 64),
      });
      await updateTwilioTrackingCallTranscript({
        callSid,
        intelligenceTranscriptSid: created.sid,
        transcriptStatus: created.status,
      });
    } catch (e) {
      console.error("[twilio/recording] intelligence transcript", e);
      await updateTwilioTrackingCallTranscript({
        callSid,
        intelligenceTranscriptSid: null,
        transcriptStatus: "failed",
      });
    }
  }

  return new NextResponse("", { status: 200 });
}
