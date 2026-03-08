import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { UsersManagementSection } from "@/components/UsersManagementSection";

export default async function TeamUsersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    redirect("/login");
  }
  if (session.user.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 flex-col gap-6 p-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← Back to Dashboard
        </Link>

        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Users</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Change user info, add or remove users.
        </p>

        <UsersManagementSection currentUserId={session.user.id} />
      </main>
    </div>
  );
}
