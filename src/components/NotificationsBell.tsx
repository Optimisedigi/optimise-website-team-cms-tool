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
const SHAKE_DURATION_MS = 1400;

// Inject the shake + glow keyframes once. Payload's admin shell has no
// global stylesheet hook from a client component, so we drop a <style>
// tag on first mount and keep it for the life of the page.
function useBellAnimations(): void {
  useEffect(() => {
    const id = "notifications-bell-keyframes";
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = `
      @keyframes notif-bell-shake {
        0%, 100% { transform: rotate(0deg); }
        10% { transform: rotate(-14deg); }
        20% { transform: rotate(12deg); }
        30% { transform: rotate(-10deg); }
        40% { transform: rotate(8deg); }
        50% { transform: rotate(-6deg); }
        60% { transform: rotate(4deg); }
        70% { transform: rotate(-2deg); }
      }
      @keyframes notif-bell-glow {
        0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.0); }
        50% { box-shadow: 0 0 0 8px rgba(220, 38, 38, 0.18); }
      }
      @keyframes notif-badge-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.25); }
      }
    `;
    document.head.appendChild(el);
  }, []);
}

/**
 * Admin top-bar notifications bell.
 *
 * Polls `/api/notifications/unread-count` every 60s. Clicking the bell
 * fetches the 20 most recent notifications (newest first, read rows included).
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
  const [shaking, setShaking] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Track last seen count so we can detect *rises* (not just non-zero).
  // `null` on first fetch means "don't shake on initial page load".
  const lastCountRef = useRef<number | null>(null);
  // Auto-open the dropdown the first time new notifications arrive in a
  // tab session. After that, the badge + animation is enough — we don't
  // want to keep popping the dropdown over the user's work.
  const autoOpenedRef = useRef(false);

  useBellAnimations();

  // Load the dropdown contents. Declared before the polling effect so the
  // auto-open path can call it.
  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=20", {
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
        if (cancelled) return;
        const next = data.count ?? 0;
        const prev = lastCountRef.current;
        setUnreadCount(next);

        // Rising-edge detection: only react when the count goes UP. Marking
        // a notification read drops the count — we don't want to shake on
        // that.
        if (prev !== null && next > prev) {
          setShaking(true);
          window.setTimeout(() => setShaking(false), SHAKE_DURATION_MS);
          if (!autoOpenedRef.current) {
            autoOpenedRef.current = true;
            setOpen(true);
            void loadList();
          }
        }
        lastCountRef.current = next;
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
  }, [user, loadList]);

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
          background: unreadCount > 0 ? "rgba(220, 38, 38, 0.08)" : "none",
          border: "none",
          cursor: "pointer",
          padding: "6px 8px",
          borderRadius: 6,
          // Brighten the bell colour when there's anything unread —
          // muted grey -> red. Goes back to neutral once everything's read.
          color: unreadCount > 0 ? "#dc2626" : "var(--theme-elevation-800)",
          display: "flex",
          alignItems: "center",
          transition: "background 150ms, color 150ms",
          animation: shaking
            ? `notif-bell-glow ${SHAKE_DURATION_MS}ms ease-in-out`
            : undefined,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background =
            unreadCount > 0 ? "rgba(220, 38, 38, 0.16)" : "var(--theme-elevation-100)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background =
            unreadCount > 0 ? "rgba(220, 38, 38, 0.08)" : "none";
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill={unreadCount > 0 ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transformOrigin: "top center",
            animation: shaking
              ? `notif-bell-shake ${SHAKE_DURATION_MS}ms ease-in-out`
              : undefined,
          }}
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              background: "#dc2626",
              color: "#fff",
              borderRadius: 999,
              minWidth: 18,
              height: 18,
              padding: "0 5px",
              fontSize: 11,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
              boxShadow: "0 0 0 2px var(--theme-elevation-0, #fff)",
              animation: shaking
                ? `notif-badge-pulse 700ms ease-in-out 2`
                : undefined,
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
                // Unread rows: white bg, blue left bar, blue title, blue dot.
                // Read rows:   subtle grey bg, muted text, no bar, no dot.
                const unreadBg = "var(--theme-elevation-0, #fff)";
                const readBg = "var(--theme-elevation-50, #f4f5f7)";
                const baseBg = unread ? unreadBg : readBg;
                const hoverBg = "var(--theme-elevation-100, #e8eaf0)";
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => void onItemClick(item)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 14px 10px 14px",
                      paddingLeft: unread ? 11 : 14,
                      background: baseBg,
                      borderLeft: unread ? "3px solid #1a73e8" : "3px solid transparent",
                      borderTop: "none",
                      borderRight: "none",
                      borderBottom: "1px solid var(--theme-elevation-100, #eee)",
                      cursor: "pointer",
                      transition: "background 150ms",
                      opacity: unread ? 1 : 0.78,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = hoverBg;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = baseBg;
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 2,
                      }}
                    >
                      {unread && (
                        <span
                          aria-label="Unread"
                          style={{
                            display: "inline-block",
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            background: "#1a73e8",
                            flex: "0 0 8px",
                          }}
                        />
                      )}
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: unread ? 700 : 400,
                          color: unread
                            ? "var(--theme-elevation-900, #111)"
                            : "var(--theme-elevation-600, #666)",
                          flex: 1,
                        }}
                      >
                        {item.title}
                      </div>
                    </div>
                    {item.body && (
                      <div
                        style={{
                          fontSize: 12,
                          color: unread
                            ? "var(--theme-elevation-700, #444)"
                            : "var(--theme-elevation-500, #888)",
                          lineHeight: 1.4,
                          marginBottom: 4,
                          paddingLeft: unread ? 16 : 0,
                        }}
                      >
                        {item.body}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: 11,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        color: "var(--theme-elevation-400, #999)",
                        paddingLeft: unread ? 16 : 0,
                      }}
                    >
                      <span>{formatRelativeTime(item.createdAt)}</span>
                      {!unread && (
                        <span style={{ color: "var(--theme-elevation-400, #999)" }}>
                          · Read
                        </span>
                      )}
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
