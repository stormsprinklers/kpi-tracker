import twilio from "twilio";
import { getTwilioPublicHttpsOrigin } from "@/lib/twilio/client";

/** Append &lt;Dial&gt; with dual-channel recording + recording status callback (same as tracking baseline). */
export function dialForwardWithRecording(vr: twilio.twiml.VoiceResponse, forwardE164: string): void {
  const origin = getTwilioPublicHttpsOrigin();
  const recordingCb = origin ? `${origin}/api/webhooks/twilio/recording` : null;
  if (recordingCb) {
    const dial = vr.dial({
      record: "record-from-answer-dual",
      recordingStatusCallback: recordingCb,
      recordingStatusCallbackMethod: "POST",
      recordingStatusCallbackEvent: ["completed"],
    });
    dial.number(forwardE164);
  } else {
    console.warn(
      "[twilio/voiceDial] No absolute https webhook base (set TWILIO_WEBHOOK_BASE_URL or VERCEL_URL); dialing without recording."
    );
    vr.dial().number(forwardE164);
  }
}
