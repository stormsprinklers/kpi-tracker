import { NextResponse } from "next/server";
import twilio from "twilio";
import { initSchema } from "@/lib/db";
import { getOrganizationById } from "@/lib/db/queries";
import { getWebAttributionInstall } from "@/lib/db/webAttributionQueries";
import {
  findActivePhoneNumberByE164,
  type WebAttributionPhoneNumberRow,
} from "@/lib/db/twilioAttributionQueries";
import { calledNumberCandidates } from "@/lib/twilio/calledNumber";
import { resolveIvrSayText } from "@/lib/twilio/ivrSayText";
import {
  getTwilioVoiceGatherWebhookUrl,
  getTwilioVoiceWebhookUrl,
  parseTwilioFormBody,
  validateTwilioWebhookRequestForIncomingRequest,
} from "@/lib/twilio/client";
import { dialForwardWithRecording } from "@/lib/twilio/voiceDialTwiML";

export const dynamic = "force-dynamic";

function twimlResponse(vr: twilio.twiml.VoiceResponse) {
  return new NextResponse(vr.toString(), {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  try {
    await initSchema();
    const text = await request.text();
    const params = parseTwilioFormBody(text);
    const sig = request.headers.get("x-twilio-signature");
    const configuredUrl = getTwilioVoiceWebhookUrl();
    if (!(await validateTwilioWebhookRequestForIncomingRequest(request, configuredUrl, params, sig))) {
      console.warn(
        "[twilio/voice] Invalid or missing Twilio signature (check TWILIO_WEBHOOK_BASE_URL matches the URL Twilio posts to, and subaccount Auth Token is stored for signature validation)."
      );
      const deny = new twilio.twiml.VoiceResponse();
      deny.say({ voice: "Polly.Joanna" }, "Call could not be verified. Please contact support.");
      return twimlResponse(deny);
    }

    let row: WebAttributionPhoneNumberRow | null = null;
    for (const to of calledNumberCandidates(params)) {
      row = await findActivePhoneNumberByE164(to);
      if (row) break;
    }
    let forward = row?.forward_to_e164?.trim() ?? "";
    const install = row ? await getWebAttributionInstall(row.organization_id) : null;
    if (row && !forward) {
      forward = install?.default_forward_e164?.trim() ?? "";
    }

    const vr = new twilio.twiml.VoiceResponse();
    if (!forward) {
      vr.say(
        { voice: "Polly.Joanna" },
        "This tracking number is not configured. Please contact support."
      );
      return twimlResponse(vr);
    }

    const ivrOn = Boolean(install?.call_tracking_ivr_enabled);
    const gatherUrl = getTwilioVoiceGatherWebhookUrl();
    if (ivrOn && gatherUrl.startsWith("https://")) {
      const org = row ? await getOrganizationById(row.organization_id) : null;
      const prompt = resolveIvrSayText(install?.call_tracking_ivr_prompt, org?.name ?? null);
      const gather = vr.gather({
        action: gatherUrl,
        method: "POST",
        numDigits: 1,
        timeout: 12,
      });
      gather.say({ voice: "Polly.Joanna" }, prompt);
      return twimlResponse(vr);
    }

    if (ivrOn && !gatherUrl.startsWith("https://")) {
      console.warn("[twilio/voice] IVR enabled but gather URL is not https; connecting caller without IVR.");
    }

    dialForwardWithRecording(vr, forward);
    return twimlResponse(vr);
  } catch (e) {
    console.error("[twilio/voice] Unhandled error", e);
    const vr = new twilio.twiml.VoiceResponse();
    vr.say({ voice: "Polly.Joanna" }, "We are having a technical problem. Please try again later.");
    return twimlResponse(vr);
  }
}
