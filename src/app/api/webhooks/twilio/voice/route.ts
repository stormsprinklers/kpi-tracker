import { NextResponse } from "next/server";
import twilio from "twilio";
import { initSchema } from "@/lib/db";
import { getWebAttributionInstall } from "@/lib/db/webAttributionQueries";
import { findActivePhoneNumberByE164 } from "@/lib/db/twilioAttributionQueries";
import {
  getTwilioRecordingWebhookUrl,
  getTwilioVoiceWebhookUrl,
  parseTwilioFormBody,
  validateTwilioWebhookRequest,
} from "@/lib/twilio/client";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await initSchema();
  const text = await request.text();
  const params = parseTwilioFormBody(text);
  const sig = request.headers.get("x-twilio-signature");
  const url = getTwilioVoiceWebhookUrl();
  if (!(await validateTwilioWebhookRequest(url, params, sig))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const to = params.To ?? "";
  const row = await findActivePhoneNumberByE164(to);
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
