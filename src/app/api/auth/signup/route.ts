import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { initSchema } from "@/lib/db";
import {
  createOrganization,
  createUser,
  getUserByEmail,
} from "@/lib/db/queries";

export async function POST(request: Request) {
  try {
    await initSchema();
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      orgName?: string;
      inviteCode?: string;
    };

    const email = body.email?.trim()?.toLowerCase();
    const password = body.password;
    const orgName = body.orgName?.trim();
    const inviteCode = body.inviteCode?.trim();

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

    const existing = await getUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists. Try signing in." },
        { status: 400 }
      );
    }

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    const org = await createOrganization({
      name: orgName,
      trial_ends_at: trialEndsAt,
    });

    const passwordHash = await hash(password, 10);
    await createUser({
      email,
      password_hash: passwordHash,
      organization_id: org.id,
      role: "admin",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Signup error:", err);
    return NextResponse.json(
      { error: "Signup failed" },
      { status: 500 }
    );
  }
}
