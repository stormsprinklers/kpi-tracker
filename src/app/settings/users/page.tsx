import Link from "next/link";
import { UsersSettingsClient } from "./UsersSettingsClient";
import { UserPermissionsSection } from "@/components/UserPermissionsSection";

export default function UsersSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Users
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Manage users, roles, permissions, and CSR selection for reporting.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          User management
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Add or remove users, change roles.
        </p>
        <Link
          href="/team/users"
          className="mt-3 inline-block text-sm font-medium text-zinc-900 underline hover:no-underline dark:text-zinc-100"
        >
          Manage users →
        </Link>
      </section>

      <UserPermissionsSection />

      <UsersSettingsClient />
    </div>
  );
}
