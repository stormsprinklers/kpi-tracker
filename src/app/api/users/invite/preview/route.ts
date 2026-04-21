import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { initSchema } from "@/lib/db";
import { findValidOrganizationInvitation } from "@/lib/db/queries";

export async function GET(request: Request) {
  try {
    await initSchema();
    const token = new URL(request.url).searchParams.get("token")?.trim();
    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const row = await findValidOrganizationInvitation(tokenHash);
    if (!row) {
      return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 404 });
    }
    return NextResponse.json({
      orgName: row.org_name ?? "Organization",
      email: row.email,
      role: row.role,
    });
  } catch (err) {
    console.error("[users/invite/preview]", err);
    return NextResponse.json({ error: "Failed to load invitation" }, { status: 500 });
  }
}
