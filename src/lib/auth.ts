import { auth } from "@/auth";

export interface SessionUser {
  id: string;
  email: string;
  role: string;
  organizationId: string;
  organizationName?: string;
  organizationLogoUrl?: string | null;
  hcpEmployeeId?: string | null;
}

declare module "next-auth" {
  interface Session {
    user: SessionUser;
  }
}

export { auth };
