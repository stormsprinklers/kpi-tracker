import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PerformancePayPageClient } from "./PerformancePayPageClient";

export default async function PerformancePayPage() {
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
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Performance Pay
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Configure pay structures for roles or individual employees. Uses biweekly pay periods.
        </p>

        <PerformancePayPageClient />
      </main>
    </div>
  );
}
