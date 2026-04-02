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

  if (!user.two_factor_enabled) {
    return NextResponse.json({ twoFactorRequired: false });
  }

  const ch = user.two_factor_channel;
  if (ch !== "sms" && ch !== "email") {
    return NextResponse.json(
      {
        error:
          "Two-factor is on but delivery method is missing. An admin can fix this in Settings → Security.",
      },
      { status: 400 }
    );
  }

  const verifyTo = ch === "sms" ? (user.phone_e164?.trim() ?? "") : user.email.trim();
  if (ch === "sms" && !E164.test(verifyTo)) {
    return NextResponse.json(
      {
        error:
          "Add a valid mobile number in international format (e.g. +15551234567) under Settings → Security.",
      },
      { status: 400 }
    );
  }

  const started = await startVerify(verifyTo, ch);
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
    maskedDestination: ch === "email" ? maskEmail(user.email) : maskPhone(verifyTo),
  });
}
