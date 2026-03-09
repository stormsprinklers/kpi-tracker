import NextAuth from "next-auth";
import NeonAdapter from "@auth/neon-adapter";
import { Pool } from "@neondatabase/serverless";
import authConfig from "./auth.config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? process.env.POSTGRES_URL,
});

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: NeonAdapter(pool),
  session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 },
  ...authConfig,
});
