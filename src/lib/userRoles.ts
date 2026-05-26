/** Display label for app login role (DB value unchanged). */
export function formatUserRoleLabel(role: string): string {
  if (role === "salesman") return "Salesperson";
  if (role === "admin") return "Admin";
  if (role === "employee") return "Employee";
  if (role === "investor") return "Investor";
  return role;
}
