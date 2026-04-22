import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { initSchema } from "@/lib/db";
import {
  createOrganization,
  createUser,
  getUserByEmail,
} from "@/lib/db/queries";
import { checkVerifyCode, startVerify } from "@/lib/twilio/verify";
import {
  signTwoFactorEnrollmentToken,
  TWO_FACTOR_ENROLLMENT_TTL_MS,
  verifyTwoFactorEnrollmentToken,
} from "@/lib/auth/twoFactorEnrollmentToken";

const E164 = /^\+[1-9]\d{6,14}$/;

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

export async function POST(request: Request) {
  try {
    await initSchema();
    const body = (await request.json()) as {
      step?: "start" | "complete";
      email?: string;
      password?: string;
      orgName?: string;
      inviteCode?: string;
      phoneE164?: string;
      pendingToken?: string;
      emailCode?: string;
      smsCode?: string;
    };
    const step = body.step ?? "start";

    if (step === "complete") {
      const pendingToken = body.pendingToken?.trim() ?? "";
      const emailCode = body.emailCode?.trim() ?? "";
      const smsCode = body.smsCode?.trim() ?? "";
      if (!pendingToken || !emailCode || !smsCode) {
        return NextResponse.json(
          { error: "pendingToken, emailCode, and smsCode are required." },
          { status: 400 }
        );
      }
      const payload = await verifyTwoFactorEnrollmentToken(pendingToken);
      if (!payload || payload.flow !== "signup") {
        return NextResponse.json({ error: "Enrollment session expired. Start again." }, { status: 401 });
      }
      const existing = await getUserByEmail(payload.email);
      if (existing) {
        return NextResponse.json(
          { error: "An account with this email already exists. Try signing in." },
          { status: 400 }
        );
      }
      const emailCheck = await checkVerifyCode(payload.email, emailCode);
      if (!emailCheck.ok) {
        return NextResponse.json({ error: "Email verification code is invalid or expired." }, { status: 400 });
      }
      const smsCheck = await checkVerifyCode(payload.phoneE164, smsCode);
      if (!smsCheck.ok) {
        return NextResponse.json({ error: "SMS verification code is invalid or expired." }, { status: 400 });
      }

      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 14);

      const org = await createOrganization({
        name: payload.orgName,
        trial_ends_at: trialEndsAt,
      });

      await createUser({
        email: payload.email,
        password_hash: payload.passwordHash,
        organization_id: org.id,
        role: "admin",
        two_factor_enabled: true,
        two_factor_channel: "sms",
        phone_e164: payload.phoneE164,
        two_factor_sms_verified: true,
        two_factor_email_verified: true,
      });
      return NextResponse.json({ success: true });
    }

    const email = body.email?.trim()?.toLowerCase();
    const password = body.password;
    const orgName = body.orgName?.trim();
    const inviteCode = body.inviteCode?.trim();
    const phoneE164 = body.phoneE164?.trim();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (inviteCode) {
      return NextResponse.json(
        { error: "Invite links are not yet supported. Please create a new organization." },
        { status: 400 }
      );
    }

    if (!orgName) {
      return NextResponse.json(
        { error: "Organization name is required to sign up" },
        { status: 400 }
      );
    }

    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }
    if (!phoneE164 || !E164.test(phoneE164)) {
      return NextResponse.json(
        { error: "A valid mobile number in E.164 is required (e.g. +15551234567)." },
        { status: 400 }
      );
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists. Try signing in." },
        { status: 400 }
      );
    }

    const emailStart = await startVerify(email, "email");
    if (!emailStart.ok) {
      return NextResponse.json({ error: emailStart.error }, { status: 503 });
    }
    const smsStart = await startVerify(phoneE164, "sms");
    if (!smsStart.ok) {
      return NextResponse.json({ error: smsStart.error }, { status: 503 });
    }
    const passwordHash = await hash(password, 10);
    const pendingToken = await signTwoFactorEnrollmentToken({
      flow: "signup",
      email,
      phoneE164,
      orgName,
      passwordHash,
      exp: Date.now() + TWO_FACTOR_ENROLLMENT_TTL_MS,
    });
    return NextResponse.json({
      success: true,
      pendingToken,
      maskedEmail: maskEmail(email),
      maskedPhone: maskPhone(phoneE164),
    });
  } catch (err) {
    console.error("Signup error:", err);
    return NextResponse.json(
      { error: "Signup failed" },
      { status: 500 }
    );
  }
}
