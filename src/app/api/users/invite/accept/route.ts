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

export async function POST(request: Request) {
  try {
    await initSchema();
    const body = (await request.json()) as { token?: string; password?: string };
    const token = body.token?.trim();
    const password = body.password;

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
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

    const passwordHash = await hash(password, 10);
    let hcpEmployeeId: string | null = null;
    if (role === "employee") {
      const org = await getOrganizationById(orgId);
      if (org?.hcp_company_id) {
        hcpEmployeeId = await getEmployeeHcpIdByEmail(org.hcp_company_id, email);
      }
    }

    try {
      await createUser({
        email,
        password_hash: passwordHash,
        organization_id: orgId,
        role,
        hcp_employee_id: hcpEmployeeId,
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

    await deleteOrganizationInvitation(invite.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[users/invite/accept]", err);
    return NextResponse.json({ error: "Could not complete signup" }, { status: 500 });
  }
}
