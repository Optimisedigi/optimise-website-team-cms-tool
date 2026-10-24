"use client";

import { useEffect, useRef, useState, useCallback, type ReactElement } from "react";
import type React from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@payloadcms/ui";
import RocketSplash from "./RocketSplash";
import ClientEmailAlert from "./ClientEmailAlert";
import { openCmsMailLink } from "@/lib/mail/drafts";
import { notificationCategory } from "@/lib/notification-categories";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/notifications-events";
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
/** Rows fetched per page; more load as the list scrolls to the bottom. */
const PAGE_SIZE = 20;
/** Start loading the next page this many pixels before the bottom. */
const LOAD_MORE_THRESHOLD_PX = 160;

type NotificationFilter = "all" | "unread";

interface NotificationPage {
  docs?: NotificationRow[];
  hasNextPage?: boolean;
  error?: string;
}
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
 * fetches the newest notifications (read rows included, or unread only with
 * the Unread filter), 20 at a time; scrolling to the bottom loads the next 20.
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
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Track viewport so the dropdown can switch from an anchored popover (desktop)
  // to a fixed, viewport-clamped sheet (mobile) — otherwise it runs off-screen
  // because the bell sits at the far right of the header.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = (): void => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  // Track last seen count so we can detect *rises* (not just non-zero).
  // `null` on first fetch means "don't shake on initial page load".
  const lastCountRef = useRef<number | null>(null);
  // Auto-open the dropdown the first time new notifications arrive in a
  // tab session. After that, the badge + animation is enough — we don't
  // want to keep popping the dropdown over the user's work.
  const autoOpenedRef = useRef(false);

  useBellAnimations();

  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  // Refs mirror the paging state so scroll handlers never act on stale values,
  // and a request counter drops responses from a list that has since reset.
  const filterRef = useRef<NotificationFilter>("all");
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const requestRef = useRef(0);
  // Latest rows, for the next-page cursor (state can be a render behind).
  const itemsRef = useRef<NotificationRow[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  // `after` is the last row already shown; the API returns the rows after it.
  const fetchPage = useCallback(async (which: NotificationFilter, after?: NotificationRow): Promise<NotificationPage & { ok: boolean; status: number }> => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (which === "unread") params.set("unreadOnly", "true");
    if (after) {
      params.set("beforeCreatedAt", after.createdAt);
      params.set("beforeId", String(after.id));
    }
    const res = await fetch(`/api/notifications?${params.toString()}`, { credentials: "include" });
    const data = (await res.json().catch(() => null)) as NotificationPage | null;
    return { ...(data ?? {}), ok: res.ok, status: res.status };
  }, []);

  // Load the first page of the dropdown. Declared before the polling effect so
  // the auto-open path can call it. Defaults to the current filter.
  const loadList = useCallback(async (which: NotificationFilter = filterRef.current) => {
    const request = ++requestRef.current;
    filterRef.current = which;
    hasMoreRef.current = false;
    loadingMoreRef.current = false;
    setHasMore(false);
    setLoadingMore(false);
    setLoadMoreError(null);
    setLoading(true);
    try {
      const data = await fetchPage(which);
      if (request !== requestRef.current) return;
      if (!data.ok) {
        setError(data.error || `Failed to load notifications (${data.status})`);
        itemsRef.current = [];
        setItems([]);
        return;
      }
      setError(null);
      itemsRef.current = data.docs || [];
      setItems(itemsRef.current);
      hasMoreRef.current = Boolean(data.hasNextPage);
      setHasMore(hasMoreRef.current);
    } catch (err) {
      if (request !== requestRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load notifications");
      itemsRef.current = [];
      setItems([]);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [fetchPage]);

  // Append the rows after the last one shown (keyset paging, so reading or
  // receiving notifications meanwhile never skips or repeats a row).
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    const last = itemsRef.current[itemsRef.current.length - 1];
    if (!last) return;
    const request = requestRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const data = await fetchPage(filterRef.current, last);
      if (request !== requestRef.current) return;
      if (!data.ok) {
        setLoadMoreError(data.error || `Couldn't load more (${data.status})`);
        return;
      }
      const docs = data.docs || [];
      const seen = new Set(itemsRef.current.map((row) => String(row.id)));
      itemsRef.current = [...itemsRef.current, ...docs.filter((row) => !seen.has(String(row.id)))];
      setItems(itemsRef.current);
      hasMoreRef.current = Boolean(data.hasNextPage);
      setHasMore(hasMoreRef.current);
    } catch (err) {
      if (request !== requestRef.current) return;
      setLoadMoreError(err instanceof Error ? err.message : "Couldn't load more");
    } finally {
      if (request === requestRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [fetchPage]);

  const onListScroll = (): void => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - LOAD_MORE_THRESHOLD_PX) void loadMore();
  };

  // A first page that doesn't fill the panel can't be scrolled, so keep
  // loading until it does (or there's nothing left).
  useEffect(() => {
    if (!open || loading || loadingMore || !hasMore || loadMoreError) return;
    const el = listRef.current;
    if (el && el.scrollHeight <= el.clientHeight + LOAD_MORE_THRESHOLD_PX) void loadMore();
  }, [open, loading, loadingMore, hasMore, loadMoreError, items, loadMore]);

  const onFilterChange = (next: NotificationFilter): void => {
    if (next === filterRef.current && !error) return;
    setFilter(next);
    listRef.current?.scrollTo?.({ top: 0 });
    void loadList(next);
  };

  // Bumped when a client email drops down, so the count refreshes straight away.
  const [countNonce, setCountNonce] = useState(0);
  const onClientEmailArrive = useCallback(() => {
    // The drop-down is the heads-up; don't also pop the list open over it.
    autoOpenedRef.current = true;
    setShaking(true);
    window.setTimeout(() => setShaking(false), SHAKE_DURATION_MS);
    setCountNonce((n) => n + 1);
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
    // Only poll while the tab is visible; coming back to it checks straight away.
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchCount();
    }, POLL_INTERVAL_MS);
    const onVisible = (): void => {
      if (document.visibilityState === "visible") void fetchCount();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, loadList, countNonce]);

  // Something else changed notifications (e.g. Mail marked emails read, which
  // removes their client-email alerts): refresh the badge, and the list if open.
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (!user) return;
    const onChanged = (): void => {
      setCountNonce((n) => n + 1);
      if (openRef.current) void loadList();
    };
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
  }, [user, loadList]);

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Phone bottom sheet: drag the handle (or header) down to dismiss.
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);
  const onDragStart = (e: React.TouchEvent): void => {
    dragStart.current = e.touches[0]?.clientY ?? null;
  };
  const onDragMove = (e: React.TouchEvent): void => {
    if (dragStart.current === null) return;
    setDragY(Math.max(0, (e.touches[0]?.clientY ?? dragStart.current) - dragStart.current));
  };
  const onDragEnd = (): void => {
    if (dragY > 80) setOpen(false);
    dragStart.current = null;
    setDragY(0);
  };

  const onToggle = (): void => {
    const next = !open;
    setOpen(next);
    if (next) void loadList();
  };

  const markItemRead = async (item: NotificationRow): Promise<void> => {
    if (item.readAt) return;
    const readAt = new Date().toISOString();
    setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, readAt } : p)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await fetch(`/api/notifications/${item.id}/mark-read`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Roll back on failure so the badge does not lie.
      setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, readAt: null } : p)));
      setUnreadCount((c) => c + 1);
    }
  };

  const onItemClick = async (item: NotificationRow): Promise<void> => {
    setOpen(false);
    if (!item.url) {
      await markItemRead(item);
      return;
    }
    // A Mail link while Mail is open is handled in place (no navigation, so no splash).
    const handled = openCmsMailLink(item.url, () => setIsNavigating(true));
    await markItemRead(item);
    if (!handled) router.push(item.url);
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

  // All / Unread switch. Sits beside "Mark all read" on desktop; phones give it
  // its own row so the header still fits next to the close button.
  const filterToggle = (
    <span
      role="group"
      aria-label="Show"
      style={{
        display: "inline-flex",
        border: "1px solid var(--theme-elevation-150, #ddd)",
        borderRadius: 999,
        overflow: "hidden",
      }}
    >
      {(["all", "unread"] as const).map((value) => {
        const active = filter === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => onFilterChange(value)}
            style={{
              border: "none",
              cursor: "pointer",
              fontSize: isMobile ? 14 : 12,
              fontWeight: 600,
              padding: isMobile ? "0 12px" : "3px 10px",
              minHeight: isMobile ? 36 : undefined,
              whiteSpace: "nowrap",
              background: active ? "#1a73e8" : "transparent",
              color: active ? "#fff" : "var(--theme-elevation-700, #444)",
            }}
          >
            {value === "all" ? "All" : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
          </button>
        );
      })}
    </span>
  );

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
          // Phones: a full 44px tap target.
          ...(isMobile ? { width: 44, height: 44, justifyContent: "center", padding: 0, borderRadius: 10 } : {}),
          borderRadius: isMobile ? 10 : 6,
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
              // Phones: sit on the corner so the bell icon stays visible.
              top: isMobile ? 4 : 0,
              right: isMobile ? 2 : 0,
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
            {unreadCount}
          </span>
        )}
      </button>

      <ClientEmailAlert suppressed={open} onArrive={onClientEmailArrive} />
      {open && isMobile && (
        <div
          aria-hidden="true"
          data-testid="notifications-scrim"
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.4)", zIndex: 9999 }}
        />
      )}
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          data-sheet={isMobile ? "bottom" : undefined}
          style={{
            // Desktop: anchored popover beneath the bell. Phones: a bottom
            // sheet with a drag handle, dismissed by dragging down, tapping
            // the dimmed page, the close button or Escape.
            position: isMobile ? "fixed" : "absolute",
            top: isMobile ? "auto" : "calc(100% + 4px)",
            bottom: isMobile ? 0 : "auto",
            right: 0,
            left: isMobile ? 0 : "auto",
            background: "var(--theme-elevation-0, #fff)",
            border: "1px solid var(--theme-elevation-150, #ddd)",
            borderRadius: isMobile ? "16px 16px 0 0" : 8,
            boxShadow: isMobile ? "0 -8px 30px rgba(0,0,0,0.18)" : "0 4px 16px rgba(0,0,0,0.12)",
            width: isMobile ? "auto" : "min(520px, calc(100vw - 24px))",
            minWidth: 0,
            maxWidth: isMobile ? "none" : "calc(100vw - 24px)",
            height: isMobile ? "min(85dvh, 640px)" : undefined,
            display: isMobile ? "flex" : undefined,
            flexDirection: isMobile ? "column" : undefined,
            paddingBottom: isMobile ? "env(safe-area-inset-bottom)" : undefined,
            transform: isMobile && dragY ? `translateY(${dragY}px)` : undefined,
            transition: dragStart.current === null ? "transform 180ms ease" : undefined,
            zIndex: 10000,
            overflow: "hidden",
          }}
        >
          {isMobile && (
            <div
              data-testid="notifications-handle"
              onTouchStart={onDragStart}
              onTouchMove={onDragMove}
              onTouchEnd={onDragEnd}
              style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px", touchAction: "none", flex: "0 0 auto" }}
            >
              <span style={{ width: 40, height: 5, borderRadius: 999, background: "var(--theme-elevation-200, #d4d7dd)" }} />
            </div>
          )}
          <div
            onTouchStart={isMobile ? onDragStart : undefined}
            onTouchMove={isMobile ? onDragMove : undefined}
            onTouchEnd={isMobile ? onDragEnd : undefined}
            style={{
              flex: "0 0 auto",
              padding: isMobile ? "4px 8px 8px 16px" : "10px 14px",
              borderBottom: "1px solid var(--theme-elevation-100, #eee)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--theme-elevation-800)",
            }}
          >
            <span style={{ fontSize: isMobile ? 16 : undefined }}>Notifications</span>
            <span style={{ display: "flex", alignItems: "center", gap: isMobile ? 4 : 12 }}>
              {!isMobile && filterToggle}
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: isMobile ? 14 : 12,
                    fontWeight: 500,
                    color: "#1a73e8",
                    padding: isMobile ? "0 10px" : 0,
                    minHeight: isMobile ? 44 : undefined,
                    whiteSpace: "nowrap",
                  }}
                >
                  Mark all read
                </button>
              )}
              {isMobile && (
                <button
                  type="button"
                  aria-label="Close notifications"
                  onClick={() => setOpen(false)}
                  style={{ width: 44, height: 44, border: "none", background: "none", cursor: "pointer", fontSize: 20, color: "var(--theme-elevation-600, #555)" }}
                >
                  ✕
                </button>
              )}
            </span>
          </div>

          {isMobile && (
            <div style={{ flex: "0 0 auto", padding: "8px 16px", borderBottom: "1px solid var(--theme-elevation-100, #eee)" }}>
              {filterToggle}
            </div>
          )}
          <div
            ref={listRef}
            data-testid="notifications-list"
            onScroll={onListScroll}
            style={{ maxHeight: isMobile ? undefined : "min(680px, calc(100dvh - 140px))", flex: isMobile ? "1 1 auto" : undefined, overflowY: "auto", overscrollBehavior: "contain" }}
          >
            {loading && (
              <div style={{ padding: 16, fontSize: 13, color: "var(--theme-elevation-500)" }}>
                Loading…
              </div>
            )}
            {!loading && error && (
              <div style={{ padding: 16, fontSize: 13, color: "#b91c1c" }}>
                {error}
              </div>
            )}
            {!loading && !error && items.length === 0 && (
              <div style={{ padding: 16, fontSize: 13, color: "var(--theme-elevation-500)" }}>
                {filter === "unread" ? "No unread notifications." : "No notifications."}
              </div>
            )}
            {!loading &&
              items.map((item) => {
                const unread = !item.readAt;
                // Every row's left bar and label take its category colour (see notification-categories.ts).
                // Unread rows: white bg, bold title, coloured dot.
                // Read rows:   subtle grey bg, muted text, no dot.
                const category = notificationCategory(item.kind);
                const unreadBg = "var(--theme-elevation-0, #fff)";
                const readBg = "var(--theme-elevation-50, #f4f5f7)";
                const baseBg = unread ? unreadBg : readBg;
                const hoverBg = "var(--theme-elevation-100, #e8eaf0)";
                return (
                  <div
                    role="button"
                    tabIndex={0}
                    key={item.id}
                    onClick={() => void onItemClick(item)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      void onItemClick(item);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: isMobile ? "12px 16px" : "10px 14px 10px 14px",
                      paddingLeft: isMobile ? 13 : 11,
                      background: baseBg,
                      borderLeft: `3px solid ${category.color}`,
                      borderTop: "none",
                      borderRight: "none",
                      borderBottom: "1px solid var(--theme-elevation-100, #eee)",
                      cursor: "pointer",
                      transition: "background 150ms",
                      opacity: unread ? 1 : 0.78,
                      whiteSpace: "normal",
                      overflowWrap: "anywhere",
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
                            background: category.color,
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
                          minWidth: 0,
                          whiteSpace: "normal",
                          overflowWrap: "anywhere",
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
                          whiteSpace: "normal",
                          overflowWrap: "anywhere",
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
                        minWidth: 0,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        data-testid="notification-category"
                        style={{
                          color: category.color,
                          fontWeight: 600,
                          border: `1px solid ${category.color}`,
                          borderRadius: 999,
                          padding: "0 6px",
                          lineHeight: "16px",
                        }}
                      >
                        {category.label}
                      </span>
                      <span>{formatRelativeTime(item.createdAt)}</span>
                      {!unread && (
                        <span style={{ color: "var(--theme-elevation-400, #999)" }}>
                          · Read
                        </span>
                      )}
                      {unread && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void markItemRead(item);
                          }}
                          style={{
                            marginLeft: "auto",
                            color: "#1a73e8",
                            fontWeight: 600,
                            cursor: "pointer",
                            padding: isMobile ? "0 12px" : "2px 0",
                            marginRight: isMobile ? -12 : undefined,
                            minHeight: isMobile ? 44 : undefined,
                            border: "none",
                            background: "none",
                            fontSize: isMobile ? 13 : 11,
                          }}
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            {!loading && !error && items.length > 0 && (
              <div
                aria-live="polite"
                style={{ padding: "10px 14px", fontSize: 12, textAlign: "center", color: "var(--theme-elevation-500, #888)" }}
              >
                {loadingMore ? (
                  "Loading more…"
                ) : loadMoreError ? (
                  <>
                    {loadMoreError}{" "}
                    <button
                      type="button"
                      onClick={() => void loadMore()}
                      style={{ border: "none", background: "none", color: "#1a73e8", fontWeight: 600, cursor: "pointer", fontSize: 12, padding: 0 }}
                    >
                      Try again
                    </button>
                  </>
                ) : hasMore ? (
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    style={{ border: "none", background: "none", color: "#1a73e8", fontWeight: 600, cursor: "pointer", fontSize: 12, padding: isMobile ? "8px 12px" : 0 }}
                  >
                    Load more
                  </button>
                ) : (
                  `That's everything${filter === "unread" ? " unread" : ""}.`
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {isNavigating &&
        createPortal(
          <div className="od-splash-overlay" aria-busy="true">
            <RocketSplash />
          </div>,
          document.body,
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
