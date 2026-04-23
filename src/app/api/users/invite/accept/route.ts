import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { hash } from "bcryptjs";
import { initSchema } from "@/lib/db";
import {
  createUser,
  deleteOrganizationInvitation,
  findValidOrganizationInvitation,
  getEmployeeHcpIdByEmail,
  getOrganizationById,
  getOrganizationUserByEmail,
} from "@/lib/db/queries";
import { checkVerifyCode, startVerify } from "@/lib/twilio/verify";
import {
  signTwoFactorEnrollmentToken,
  TWO_FACTOR_ENROLLMENT_TTL_MS,
  verifyTwoFactorEnrollmentToken,
} from "@/lib/auth/twoFactorEnrollmentToken";
import {
  startEnrollmentEmailChallenge,
  verifyEnrollmentEmailCode,
} from "@/lib/auth/enrollmentEmailChallenge";

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
      token?: string;
      password?: string;
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
      if (!payload || payload.flow !== "invite") {
        return NextResponse.json({ error: "Enrollment session expired. Start again." }, { status: 401 });
      }
      const already = await getOrganizationUserByEmail(payload.organizationId, payload.email);
      if (already) {
        await deleteOrganizationInvitation(payload.inviteId);
        return NextResponse.json(
          { error: "This email is already a member of the organization." },
          { status: 400 }
        );
      }
      if (payload.emailChallenge?.provider === "twilio" || !payload.emailChallenge) {
        const emailCheck = await checkVerifyCode(payload.email, emailCode);
        if (!emailCheck.ok) {
          return NextResponse.json({ error: "Email verification code is invalid or expired." }, { status: 400 });
        }
      } else {
        const fallback = await verifyEnrollmentEmailCode(payload.emailChallenge, emailCode);
        if (!fallback.ok) {
          return NextResponse.json({ error: fallback.error }, { status: 400 });
        }
      }
      const smsCheck = await checkVerifyCode(payload.phoneE164, smsCode);
      if (!smsCheck.ok) {
        return NextResponse.json({ error: "SMS verification code is invalid or expired." }, { status: 400 });
      }
      try {
        await createUser({
          email: payload.email,
          password_hash: payload.passwordHash,
          organization_id: payload.organizationId,
          role: payload.role,
          hcp_employee_id: payload.hcpEmployeeId,
          two_factor_enabled: true,
          two_factor_channel: "sms",
          phone_e164: payload.phoneE164,
          two_factor_sms_verified: true,
          two_factor_email_verified: true,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("unique") || msg.includes("duplicate")) {
          return NextResponse.json(
            { error: "Could not create account. This email may already be registered." },
            { status: 400 }
          );
        }
        throw err;
      }
      await deleteOrganizationInvitation(payload.inviteId);
      return NextResponse.json({ success: true });
    }

    const token = body.token?.trim();
    const password = body.password;
    const phoneE164 = body.phoneE164?.trim();

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
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

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const invite = await findValidOrganizationInvitation(tokenHash);
    if (!invite) {
      return NextResponse.json(
        { error: "Invalid or expired invitation. Ask your admin to send a new invite." },
        { status: 400 }
      );
    }

    const orgId = invite.organization_id;
    const email = invite.email.trim().toLowerCase();
    const role = invite.role as "admin" | "employee" | "investor";

    if (role !== "admin" && role !== "employee" && role !== "investor") {
      return NextResponse.json({ error: "Invalid invitation" }, { status: 400 });
    }

    const already = await getOrganizationUserByEmail(orgId, email);
    if (already) {
      await deleteOrganizationInvitation(invite.id);
      return NextResponse.json(
        { error: "This email is already a member of the organization." },
        { status: 400 }
      );
    }

    let hcpEmployeeId: string | null = null;
    if (role === "employee") {
      const org = await getOrganizationById(orgId);
      if (org?.hcp_company_id) {
        hcpEmployeeId = await getEmployeeHcpIdByEmail(org.hcp_company_id, email);
      }
    }

    const emailChallenge = await startEnrollmentEmailChallenge(email);
    if (!emailChallenge.ok) {
      return NextResponse.json({ error: emailChallenge.error }, { status: 503 });
    }
    const smsStart = await startVerify(phoneE164, "sms");
    if (!smsStart.ok) {
      return NextResponse.json({ error: smsStart.error }, { status: 503 });
    }
    const passwordHash = await hash(password, 10);
    const pendingToken = await signTwoFactorEnrollmentToken({
      flow: "invite",
      inviteId: invite.id,
      organizationId: orgId,
      email,
      role,
      hcpEmployeeId,
      phoneE164,
      passwordHash,
      emailChallenge: emailChallenge.challenge,
      exp: Date.now() + TWO_FACTOR_ENROLLMENT_TTL_MS,
    });
    return NextResponse.json({
      success: true,
      pendingToken,
      maskedEmail: maskEmail(email),
      maskedPhone: maskPhone(phoneE164),
    });
  } catch (err) {
    console.error("[users/invite/accept]", err);
    return NextResponse.json({ error: "Could not complete signup" }, { status: 500 });
  }
}
