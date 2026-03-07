"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  extra?: React.ReactNode;
}

export function AppHeader({ title = "Home Services Analytics", subtitle = "Analytics and insights for home services", extra }: AppHeaderProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/setup") return null;

  const isLanding = pathname === "/" && !session?.user;

  if (isLanding) {
    return (
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4 md:px-8" style={{ borderColor: "rgba(11,31,51,0.12)", backgroundColor: "#F8FAFC" }}>
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Home Services Analytics" className="h-10 w-10 object-contain" />
          <a href="/" className="block hover:opacity-80 transition-opacity">
            <h1 className="text-xl font-semibold" style={{ color: "#0B1F33" }}>{title}</h1>
          </a>
        </div>
        <nav className="flex flex-wrap items-center gap-4 md:gap-6">
          <a href="#features" className="text-sm font-medium opacity-80 hover:opacity-100" style={{ color: "#0B1F33" }}>Features</a>
          <a href="#integrations" className="text-sm font-medium opacity-80 hover:opacity-100" style={{ color: "#0B1F33" }}>Integrations</a>
          <a href="#faq" className="text-sm font-medium opacity-80 hover:opacity-100" style={{ color: "#0B1F33" }}>FAQ</a>
          <a href="mailto:contact@example.com" className="text-sm font-medium opacity-80 hover:opacity-100" style={{ color: "#0B1F33" }}>Contact</a>
          <a href="/login" className="text-sm font-medium opacity-80 hover:opacity-100" style={{ color: "#0B1F33" }}>Log in</a>
          <a href="#" className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90" style={{ backgroundColor: "#0B1F33" }}>Book a demo</a>
          <a href="#" className="rounded-lg border-2 px-4 py-2 text-sm font-semibold transition hover:bg-[rgba(11,31,51,0.04)]" style={{ borderColor: "#0B1F33", color: "#0B1F33" }}>Join the waitlist</a>
        </nav>
      </header>
    );
  }

  return (
    <header className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "#0B1F33", backgroundColor: "#F8FAFC" }}>
      <div className="flex items-center gap-3">
        <img src="/logo.png" alt="Home Services Analytics" className="h-10 w-10 object-contain" />
        <a
          href="/"
          className="block hover:opacity-80 transition-opacity"
        >
          <h1 className="text-xl font-semibold" style={{ color: "#0B1F33" }}>
            {title}
          </h1>
          <p className="mt-1 text-sm opacity-80" style={{ color: "#0B1F33" }}>
            {subtitle}
          </p>
        </a>
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
                  : session.user.role === "investor"
                    ? "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400"
                    : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {session.user.role}
            </span>
            <a
              href="/"
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Dashboard
            </a>
            {session.user.role === "admin" && (
              <a
                href="/settings"
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Settings
              </a>
            )}
            {(session.user.role === "admin" || session.user.hcpEmployeeId) && (
              <a
                href="/timesheets"
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Timesheets
              </a>
            )}
            {(session.user.role === "admin" || session.user.role === "investor" || session.user.hcpEmployeeId) && (
              <a
                href="/time-insights"
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Time Insights
              </a>
            )}
            {session.user.role !== "investor" && (
              <a
                href="/debug"
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Developer Console
              </a>
            )}
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
