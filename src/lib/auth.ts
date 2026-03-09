import { auth } from "@/auth";
import type { UserPermissions } from "@/lib/db/queries";

export interface SessionUser {
  id: string;
  email: string;
  role: string;
  organizationId: string;
  organizationName?: string;
  organizationLogoUrl?: string | null;
  hcpEmployeeId?: string | null;
  permissions?: UserPermissions;
}

declare module "next-auth" {
  interface Session {
    user: SessionUser;
  }
}

export { auth };
