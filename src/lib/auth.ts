import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { getUserByEmail } from "./db/queries";
import { initSchema } from "./db";

export interface SessionUser {
  id: string;
  email: string;
  role: string;
  organizationId: string;
  organizationName?: string;
}

declare module "next-auth" {
  interface Session {
    user: SessionUser;
  }
  interface User {
    id?: string;
    role?: string;
    organizationId?: string;
    organizationName?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    organizationId: string;
    organizationName?: string;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        await initSchema();
        const user = await getUserByEmail(credentials.email);
        if (!user) return null;
        const valid = await compare(credentials.password, user.password_hash);
        if (!valid) return null;
        return {
          id: user.id,
          email: user.email,
          role: user.role,
          organizationId: user.organization_id,
          organizationName: user.org_name,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as SessionUser;
        token.id = u.id;
        token.role = u.role;
        token.organizationId = u.organizationId;
        token.organizationName = u.organizationName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.organizationId = token.organizationId;
        session.user.organizationName = token.organizationName;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
};
