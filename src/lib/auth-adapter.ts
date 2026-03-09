import NeonAdapter from "@auth/neon-adapter";
import type { Pool } from "@neondatabase/serverless";

/**
 * Custom adapter extending Neon adapter with case-insensitive getUserByEmail
 * so existing app users can sign in with Google (account linking).
 */
export function createAuthAdapter(pool: Pool) {
  const base = NeonAdapter(pool);
  return {
    ...base,
    async getUserByEmail(email: string) {
      const result = await pool.query(
        `select * from users where LOWER(email) = LOWER($1) limit 1`,
        [email]
      );
      return result.rowCount !== 0 ? result.rows[0] : null;
    },
  };
}
