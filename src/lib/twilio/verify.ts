import { getTwilioMasterClient } from "@/lib/twilio/client";

export type VerifyChannel = "sms" | "email";

function serviceSid(): string | null {
  return process.env.TWILIO_VERIFY_SERVICE_SID?.trim() || null;
}

/**
 * Start Twilio Verify OTP to phone (E.164) or email. Requires TWILIO_VERIFY_SERVICE_SID
 * and Verify email integration in Twilio Console for email channel.
 */
export async function startVerify(
  to: string,
  channel: VerifyChannel
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sid = serviceSid();
  if (!sid) {
    return { ok: false, error: "TWILIO_VERIFY_SERVICE_SID is not configured" };
  }
  try {
    const client = getTwilioMasterClient();
    await client.verify.v2.services(sid).verifications.create({
      to: to.trim(),
      channel,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Twilio Verify request failed";
    return { ok: false, error: msg };
  }
}

export async function checkVerifyCode(
  to: string,
  code: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sid = serviceSid();
  if (!sid) {
    return { ok: false, error: "TWILIO_VERIFY_SERVICE_SID is not configured" };
  }
  const trimmed = code.replace(/\s/g, "");
  if (!/^\d{4,10}$/.test(trimmed)) {
    return { ok: false, error: "Invalid code format" };
  }
  try {
    const client = getTwilioMasterClient();
    const check = await client.verify.v2.services(sid).verificationChecks.create({
      to: to.trim(),
      code: trimmed,
    });
    if (check.status === "approved") {
      return { ok: true };
    }
    return { ok: false, error: "Invalid or expired code" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Verification check failed";
    return { ok: false, error: msg };
  }
}
