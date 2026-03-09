"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "nightShiftMode";

function getStored(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function HeaderNightShiftToggle() {
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

  if (!mounted) return null;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? "Night shift on" : "Night shift off"}
      onClick={toggle}
      className="rounded p-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="h-5 w-5"
      >
        <path
          d="M19.9 14.05A8.25 8.25 0 0 1 9.95 4.1a.75.75 0 0 0-.95-.95A9.25 9.25 0 1 0 20.85 15a.75.75 0 0 0-.95-.95Z"
          fill="currentColor"
        />
        <path
          d="M17.5 4.25l.32.93a.5.5 0 0 0 .31.31l.93.32-.93.32a.5.5 0 0 0-.31.31l-.32.93-.32-.93a.5.5 0 0 0-.31-.31l-.93-.32.93-.32a.5.5 0 0 0 .31-.31l.32-.93Z"
          fill="currentColor"
          opacity=".9"
        />
        <path
          d="M14.5 2.5l.2.57a.5.5 0 0 0 .31.31l.57.2-.57.2a.5.5 0 0 0-.31.31l-.2.57-.2-.57a.5.5 0 0 0-.31-.31l-.57-.2.57-.2a.5.5 0 0 0 .31-.31l.2-.57Z"
          fill="currentColor"
          opacity=".7"
        />
      </svg>
    </button>
  );
}
