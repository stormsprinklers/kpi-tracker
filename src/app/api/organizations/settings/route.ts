import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { updateOrganizationSettings } from "@/lib/db/queries";
import { getCompanyWithToken } from "@/lib/housecallpro";

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await request.json()) as {
    hcp_access_token?: string | null;
    hcp_webhook_secret?: string | null;
  };

  const updates: { hcp_access_token?: string | null; hcp_webhook_secret?: string | null; hcp_company_id?: string | null } = {};
  if (body.hcp_access_token !== undefined) {
    updates.hcp_access_token = body.hcp_access_token?.trim() || null;
  }
  if (body.hcp_webhook_secret !== undefined) {
    updates.hcp_webhook_secret = body.hcp_webhook_secret?.trim() || null;
  }

  if (updates.hcp_access_token) {
    try {
      const company = await getCompanyWithToken(updates.hcp_access_token);
      updates.hcp_company_id =
        (company.id as string) ?? (company.company_id as string) ?? null;
    } catch (err) {
      return NextResponse.json(
        { error: "Invalid Housecall Pro access token" },
        { status: 400 }
      );
    }
  }

  await updateOrganizationSettings(session.user.organizationId, updates);
  return NextResponse.json({ success: true });
}
