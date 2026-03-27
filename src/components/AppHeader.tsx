"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NavDropdown } from "./NavDropdown";
import { HeaderNightShiftToggle } from "./HeaderNightShiftToggle";
import { NotificationBell } from "./NotificationBell";

interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  extra?: React.ReactNode;
}

const navLinkClass =
  "rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800";

export function AppHeader({ title = "Home Services Analytics", subtitle = "Analytics and insights for home services", extra }: AppHeaderProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [logoUrl, setLogoUrl] = useState<string | null>(session?.user?.organizationLogoUrl ?? null);
  const [employeeProfile, setEmployeeProfile] = useState<{ displayName: string | null; photoUrl: string | null } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<"insights" | "team" | "company" | null>(null);

  function fetchLogo() {
    if (!session?.user?.organizationId) return;
    fetch("/api/organizations/logo")
      .then((r) => r.json())
      .then((d: { logoUrl?: string | null }) => setLogoUrl(d.logoUrl ?? null))
      .catch(() => {});
  }

  useEffect(() => {
    if (session?.user?.organizationLogoUrl) {
      setLogoUrl(session.user.organizationLogoUrl);
    } else if (session?.user?.organizationId) {
      fetchLogo();
    }
  }, [session?.user?.organizationId, session?.user?.organizationLogoUrl]);

  useEffect(() => {
    if (session?.user?.role === "employee" && session?.user?.hcpEmployeeId) {
      fetch("/api/me")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { displayName?: string | null; photoUrl?: string | null } | null) => {
          if (d) setEmployeeProfile({ displayName: d.displayName ?? null, photoUrl: d.photoUrl ?? null });
        })
        .catch(() => setEmployeeProfile(null));
    } else {
      setEmployeeProfile(null);
    }
  }, [session?.user?.role, session?.user?.hcpEmployeeId]);

  useEffect(() => {
    function onLogoUpdated(e: CustomEvent<{ logoUrl?: string | null }>) {
      setLogoUrl(e.detail?.logoUrl ?? null);
    }
    window.addEventListener("logoUpdated", onLogoUpdated as EventListener);
    return () => window.removeEventListener("logoUpdated", onLogoUpdated as EventListener);
  }, []);

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
          <a href="#pricing" className="text-sm font-medium opacity-80 hover:opacity-100" style={{ color: "#0B1F33" }}>Pricing</a>
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

  const p = session?.user?.permissions;
  const usePermissions = !!p;

  const can = (key: keyof NonNullable<typeof p>) => {
    if (usePermissions && p) return p[key] === true;
    const isAdmin = session?.user?.role === "admin";
    const isInvestor = session?.user?.role === "investor";
    const hasHcpEmployeeId = !!session?.user?.hcpEmployeeId;
    if (isAdmin) {
      if (key === "settings" || key === "can_edit") return true;
      return true;
    }
    if (isInvestor) {
      if (key === "settings") return false;
      if (key === "can_edit") return false;
      return true;
    }
    if (key === "timesheets") return hasHcpEmployeeId;
    if (key === "performance_pay" || key === "users" || key === "settings" || key === "billing") return false;
    if (key === "call_insights") return true;
    if (key === "time_insights" || key === "profit" || key === "marketing") return true;
    if (key === "developer_console") return true;
    if (key === "dashboard") return true;
    return false;
  };

  const isEmployee = session?.user?.role === "employee";

  const insightsItems = isEmployee
    ? []
    : [
        ...(can("call_insights") ? [{ label: "Calls", href: "/call-insights" }] : []),
        ...(can("time_insights") ? [{ label: "Time", href: "/time-insights" }] : []),
        ...(can("profit") ? [{ label: "Profit", href: "/insights/profit" }] : []),
        ...(can("marketing") ? [{ label: "Marketing", href: "/insights/marketing" }] : []),
      ];

  const teamItems: { label: string; href: string }[] = [];
  if (can("timesheets")) teamItems.push({ label: "Timesheets", href: "/timesheets" });
  if (!isEmployee) {
    if (can("performance_pay")) teamItems.push({ label: "Reviews", href: "/team/reviews" });
    if (can("users")) teamItems.push({ label: "Users", href: "/team/users" });
  }

  const companyItems: { label: string; href?: string; onClick?: () => void }[] = [];
  if (!isEmployee) {
    if (can("settings")) companyItems.push({ label: "Settings", href: "/settings" });
    if (can("billing")) companyItems.push({ label: "Billing", href: "/billing" });
    if (can("developer_console")) companyItems.push({ label: "Developer Console", href: "/debug" });
  }
  companyItems.push({ label: "Log Out", onClick: () => signOut({ callbackUrl: "/login" }) });

  const isAdmin = session?.user?.role === "admin";
  const isInvestor = session?.user?.role === "investor";
  const companyName = session?.user?.organizationName ?? "Company";

  const toggleMobileSection = (section: "insights" | "team" | "company") => {
    setMobileExpanded((prev) => (prev === section ? null : section));
  };

  const closeMobile = () => {
    setMobileOpen(false);
    setMobileExpanded(null);
  };

  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-6 py-4 dark:border-zinc-800 dark:bg-black">
      <div className="flex items-center gap-3">
        <img src="/logo.png" alt="Home Services Analytics" className="h-10 w-10 object-contain" />
        <a href="/" className="block hover:opacity-80 transition-opacity">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{title}</h1>
          <p className="mt-1 hidden text-sm opacity-80 text-zinc-600 dark:text-zinc-400 sm:block">{subtitle}</p>
        </a>
      </div>

      {/* Desktop nav - hidden on mobile */}
      <div className="hidden md:flex md:flex-wrap md:items-center md:gap-2">
        {extra}
        {session?.user && (
          <>
            <NotificationBell />
            <HeaderNightShiftToggle />
            <a href="/" className={navLinkClass}>Dashboard</a>
            {isEmployee ? (
              <a href="/timesheets" className={navLinkClass}>Timesheets</a>
            ) : (
              <>
                {insightsItems.length > 0 && (
                  <NavDropdown label="Insights" items={insightsItems} navLinkClass={navLinkClass} />
                )}
                {teamItems.length > 0 && (
                  <NavDropdown label="Team" items={teamItems} navLinkClass={navLinkClass} />
                )}
              </>
            )}
            <NavDropdown
              label={
                <span className="flex items-center gap-2">
                  {isEmployee && employeeProfile ? (
                    <>
                      {employeeProfile.photoUrl ? (
                        <img src={employeeProfile.photoUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-300 text-xs font-medium text-zinc-600 dark:bg-zinc-600 dark:text-zinc-300">
                          {(employeeProfile.displayName ?? "?").slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      {employeeProfile.displayName ?? session?.user?.email ?? "Account"}
                    </>
                  ) : (
                    <>
                      {logoUrl ? (
                        <img src={logoUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-300 text-xs font-medium text-zinc-600 dark:bg-zinc-600 dark:text-zinc-300">
                          {companyName.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      {companyName}
                    </>
                  )}
                </span>
              }
              items={companyItems}
              navLinkClass={navLinkClass}
            />
            <span
              className={`rounded px-2 py-0.5 text-xs ${
                isAdmin ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" :
                isInvestor ? "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400" :
                "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {session.user.role}
            </span>
          </>
        )}
      </div>

      {/* Mobile hamburger and menu */}
      {session?.user && (
        <div className="flex items-center gap-1 md:hidden">
          <HeaderNightShiftToggle />
          <span
            className={`rounded px-2 py-0.5 text-xs ${
              isAdmin ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" :
              isInvestor ? "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400" :
              "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {session.user.role}
          </span>
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="rounded p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            aria-label="Open menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      )}

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            aria-hidden
            onClick={closeMobile}
          />
          <div
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-zinc-200 bg-zinc-50 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 md:hidden"
            role="dialog"
            aria-label="Navigation menu"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
              <span className="font-medium text-zinc-900 dark:text-zinc-50">Menu</span>
              <button
                type="button"
                onClick={closeMobile}
                className="rounded p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                aria-label="Close menu"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex flex-1 flex-col overflow-y-auto p-4">
              <a
                href="/"
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                onClick={closeMobile}
              >
                Dashboard
              </a>
              {isEmployee && (
                <a
                  href="/timesheets"
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  onClick={closeMobile}
                >
                  Timesheets
                </a>
              )}

              {/* Insights section - not for employees */}
              {!isEmployee && (
              <div className="mt-1">
                <button
                  type="button"
                  onClick={() => toggleMobileSection("insights")}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Insights
                  <svg
                    className={`h-4 w-4 transition-transform ${mobileExpanded === "insights" ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {mobileExpanded === "insights" && (
                  <div className="ml-3 mt-1 space-y-0.5 border-l-2 border-zinc-200 pl-3 dark:border-zinc-700">
                    {insightsItems.map((item) => (
                      <a
                        key={item.href ?? item.label}
                        href={item.href ?? "#"}
                        className="block rounded px-2 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        onClick={closeMobile}
                      >
                        {item.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
              )}

              {/* Team section */}
              {teamItems.length > 0 && (
                <div className="mt-1">
                  <button
                    type="button"
                    onClick={() => toggleMobileSection("team")}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Team
                    <svg
                      className={`h-4 w-4 transition-transform ${mobileExpanded === "team" ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {mobileExpanded === "team" && (
                    <div className="ml-3 mt-1 space-y-0.5 border-l-2 border-zinc-200 pl-3 dark:border-zinc-700">
                      {teamItems.map((item) => (
                        <a
                          key={item.href ?? item.label}
                          href={item.href ?? "#"}
                          className="block rounded px-2 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                          onClick={closeMobile}
                        >
                          {item.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Company / Account section */}
              <div className="mt-1">
                <button
                  type="button"
                  onClick={() => toggleMobileSection("company")}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <span className="flex items-center gap-2">
                    {isEmployee && employeeProfile ? (
                      <>
                        {employeeProfile.photoUrl ? (
                          <img src={employeeProfile.photoUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-300 text-xs font-medium text-zinc-600 dark:bg-zinc-600 dark:text-zinc-300">
                            {(employeeProfile.displayName ?? "?").slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        {employeeProfile.displayName ?? session?.user?.email ?? "Account"}
                      </>
                    ) : (
                      <>
                        {logoUrl ? (
                          <img src={logoUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-300 text-xs font-medium text-zinc-600 dark:bg-zinc-600 dark:text-zinc-300">
                            {companyName.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        {companyName}
                      </>
                    )}
                  </span>
                  <svg
                    className={`h-4 w-4 shrink-0 transition-transform ${mobileExpanded === "company" ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {mobileExpanded === "company" && (
                  <div className="ml-3 mt-1 space-y-0.5 border-l-2 border-zinc-200 pl-3 dark:border-zinc-700">
                    {companyItems.map((item) =>
                      item.onClick ? (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => {
                            item.onClick?.();
                            closeMobile();
                          }}
                          className="block w-full rounded px-2 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        >
                          {item.label}
                        </button>
                      ) : (
                        <a
                          key={item.href ?? item.label}
                          href={item.href ?? "#"}
                          className="block rounded px-2 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                          onClick={closeMobile}
                        >
                          {item.label}
                        </a>
                      )
                    )}
                  </div>
                )}
              </div>
            </nav>
          </div>
        </>
      )}
    </header>
  );
}
