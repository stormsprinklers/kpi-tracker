import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  createOrganizationInvitation,
  deleteOrganizationInvitation,
  deletePendingInvitationsForOrgEmail,
  getOrganizationById,
  getOrganizationUserByEmail,
} from "@/lib/db/queries";
import {
  buildOrganizationInviteEmailHtml,
  buildOrganizationInviteEmailPlainText,
} from "@/lib/email/organizationInviteEmailTemplate";
import { resolveAppBaseUrl } from "@/lib/email/resolveAppBaseUrl";
import { sendTransactionalEmail } from "@/lib/email/sendGrid";

function roleLabel(role: string): string {
  if (role === "admin") return "Admin";
  if (role === "investor") return "Investor";
  return "Employee";
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await request.json()) as { email?: string; role?: "admin" | "employee" | "investor" };
  const email = body.email?.trim().toLowerCase();
  const role = body.role ?? "employee";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (role !== "admin" && role !== "employee" && role !== "investor") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  try {
    await initSchema();
    const orgId = session.user.organizationId;

    const existing = await getOrganizationUserByEmail(orgId, email);
    if (existing) {
      return NextResponse.json(
        { error: "A user with this email is already in your organization" },
        { status: 400 }
      );
    }

    const org = await getOrganizationById(orgId);
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await deletePendingInvitationsForOrgEmail(orgId, email);
    const created = await createOrganizationInvitation({
      organization_id: orgId,
      email,
      token_hash: tokenHash,
      role,
      invited_by_user_id: session.user.id,
      expires_at: expiresAt,
    });

    const base = resolveAppBaseUrl();
    const joinUrl = `${base}/join?token=${encodeURIComponent(token)}`;

    const html = buildOrganizationInviteEmailHtml({
      orgName: org.name ?? "Your organization",
      roleLabel: roleLabel(role),
      appBaseUrl: base,
      joinUrl,
      invitedByEmail: session.user.email ?? null,
    });
    const text = buildOrganizationInviteEmailPlainText({
      orgName: org.name ?? "Your organization",
      roleLabel: roleLabel(role),
      appBaseUrl: base,
      joinUrl,
      invitedByEmail: session.user.email ?? null,
    });

    const send = await sendTransactionalEmail({
      to: [email],
      subject: `You're invited to join ${org.name ?? "Home Services Analytics"}`,
      html,
      text,
    });

    if (!send.ok) {
      console.error("[users/invite] SendGrid:", send.error);
      await deleteOrganizationInvitation(created.id);
      return NextResponse.json(
        { error: "Email could not be sent. Check SendGrid configuration (SENDGRID_API_KEY), then try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, message: "Invitation sent." });
  } catch (err) {
    console.error("[users/invite]", err);
    return NextResponse.json({ error: "Failed to send invitation" }, { status: 500 });
  }
}
