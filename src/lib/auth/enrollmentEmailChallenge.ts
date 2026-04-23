import { createHash, randomInt } from "crypto";
import { startVerify } from "@/lib/twilio/verify";
import { sendTransactionalEmail } from "@/lib/email/sendGrid";

export type EnrollmentEmailChallenge =
  | { provider: "twilio" }
  | { provider: "app_email"; codeHash: string };

function secret(): string {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET or NEXTAUTH_SECRET is required");
  return s;
}

function hashCode(code: string): string {
  return createHash("sha256").update(`${code}:${secret()}`).digest("hex");
}

function isEmailChannelDisabledError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("delivery channel disabled") || m.includes("channel disabled");
}

function buildEmailHtml(code: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;padding:20px;">
  <div style="max-width:540px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;">
    <h2 style="margin:0 0 10px 0;color:#0b1f33;">Verify your email</h2>
    <p style="margin:0 0 12px 0;color:#334155;">Use this code to continue setup:</p>
    <div style="font-size:28px;font-weight:700;letter-spacing:3px;color:#0b1f33;margin:8px 0 14px 0;">${code}</div>
    <p style="margin:0;color:#64748b;font-size:13px;">This code expires in 15 minutes.</p>
  </div>
</body></html>`;
}

export async function startEnrollmentEmailChallenge(
  email: string
): Promise<{ ok: true; challenge: EnrollmentEmailChallenge } | { ok: false; error: string }> {
  const twilio = await startVerify(email, "email");
  if (twilio.ok) return { ok: true, challenge: { provider: "twilio" } };
  if (!isEmailChannelDisabledError(twilio.error)) {
    return { ok: false, error: twilio.error };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const sent = await sendTransactionalEmail({
    to: [email],
    subject: "Your verification code",
    html: buildEmailHtml(code),
    text: `Your verification code is ${code}. It expires in 15 minutes.`,
  });
  if (!sent.ok) {
    return { ok: false, error: `Email verification unavailable: ${sent.error}` };
  }
  return { ok: true, challenge: { provider: "app_email", codeHash: hashCode(code) } };
}

export async function verifyEnrollmentEmailCode(
  challenge: EnrollmentEmailChallenge | null | undefined,
  code: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!challenge || challenge.provider === "twilio") {
    // Twilio path is validated by existing Verify check in routes.
    return { ok: true };
  }
  const trimmed = code.replace(/\s/g, "");
  if (!/^\d{4,10}$/.test(trimmed)) {
    return { ok: false, error: "Invalid code format" };
  }
  const provided = hashCode(trimmed);
  if (provided !== challenge.codeHash) {
    return { ok: false, error: "Email verification code is invalid or expired." };
  }
  return { ok: true };
}
