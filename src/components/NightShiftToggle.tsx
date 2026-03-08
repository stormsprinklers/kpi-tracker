"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "nightShiftMode";

function getStored(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function NightShiftToggle() {
  const [enabled, setEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setEnabled(getStored());
    setMounted(true);
  }, []);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem(STORAGE_KEY, String(next));
    if (next) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }

  if (!mounted) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Appearance
        </h2>
        <div className="mt-3 h-10 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        Appearance
      </h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Night Shift uses dark colors for comfortable viewing at night.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={toggle}
          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 dark:focus:ring-zinc-500 dark:focus:ring-offset-zinc-900 ${
            enabled ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-200 dark:bg-zinc-700"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition ${
              enabled ? "translate-x-5" : "translate-x-1"
            }`}
          />
        </button>
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {enabled ? "Night Shift on" : "Night Shift off"}
        </span>
      </div>
    </section>
  );
}
