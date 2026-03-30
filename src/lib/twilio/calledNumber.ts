/** Twilio may send To/Called in slightly different shapes; DB stores E.164 with leading +. */
export function calledNumberCandidates(params: Record<string, string>): string[] {
  const raw = (params.To ?? params.Called ?? "").trim();
  if (!raw) return [];
  const out = new Set<string>([raw]);
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 15) {
    out.add(`+${digits}`);
  }
  return [...out];
}
