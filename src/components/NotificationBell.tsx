"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

interface NotificationRow {
  id: string;
  type: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sec = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (sec < 60) return "Just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return d.toLocaleDateString();
}

function formatRange(r: { startDate: string; endDate: string; startTime?: string | null; endTime?: string | null }): string {
  const same = r.startDate === r.endDate;
  const st = r.startTime ? ` ${r.startTime}` : "";
  const et = r.endTime ? `-${r.endTime}` : "";
  if (same) return `${r.startDate}${st}${et}`;
  return `${r.startDate} → ${r.endDate}`;
}

export function NotificationBell() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isAdmin = session?.user?.role === "admin";
  const showBell =
    isAdmin || session?.user?.role === "employee" || session?.user?.role === "salesman";

  const fetchNotifications = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (session?.user?.id && showBell) {
      fetchNotifications();
      const t = setInterval(fetchNotifications, 60000);
      return () => clearInterval(t);
    }
  }, [session?.user?.id, showBell, fetchNotifications]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [open]);

  async function markRead(id: string) {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "POST" });
      setUnreadCount((c) => Math.max(0, c - 1));
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
    } catch {
      // ignore
    }
  }

  async function approveRequest(batchId: string, reason?: string) {
    try {
      const res = await fetch("/api/time-off/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, reason: reason || null }),
      });
      if (res.ok) {
        await fetchNotifications();
      }
    } catch {
      // ignore
    }
  }

  async function declineRequest(batchId: string, reason?: string) {
    try {
      const res = await fetch("/api/time-off/decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, reason: reason || null }),
      });
      if (res.ok) {
        await fetchNotifications();
      }
    } catch {
      // ignore
    }
  }

  if (!showBell) return null;

  const displayCount = Math.min(unreadCount, 10);
  const badgeLabel = unreadCount > 10 ? "10+" : String(displayCount);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <svg
          className="h-6 w-6"
          viewBox="0 0 512 512"
          fill="currentColor"
          preserveAspectRatio="xMidYMid meet"
        >
          <g transform="translate(0,512) scale(0.1,-0.1)">
            <path d="M2463 5105 c-118 -32 -205 -105 -257 -215 -29 -60 -31 -75 -36 -204 l-5 -138 -90 -27 c-545 -164 -925 -607 -1049 -1221 -37 -184 -46 -389 -46 -1095 l0 -630 -260 -260 -260 -260 0 -132 0 -133 2100 0 2100 0 0 133 0 132 -260 260 -260 260 0 630 c0 704 -9 906 -46 1093 -122 614 -503 1059 -1049 1223 l-90 27 -5 138 c-5 129 -7 144 -36 204 -34 72 -105 150 -165 180 -52 27 -144 50 -194 49 -22 0 -64 -7 -92 -14z" />
            <path d="M2040 482 c0 -109 59 -232 157 -329 204 -203 522 -203 726 0 98 97 157 220 157 329 l0 48 -520 0 -520 0 0 -48z" />
          </g>
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Notifications</h3>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <p className="p-4 text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
            ) : notifications.length === 0 ? (
              <p className="p-4 text-sm text-zinc-500 dark:text-zinc-400">No notifications</p>
            ) : (
              notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onMarkRead={() => markRead(n.id)}
                  onApprove={approveRequest}
                  onDecline={declineRequest}
                  onClose={() => setOpen(false)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  notification,
  onMarkRead,
  onApprove,
  onDecline,
  onClose,
}: {
  notification: NotificationRow;
  onMarkRead: () => void;
  onApprove: (batchId: string, reason?: string) => void;
  onDecline: (batchId: string, reason?: string) => void;
  onClose: () => void;
}) {
  const [showReason, setShowReason] = useState<"approve" | "decline" | null>(null);
  const [reason, setReason] = useState("");
  const data = notification.data as Record<string, unknown>;
  const batchId = data.batchId as string | undefined;
  const isRequest = notification.type === "time_off_request";
  const isResponse = notification.type === "time_off_response";

  if (isRequest && batchId) {
    const employeeName = (data.employeeName as string) ?? "An employee";
    const ranges = (data.ranges as Array<{ startDate: string; endDate: string; startTime?: string | null; endTime?: string | null }>) ?? [];
    return (
      <div
        className={`border-b border-zinc-100 px-4 py-3 dark:border-zinc-800 ${
          !notification.read_at ? "bg-sky-50/50 dark:bg-sky-950/20" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Time off request from {employeeName}
            </p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              {ranges.map((r, i) => formatRange(r)).join("; ")}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
              {formatTimeAgo(notification.created_at)}
            </p>
          </div>
          {!notification.read_at && (
            <button
              type="button"
              onClick={onMarkRead}
              className="text-xs text-zinc-500 hover:underline"
            >
              Mark read
            </button>
          )}
        </div>
        {showReason ? (
          <div className="mt-2 space-y-2">
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={showReason === "approve" ? "Optional reason" : "Reason (optional)"}
              className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (showReason === "approve") onApprove(batchId, reason.trim() || undefined);
                  else onDecline(batchId, reason.trim() || undefined);
                  setShowReason(null);
                  setReason("");
                  onClose();
                }}
                className={`rounded px-2 py-1 text-xs font-medium ${
                  showReason === "approve"
                    ? "bg-green-600 text-white hover:bg-green-700"
                    : "bg-red-600 text-white hover:bg-red-700"
                }`}
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowReason(null);
                  setReason("");
                }}
                className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setShowReason("approve")}
              className="rounded bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => setShowReason("decline")}
              className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
            >
              Decline
            </button>
          </div>
        )}
      </div>
    );
  }

  if (isResponse) {
    const status = data.status as string;
    const reason = (data.reason as string) ?? "";
    const ranges = (data.ranges as Array<{ startDate: string; endDate: string; startTime?: string | null; endTime?: string | null }>) ?? [];
    const approved = status === "approved";
    return (
      <div
        className={`border-b border-zinc-100 px-4 py-3 dark:border-zinc-800 ${
          !notification.read_at ? "bg-sky-50/50 dark:bg-sky-950/20" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-medium ${approved ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
              Your time off request was {approved ? "approved" : "declined"}
            </p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              {ranges.map((r, i) => formatRange(r)).join("; ")}
            </p>
            {reason && (
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 italic">&ldquo;{reason}&rdquo;</p>
            )}
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
              {formatTimeAgo(notification.created_at)}
            </p>
          </div>
          {!notification.read_at && (
            <button type="button" onClick={onMarkRead} className="text-xs text-zinc-500 hover:underline">
              Mark read
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`border-b border-zinc-100 px-4 py-3 dark:border-zinc-800 ${
        !notification.read_at ? "bg-sky-50/50 dark:bg-sky-950/20" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          {notification.type}: {JSON.stringify(data).slice(0, 80)}...
        </p>
        {!notification.read_at && (
          <button type="button" onClick={onMarkRead} className="text-xs text-zinc-500 hover:underline">
            Mark read
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-zinc-500">{formatTimeAgo(notification.created_at)}</p>
    </div>
  );
}
