import NextAuth from "next-auth";
import { Pool } from "@neondatabase/serverless";
import { createAuthAdapter } from "@/lib/auth-adapter";
import authConfig from "./auth.config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? process.env.POSTGRES_URL,
});

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: createAuthAdapter(pool),
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  ...authConfig,
});
