import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { getGoogleRefreshToken } from "@/lib/db/queries";
import { listGbpAccounts, listGbpLocations } from "@/lib/googleBusinessApi";
import { getGoogleBusinessAccessTokenForOrg } from "@/lib/googleBusinessTokens";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await initSchema();
  const refresh = await getGoogleRefreshToken(session.user.organizationId);
  if (!refresh) {
    return NextResponse.json(
      { error: "Connect a Google account first." },
      { status: 400 }
    );
  }

  try {
    const accessToken = await getGoogleBusinessAccessTokenForOrg(
      session.user.organizationId
    );
    const accounts = await listGbpAccounts(accessToken);
    const accountsWithLocations = [];
    for (const acc of accounts) {
      const locations = await listGbpLocations(accessToken, acc.accountId);
      accountsWithLocations.push({
        accountId: acc.accountId,
        accountName: acc.accountName ?? acc.accountId,
        locations: locations.map((l) => ({
          locationId: l.locationId,
          title: l.title ?? l.locationId,
        })),
      });
    }
    return NextResponse.json({ accounts: accountsWithLocations });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load locations";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
