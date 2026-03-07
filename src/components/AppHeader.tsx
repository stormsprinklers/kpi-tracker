"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  extra?: React.ReactNode;
}

export function AppHeader({ title = "KPI Tracker", subtitle = "Home services metrics and insights", extra }: AppHeaderProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/setup") return null;

  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {subtitle}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {extra}
        {session?.user && (
          <>
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {session.user.email}
            </span>
            <span
              className={`rounded px-2 py-0.5 text-xs ${
                session.user.role === "admin"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {session.user.role}
            </span>
            {session.user.role === "admin" && (
              <a
                href="/settings"
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Settings
              </a>
            )}
            {session.user.hcpEmployeeId && (
              <a
                href="/timesheets"
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Timesheets
              </a>
            )}
            <a
              href="/debug"
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Developer Console
            </a>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Log out
            </button>
          </>
        )}
      </div>
    </header>
  );
}
