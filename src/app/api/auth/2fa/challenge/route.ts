import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { initSchema } from "@/lib/db";
import { getUserByEmail } from "@/lib/db/queries";
import { signTwoFactorPendingToken, TWO_FACTOR_PENDING_TTL_MS } from "@/lib/auth/twoFactorPendingToken";
import { startVerify } from "@/lib/twilio/verify";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const show = local.length <= 2 ? "*" : `${local.slice(0, 2)}…`;
  return `${show}@${domain}`;
}

function maskPhone(e164: string): string {
  const d = e164.replace(/\D/g, "");
  if (d.length < 4) return "***";
  return `***${d.slice(-4)}`;
}

const E164 = /^\+[1-9]\d{6,14}$/;

export async function POST(request: Request) {
  await initSchema();
  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = body.email?.trim();
  const password = body.password;
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const user = await getUserByEmail(email);
  if (!user?.password_hash) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  const valid = await compare(password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const phone = user.phone_e164?.trim() ?? "";
  const userEmail = user.email.trim();
  const smsAvailable =
    E164.test(phone) && (user.two_factor_sms_verified || user.two_factor_enabled);
  const emailAvailable = Boolean(userEmail);
  const availableChannels = [smsAvailable ? "sms" : null, emailAvailable ? "email" : null].filter(
    (x): x is "sms" | "email" => x === "sms" || x === "email"
  );
  if (availableChannels.length === 0) {
    return NextResponse.json(
      {
        error:
          "Two-factor is required, but your SMS and email channels are not verified. Contact your admin.",
      },
      { status: 400 }
    );
  }
  let ch: "sms" | "email" = availableChannels.includes("sms") ? "sms" : "email";
  let verifyTo = ch === "sms" ? phone : userEmail;
  let started = await startVerify(verifyTo, ch);
  // If preferred SMS delivery fails, automatically fall back to email when available.
  if (!started.ok && ch === "sms" && availableChannels.includes("email")) {
    ch = "email";
    verifyTo = userEmail;
    started = await startVerify(verifyTo, ch);
  }
  if (!started.ok) {
    return NextResponse.json({ error: started.error }, { status: 503 });
  }

  const pendingToken = await signTwoFactorPendingToken({
    userId: user.id,
    email: user.email,
    verifyTo,
    channel: ch,
    exp: Date.now() + TWO_FACTOR_PENDING_TTL_MS,
  });

  return NextResponse.json({
    twoFactorRequired: true,
    pendingToken,
    channel: ch,
    availableChannels,
    maskedDestination: ch === "email" ? maskEmail(user.email) : maskPhone(verifyTo),
  });
}
