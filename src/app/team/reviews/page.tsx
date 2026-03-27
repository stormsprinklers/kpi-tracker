import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TeamReviewsSection } from "@/components/team/TeamReviewsSection";

export default async function TeamReviewsPage() {
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
          Reviews
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Sync Google reviews and assign them to employees for KPI tracking.
        </p>
        <TeamReviewsSection />
      </main>
    </div>
  );
}
