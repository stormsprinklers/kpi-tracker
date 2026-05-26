export const APP_USER_ROLES = ["admin", "employee", "salesman", "investor"] as const;
export type AppUserRole = (typeof APP_USER_ROLES)[number];

export function isAppUserRole(role: string): role is AppUserRole {
  return (APP_USER_ROLES as readonly string[]).includes(role);
}

/** Display label for app login role (DB value unchanged). */
export function formatUserRoleLabel(role: string): string {
  if (role === "salesman") return "Salesperson";
  if (role === "admin") return "Admin";
  if (role === "employee") return "Employee";
  if (role === "investor") return "Investor";
  return role;
}
