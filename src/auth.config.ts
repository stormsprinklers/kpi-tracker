import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import {
  getUserByEmail,
  getUserById,
  getOrganizationById,
  getUserPermissions,
} from "@/lib/db/queries";
import { initSchema } from "@/lib/db";

function sessionUserFromRow(user: {
  id: string;
  email: string;
  role: string;
  organization_id: string | null;
  org_name: string | null;
  org_logo_url: string | null;
  hcp_employee_id: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organization_id ?? "",
    organizationName: user.org_name ?? undefined,
    organizationLogoUrl: user.org_logo_url ?? null,
    hcpEmployeeId: user.hcp_employee_id ?? null,
  };
}

export default {
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        twoFactorPendingToken: { label: "2FA pending", type: "text" },
        twoFactorCode: { label: "2FA code", type: "text" },
      },
      async authorize(credentials) {
        const emailRaw = credentials?.email as string | undefined;
        const email = emailRaw?.trim();
        if (!email) return null;
        await initSchema();

        const pending = (credentials?.twoFactorPendingToken as string | undefined)?.trim();
        const code = (credentials?.twoFactorCode as string | undefined)?.trim();

        if (pending && code) {
          const { verifyTwoFactorPendingToken } = await import("@/lib/auth/twoFactorPendingToken");
          const payload = await verifyTwoFactorPendingToken(pending);
          if (!payload || payload.email.trim().toLowerCase() !== email.toLowerCase()) return null;
          const user = await getUserById(payload.userId);
          if (!user?.password_hash) return null;
          const { checkVerifyCode } = await import("@/lib/twilio/verify");
          const verified = await checkVerifyCode(payload.verifyTo, code);
          if (!verified.ok) return null;
          return sessionUserFromRow(user);
        }

        const password = credentials?.password as string | undefined;
        if (!password) return null;

        const user = await getUserByEmail(email);
        if (!user?.password_hash) return null;
        const valid = await compare(password, user.password_hash);
        if (!valid) return null;
        // Always require a second factor after password.
        return null;
      },
    }),
    Google({ allowDangerousEmailAccountLinking: true }),
    Apple({ allowDangerousEmailAccountLinking: true }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ account }) {
      if (account?.provider === "credentials") return true;
      // Allow OAuth sign-in and account linking (case-insensitive email match in adapter).
      return true;
    },
    async jwt({ token, user }) {
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
        const userId = session.user.id;
        if (userId) {
          try {
            session.user.permissions = await getUserPermissions(userId);
          } catch {
            session.user.permissions = undefined;
          }
        }
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
