/** PostgreSQL deadlock_detected */
const DEADLOCK_SQLSTATE = "40P01";
const MAX_ATTEMPTS = 6;
const BASE_DELAY_MS = 40;

function isDeadlockError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const o = err as { code?: string; cause?: unknown; message?: string };
  if (o.code === DEADLOCK_SQLSTATE) return true;
  const msg = typeof o.message === "string" ? o.message.toLowerCase() : "";
  if (msg.includes("deadlock")) return true;
  if (o.cause) return isDeadlockError(o.cause);
  return false;
}

function backoffMs(attempt: number): number {
  return BASE_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * 60);
}

/**
 * Re-run an async DB operation when Postgres reports a transient deadlock (40P01).
 * Common when sync and webhooks upsert `jobs` concurrently.
 */
export async function withDeadlockRetry<T>(run: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await run();
    } catch (e) {
      last = e;
      if (!isDeadlockError(e) || attempt === MAX_ATTEMPTS - 1) throw e;
      await new Promise((r) => setTimeout(r, backoffMs(attempt)));
    }
  }
  throw last;
}
