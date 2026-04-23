import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hash } from "bcryptjs";
import {
  getUsersByOrganizationId,
  createUser,
  getOrganizationById,
  getEmployeeHcpIdByEmail,
  getUserPermissions,
} from "@/lib/db/queries";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const users = await getUsersByOrganizationId(session.user.organizationId);
  const withPerms = await Promise.all(
    users.map(async (u) => ({
      ...u,
      permissions: await getUserPermissions(u.id),
    }))
  );
  return NextResponse.json(withPerms);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await request.json()) as {
    email?: string;
    password?: string;
    role?: "admin" | "employee" | "salesman" | "investor";
  };

  const email = body.email?.trim();
  const password = body.password;
  const role = body.role ?? "employee";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }
  if (role !== "admin" && role !== "employee" && role !== "salesman" && role !== "investor") {
    return NextResponse.json(
      { error: "Role must be admin, employee, salesman, or investor" },
      { status: 400 }
    );
  }

  try {
    const passwordHash = await hash(password, 10);
    let hcpEmployeeId: string | null = null;
    if (role === "employee" || role === "salesman") {
      const org = await getOrganizationById(session.user.organizationId);
      if (org?.hcp_company_id) {
        hcpEmployeeId = await getEmployeeHcpIdByEmail(org.hcp_company_id, email);
      }
    }
    const user = await createUser({
      email,
      password_hash: passwordHash,
      organization_id: session.user.organizationId,
      role,
      hcp_employee_id: hcpEmployeeId,
    });
    return NextResponse.json({
      id: user.id,
      email: user.email,
      role: user.role,
      hcp_employee_id: user.hcp_employee_id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json(
        { error: "A user with this email already exists in your organization" },
        { status: 400 }
      );
    }
    throw err;
  }
}
