"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const TABS = [
  { href: "/settings/crm", label: "CRM" },
  { href: "/settings/performance-pay", label: "Performance Pay" },
  { href: "/settings/seo", label: "SEO" },
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/users", label: "Users" },
];

export function SettingsSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 shadow lg:hidden dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={`
          fixed left-0 top-0 z-40 h-full w-64 shrink-0 transform border-r border-zinc-200 bg-white transition-transform duration-200 lg:static lg:z-0 lg:translate-x-0 lg:border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950
          ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <nav className="flex flex-col gap-0.5 p-4 pt-16 lg:pt-4">
          {TABS.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={() => setOpen(false)}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-50"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
