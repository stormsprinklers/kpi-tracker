"use client";

import { useEffect } from "react";

/**
 * Triggers a background API sync when dashboard opens.
 * Server-side route throttles frequent calls.
 */
export function DashboardAutoSync({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    fetch("/api/sync", { method: "POST" }).catch(() => {
      // Intentionally silent: dashboard should render even if sync fails.
    });
  }, [enabled]);

  return null;
}

