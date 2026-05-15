"use client";

import { useEffect, useRef, useState, useCallback, type ReactElement } from "react";
import { useAuth } from "@payloadcms/ui";
import { useRouter } from "next/navigation";

interface NotificationRow {
  id: number | string;
  kind: string;
  title: string;
  body?: string | null;
  url?: string | null;
  readAt?: string | null;
  createdAt: string;
}

const POLL_INTERVAL_MS = 60_000;

/**
 * Admin top-bar notifications bell.
 *
 * Polls `/api/notifications/unread-count` every 60s. Clicking the bell
 * fetches the 10 most recent notifications (unread first, then read).
 * Clicking a notification marks it read and navigates to its `url`.
 *
 * Lives next to `UserDisplayName` in the `admin.components.actions` slot.
 */
const NotificationsBell = (): ReactElement | null => {
  const { user } = useAuth();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Poll unread count on a 60s interval while a user is signed in.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetchCount = async (): Promise<void> => {
      try {
        const res = await fetch("/api/notifications/unread-count", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { count: number };
        if (!cancelled) setUnreadCount(data.count ?? 0);
      } catch {
        // Silent — bell stays at its last known count.
      }
    };

    fetchCount();
    const intervalId = window.setInterval(fetchCount, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [user]);

  // Load the dropdown contents on first open.
  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=10", {
        credentials: "include",
      });
      if (res.ok) {
        const data = (await res.json()) as { docs: NotificationRow[] };
        setItems(data.docs || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const onToggle = (): void => {
    const next = !open;
    setOpen(next);
    if (next) void loadList();
  };

  const onItemClick = async (item: NotificationRow): Promise<void> => {
    setOpen(false);
    if (!item.readAt) {
      try {
        await fetch(`/api/notifications/${item.id}/mark-read`, {
          method: "POST",
          credentials: "include",
        });
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // ignore — navigation still happens.
      }
    }
    if (item.url) router.push(item.url);
  };

  const onMarkAllRead = async (): Promise<void> => {
    try {
      await fetch("/api/notifications/mark-all-read", {
        method: "POST",
        credentials: "include",
      });
      setUnreadCount(0);
      setItems((prev) =>
        prev.map((p) => (p.readAt ? p : { ...p, readAt: new Date().toISOString() })),
      );
    } catch {
      // ignore
    }
  };

  if (!user) return null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
        style={{
          position: "relative",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "6px 8px",
          borderRadius: 6,
          color: "var(--theme-elevation-800)",
          display: "flex",
          alignItems: "center",
          transition: "background 150ms",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--theme-elevation-100)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "none";
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              background: "#dc2626",
              color: "#fff",
              borderRadius: 999,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              fontSize: 10,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            background: "var(--theme-elevation-0, #fff)",
            border: "1px solid var(--theme-elevation-150, #ddd)",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            minWidth: 340,
            maxWidth: 400,
            zIndex: 10000,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--theme-elevation-100, #eee)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--theme-elevation-800)",
            }}
          >
            <span>Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "#1a73e8",
                  padding: 0,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {loading && (
              <div style={{ padding: 16, fontSize: 13, color: "var(--theme-elevation-500)" }}>
                Loading…
              </div>
            )}
            {!loading && items.length === 0 && (
              <div style={{ padding: 16, fontSize: 13, color: "var(--theme-elevation-500)" }}>
                No notifications.
              </div>
            )}
            {!loading &&
              items.map((item) => {
                const unread = !item.readAt;
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => void onItemClick(item)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 14px",
                      background: unread ? "var(--theme-elevation-50, #f5f9ff)" : "none",
                      border: "none",
                      borderBottom: "1px solid var(--theme-elevation-100, #eee)",
                      cursor: "pointer",
                      transition: "background 150ms",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--theme-elevation-100, #eef)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = unread
                        ? "var(--theme-elevation-50, #f5f9ff)"
                        : "none";
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: unread ? 600 : 500,
                        color: "var(--theme-elevation-800)",
                        marginBottom: 2,
                      }}
                    >
                      {item.title}
                    </div>
                    {item.body && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--theme-elevation-500)",
                          lineHeight: 1.4,
                          marginBottom: 4,
                        }}
                      >
                        {item.body}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--theme-elevation-400)",
                      }}
                    >
                      {formatRelativeTime(item.createdAt)}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default NotificationsBell;
