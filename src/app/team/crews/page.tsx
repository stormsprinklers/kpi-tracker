import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CrewsManagementClient } from "./CrewsManagementClient";

export default async function TeamCrewsPage() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    redirect("/login");
  }
  if (session.user.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Crews</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Group users under a foreman. Named crews appear as combined totals on the home dashboard (Technician KPIs).
          </p>
        </div>
        <CrewsManagementClient />
      </main>
    </div>
  );
}
