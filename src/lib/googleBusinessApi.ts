/** Google Business Profile HTTP helpers (Account Management + Business Information + v4 reviews). */

export function parseResourceSuffix(name: string | undefined, segment: string): string | null {
  if (!name) return null;
  const parts = name.split("/");
  const i = parts.indexOf(segment);
  if (i >= 0 && parts[i + 1]) return parts[i + 1];
  return null;
}

export interface GbpAccount {
  name: string;
  accountName?: string;
  accountId: string;
}

export interface GbpLocation {
  name: string;
  title?: string;
  locationId: string;
}

export async function listGbpAccounts(accessToken: string): Promise<GbpAccount[]> {
  const url = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`List accounts failed (${res.status}): ${text.slice(0, 500)}`);
  }
  const data = JSON.parse(text) as { accounts?: Array<{ name?: string; accountName?: string }> };
  const out: GbpAccount[] = [];
  for (const a of data.accounts ?? []) {
    const name = a.name ?? "";
    const accountId = parseResourceSuffix(name, "accounts");
    if (!accountId) continue;
    out.push({ name, accountName: a.accountName, accountId });
  }
  return out;
}

export async function listGbpLocations(
  accessToken: string,
  accountId: string
): Promise<GbpLocation[]> {
  const url = `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${encodeURIComponent(
    accountId
  )}/locations?readMask=name,title`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`List locations failed (${res.status}): ${text.slice(0, 500)}`);
  }
  const data = JSON.parse(text) as {
    locations?: Array<{ name?: string; title?: string }>;
  };
  const out: GbpLocation[] = [];
  for (const loc of data.locations ?? []) {
    const name = loc.name ?? "";
    const locationId = parseResourceSuffix(name, "locations");
    if (!locationId) continue;
    out.push({ name, title: loc.title, locationId });
  }
  return out;
}
