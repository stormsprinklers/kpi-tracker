import { createHash, randomBytes } from "crypto";

export function normalizeOrigin(input: string): string | null {
  try {
    const url = new URL(input);
    if (!url.protocol.startsWith("http")) return null;
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeOriginList(values: string[]): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const n = normalizeOrigin(v.trim());
    if (n) set.add(n);
  }
  return [...set];
}

export function hashPublishableKey(rawKey: string): string {
  const pepper = process.env.WEB_ATTRIBUTION_PEPPER ?? "";
  return createHash("sha256")
    .update(`web-attribution::${pepper}::${rawKey}`)
    .digest("hex");
}

export function createPublishableKey(): string {
  return `hsa_pub_${randomBytes(18).toString("hex")}`;
}

export function createSourceToken(): string {
  return `src_${randomBytes(10).toString("hex")}`;
}

export function hashIp(input: string): string {
  const pepper = process.env.WEB_ATTRIBUTION_PEPPER ?? "";
  return createHash("sha256")
    .update(`ip::${pepper}::${input}`)
    .digest("hex");
}

