import twilio from "twilio";
import { getTwilioRecordingWebhookUrl } from "@/lib/twilio/client";

/** Append &lt;Dial&gt; with dual-channel recording + recording status callback (same as tracking baseline). */
export function dialForwardWithRecording(vr: twilio.twiml.VoiceResponse, forwardE164: string): void {
  const dial = vr.dial({
    record: "record-from-answer-dual",
    recordingStatusCallback: getTwilioRecordingWebhookUrl(),
    recordingStatusCallbackMethod: "POST",
    recordingStatusCallbackEvent: ["completed"],
  });
  dial.number(forwardE164);
}
