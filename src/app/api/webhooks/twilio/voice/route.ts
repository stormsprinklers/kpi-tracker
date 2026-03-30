import { NextResponse } from "next/server";
import twilio from "twilio";
import { initSchema } from "@/lib/db";
import { getWebAttributionInstall } from "@/lib/db/webAttributionQueries";
import {
  findActivePhoneNumberByE164,
  type WebAttributionPhoneNumberRow,
} from "@/lib/db/twilioAttributionQueries";
import {
  getTwilioRecordingWebhookUrl,
  getTwilioVoiceWebhookUrl,
  parseTwilioFormBody,
  validateTwilioWebhookRequestForIncomingRequest,
} from "@/lib/twilio/client";

export const dynamic = "force-dynamic";

/** Twilio may send To/Called in slightly different shapes; DB stores E.164 with leading +. */
function calledNumberCandidates(params: Record<string, string>): string[] {
  const raw = (params.To ?? params.Called ?? "").trim();
  if (!raw) return [];
  const out = new Set<string>([raw]);
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 15) {
    out.add(`+${digits}`);
  }
  return [...out];
}

export async function POST(request: Request) {
  await initSchema();
  const text = await request.text();
  const params = parseTwilioFormBody(text);
  const sig = request.headers.get("x-twilio-signature");
  const configuredUrl = getTwilioVoiceWebhookUrl();
  if (!(await validateTwilioWebhookRequestForIncomingRequest(request, configuredUrl, params, sig))) {
    console.warn("[twilio/voice] Invalid or missing Twilio signature (check TWILIO_WEBHOOK_BASE_URL matches the URL on the phone number).");
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  let row: WebAttributionPhoneNumberRow | null = null;
  for (const to of calledNumberCandidates(params)) {
    row = await findActivePhoneNumberByE164(to);
    if (row) break;
  }
  let forward = row?.forward_to_e164?.trim() ?? "";
  if (row && !forward) {
    const install = await getWebAttributionInstall(row.organization_id);
    forward = install?.default_forward_e164?.trim() ?? "";
  }

  const vr = new twilio.twiml.VoiceResponse();
  if (!forward) {
    vr.say(
      { voice: "Polly.Joanna" },
      "This tracking number is not configured. Please contact support."
    );
    return new NextResponse(vr.toString(), {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  }

  const dial = vr.dial({
    record: "record-from-answer-dual",
    recordingStatusCallback: getTwilioRecordingWebhookUrl(),
    recordingStatusCallbackMethod: "POST",
    recordingStatusCallbackEvent: ["completed"],
  });
  dial.number(forward);

  return new NextResponse(vr.toString(), {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}
