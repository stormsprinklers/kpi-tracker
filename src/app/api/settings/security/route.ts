import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { getUserById, updateUserTwoFactorSettings } from "@/lib/db/queries";

const E164 = /^\+[1-9]\d{6,14}$/;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await initSchema();
  const user = await getUserById(session.user.id);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    hasPassword: Boolean(user.password_hash),
    two_factor_enabled: user.two_factor_enabled,
    two_factor_channel: user.two_factor_channel,
    phone_e164: user.phone_e164 ?? "",
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await initSchema();

  const user = await getUserById(session.user.id);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!user.password_hash) {
    return NextResponse.json(
      {
        error:
          "Two-factor for password sign-in requires a password on your account (e.g. set one after signing up with Google).",
      },
      { status: 400 }
    );
  }

  let body: {
    two_factor_enabled?: boolean;
    two_factor_channel?: "sms" | "email" | null;
    phone_e164?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let phoneUpdate: string | null | undefined;
  if (body.phone_e164 !== undefined) {
    const p = body.phone_e164?.trim() || null;
    if (p && !E164.test(p)) {
      return NextResponse.json({ error: "Invalid E.164 phone number (e.g. +15551234567)." }, { status: 400 });
    }
    phoneUpdate = p;
  }

  if (body.two_factor_enabled === true) {
    const ch = body.two_factor_channel ?? user.two_factor_channel;
    if (ch !== "sms" && ch !== "email") {
      return NextResponse.json(
        { error: "Choose delivery method: sms or email when enabling two-factor." },
        { status: 400 }
      );
    }
    const effectivePhone = phoneUpdate !== undefined ? phoneUpdate : user.phone_e164;
    if (ch === "sms" && (!effectivePhone || !E164.test(effectivePhone.trim()))) {
      return NextResponse.json(
        { error: "SMS two-factor requires a valid E.164 mobile number." },
        { status: 400 }
      );
    }
    if (phoneUpdate !== undefined) {
      await updateUserTwoFactorSettings(session.user.id, { phone_e164: phoneUpdate });
    }
    await updateUserTwoFactorSettings(session.user.id, { two_factor_channel: ch });
    await updateUserTwoFactorSettings(session.user.id, { two_factor_enabled: true });
  } else if (body.two_factor_enabled === false) {
    await updateUserTwoFactorSettings(session.user.id, { two_factor_enabled: false });
  } else {
    if (phoneUpdate !== undefined) {
      await updateUserTwoFactorSettings(session.user.id, { phone_e164: phoneUpdate });
    }
    if (body.two_factor_channel !== undefined) {
      const ch = body.two_factor_channel;
      if (ch !== null && ch !== "sms" && ch !== "email") {
        return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
      }
      const refreshed = await getUserById(session.user.id);
      if (refreshed?.two_factor_enabled && ch === "sms") {
        const ph = (refreshed.phone_e164 ?? "").trim();
        if (!E164.test(ph)) {
          return NextResponse.json(
            { error: "Set a valid E.164 phone before choosing SMS." },
            { status: 400 }
          );
        }
      }
      await updateUserTwoFactorSettings(session.user.id, { two_factor_channel: ch });
    }
  }

  const updated = await getUserById(session.user.id);
  return NextResponse.json({
    hasPassword: Boolean(updated?.password_hash),
    two_factor_enabled: updated?.two_factor_enabled ?? false,
    two_factor_channel: updated?.two_factor_channel ?? null,
    phone_e164: updated?.phone_e164 ?? "",
  });
}
