import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { getUserByEmail, getOrganizationById } from "@/lib/db/queries";
import { initSchema } from "@/lib/db";

export default {
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        await initSchema();
        const user = await getUserByEmail(credentials.email as string);
        if (!user?.password_hash) return null;
        const valid = await compare(credentials.password as string, user.password_hash);
        if (!valid) return null;
        return {
          id: user.id,
          email: user.email,
          role: user.role,
          organizationId: user.organization_id ?? "",
          organizationName: user.org_name ?? undefined,
          organizationLogoUrl: user.org_logo_url ?? null,
          hcpEmployeeId: user.hcp_employee_id ?? null,
        };
      },
    }),
    Google,
    Apple,
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "credentials") return true;
      if (!user.email) return false;
      const existing = await getUserByEmail(user.email);
      if (existing?.organization_id) return true;
      return "/signup";
    },
    async jwt({ token, user, account }) {
      if (user) {
        const u = user as { id: string; role?: string; organization_id?: string; organizationId?: string; organizationName?: string; organizationLogoUrl?: string | null; hcp_employee_id?: string | null; hcpEmployeeId?: string | null };
        token.id = u.id;
        token.role = u.role ?? "employee";
        token.organizationId = u.organization_id ?? u.organizationId ?? "";
        token.organizationName = u.organizationName;
        token.organizationLogoUrl = u.organizationLogoUrl ?? null;
        token.hcpEmployeeId = u.hcp_employee_id ?? u.hcpEmployeeId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) ?? "employee";
        session.user.organizationId = (token.organizationId as string) ?? "";
        session.user.organizationName = token.organizationName as string | undefined;
        session.user.organizationLogoUrl = (token.organizationLogoUrl as string | null) ?? null;
        session.user.hcpEmployeeId = (token.hcpEmployeeId as string | null) ?? null;
        const orgId = session.user.organizationId;
        if (orgId) {
          const org = await getOrganizationById(orgId);
          if (org) {
            session.user.organizationName = org.name;
            session.user.organizationLogoUrl = org.logo_url ?? null;
          }
        }
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
