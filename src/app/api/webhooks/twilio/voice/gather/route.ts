import { NextResponse } from "next/server";
import twilio from "twilio";
import { initSchema } from "@/lib/db";
import { getWebAttributionInstall } from "@/lib/db/webAttributionQueries";
import {
  findActivePhoneNumberByE164,
  type WebAttributionPhoneNumberRow,
} from "@/lib/db/twilioAttributionQueries";
import { calledNumberCandidates } from "@/lib/twilio/calledNumber";
import {
  getTwilioVoiceGatherWebhookUrl,
  parseTwilioFormBody,
  validateTwilioWebhookRequestForIncomingRequest,
} from "@/lib/twilio/client";
import { dialForwardWithRecording } from "@/lib/twilio/voiceDialTwiML";

export const dynamic = "force-dynamic";

function twiml(vr: twilio.twiml.VoiceResponse) {
  return new NextResponse(vr.toString(), {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

/** After &lt;Gather numDigits="1"&gt;: press 1 → forward + record; timeout or other digit → hang up. */
export async function POST(request: Request) {
  await initSchema();
  const text = await request.text();
  const params = parseTwilioFormBody(text);
  const sig = request.headers.get("x-twilio-signature");
  const configuredUrl = getTwilioVoiceGatherWebhookUrl();
  if (!(await validateTwilioWebhookRequestForIncomingRequest(request, configuredUrl, params, sig))) {
    console.warn("[twilio/voice/gather] Invalid Twilio signature.");
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const digits = (params.Digits ?? "").trim();

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
    vr.say({ voice: "Polly.Joanna" }, "We could not connect your call. Goodbye.");
    return twiml(vr);
  }

  if (digits === "1") {
    dialForwardWithRecording(vr, forward);
    return twiml(vr);
  }

  if (!digits) {
    vr.say({ voice: "Polly.Joanna" }, "We did not receive your selection. Goodbye.");
  } else {
    vr.say({ voice: "Polly.Joanna" }, "Sorry, that is not a valid option. Goodbye.");
  }
  return twiml(vr);
}
