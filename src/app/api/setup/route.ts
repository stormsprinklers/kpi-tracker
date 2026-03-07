import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { initSchema } from "@/lib/db";
import {
  getOrganizationsCount,
  createOrganization,
  createUser,
  updateOrganizationSettings,
} from "@/lib/db/queries";
import { getCompanyWithToken } from "@/lib/housecallpro";

export async function POST(request: Request) {
  try {
    await initSchema();
    const count = await getOrganizationsCount();
    if (count > 0) {
      return NextResponse.json(
        { error: "Setup already completed" },
        { status: 400 }
      );
    }

    const body = (await request.json()) as {
      orgName?: string;
      adminEmail?: string;
      adminPassword?: string;
      hcpToken?: string;
    };

    const orgName = body.orgName?.trim();
    const adminEmail = body.adminEmail?.trim();
    const adminPassword = body.adminPassword;

    if (!orgName || !adminEmail || !adminPassword) {
      return NextResponse.json(
        { error: "Organization name, admin email, and password are required" },
        { status: 400 }
      );
    }

    if (adminPassword.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const org = await createOrganization({ name: orgName });
    const passwordHash = await hash(adminPassword, 10);
    await createUser({
      email: adminEmail,
      password_hash: passwordHash,
      organization_id: org.id,
      role: "admin",
    });

    let hcpCompanyId: string | null = null;
    const hcpToken = body.hcpToken?.trim();
    if (hcpToken) {
      try {
        const company = await getCompanyWithToken(hcpToken);
        hcpCompanyId =
          (company.id as string) ??
          (company.company_id as string) ??
          null;
        await updateOrganizationSettings(org.id, {
          hcp_access_token: hcpToken,
          hcp_company_id: hcpCompanyId,
        });
      } catch (err) {
        console.error("HCP token validation failed:", err);
        return NextResponse.json({
          success: true,
          warning:
            "Organization created, but Housecall Pro token is invalid. You can add a valid token in Settings.",
        });
      }
    } else {
      const envToken = process.env.HOUSECALLPRO_ACCESS_TOKEN?.trim();
      if (envToken) {
        try {
          const company = await getCompanyWithToken(envToken);
          hcpCompanyId =
            (company.id as string) ??
            (company.company_id as string) ??
            null;
          await updateOrganizationSettings(org.id, {
            hcp_access_token: envToken,
            hcp_company_id: hcpCompanyId,
          });
        } catch {
          // Ignore - admin can add token later
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Setup error:", err);
    return NextResponse.json(
      { error: "Setup failed" },
      { status: 500 }
    );
  }
}
