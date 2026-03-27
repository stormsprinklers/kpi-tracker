import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function PerformancePayPage() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    redirect("/login");
  }
  if (session.user.role !== "admin") {
    redirect("/");
  }

  redirect("/settings/performance-pay");
}
