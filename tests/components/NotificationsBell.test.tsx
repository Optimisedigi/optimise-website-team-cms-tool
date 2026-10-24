import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@payloadcms/ui", () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/RocketSplash", () => ({ default: () => null }));
vi.mock("@/components/ClientEmailAlert", () => ({ default: () => null }));

import NotificationsBell from "@/components/NotificationsBell";
import { announceNotificationsChanged } from "@/lib/notifications-events";

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.unstubAllGlobals();
});

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

/** 45 rows, newest first; rows 3, 30 and 44 are unread. */
const ROWS = Array.from({ length: 45 }, (_, i) => ({
  id: 1000 - i,
  kind: "team-task-mention",
  title: `Note ${i + 1}`,
  body: null,
  url: null,
  readAt: [2, 29, 43].includes(i) ? null : "2026-10-20T00:00:00.000Z",
  createdAt: new Date(Date.UTC(2026, 9, 24, 0, 0) - i * 60_000).toISOString(),
}));

/** Minimal stand-in for GET /api/notifications with unreadOnly + keyset cursor. */
function notificationsApi(url: URL) {
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const before = url.searchParams.get("beforeId");
  let rows = url.searchParams.get("unreadOnly") === "true" ? ROWS.filter((r) => !r.readAt) : ROWS;
  if (before) rows = rows.filter((r) => r.id < Number(before));
  const docs = rows.slice(0, limit);
  return json({ docs, totalDocs: rows.length, hasNextPage: rows.length > docs.length });
}

function stubFetch() {
  const calls: string[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    calls.push(`${url.pathname}${url.search}`);
    if (url.pathname.endsWith("/unread-count")) return json({ count: 3 });
    return notificationsApi(url);
  }) as typeof fetch;
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  return calls;
}

describe("NotificationsBell badge", () => {
  it("shows the real unread count above 99 instead of 99+", async () => {
    globalThis.fetch = vi.fn(async () => json({ count: 142 })) as typeof fetch;
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));

    render(<NotificationsBell />);

    expect(await screen.findByText("142")).toBeTruthy();
    expect(screen.queryByText("99+")).toBeNull();
  });
});

describe("NotificationsBell list", () => {
  it("keeps loading older notifications past the first 20, without repeats", async () => {
    const calls = stubFetch();
    render(<NotificationsBell />);
    fireEvent.click(await screen.findByRole("button", { name: "3 unread notifications" }));

    // jsdom has no layout, so the panel never "fills" and every page loads in turn.
    expect(await screen.findByText("Note 45")).toBeTruthy();
    expect(screen.getByText("That's everything.")).toBeTruthy();
    expect(screen.getAllByText(/^Note \d+$/)).toHaveLength(45);
    const listCalls = calls.filter((c) => c.startsWith("/api/notifications?"));
    expect(listCalls[1]).toContain("beforeId=981");
    expect(listCalls[1]).toContain(`beforeCreatedAt=${encodeURIComponent(ROWS[19]!.createdAt)}`);
  });

  it("filters to unread notifications, including old ones", async () => {
    const calls = stubFetch();
    render(<NotificationsBell />);
    fireEvent.click(await screen.findByRole("button", { name: "3 unread notifications" }));
    await screen.findByText("Note 45");

    fireEvent.click(screen.getByRole("button", { name: "Unread (3)" }));

    await waitFor(() => expect(screen.getAllByText(/^Note \d+$/).map((n) => n.textContent)).toEqual(["Note 3", "Note 30", "Note 44"]));
    expect(screen.getByRole("button", { name: "Unread (3)" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("That's everything unread.")).toBeTruthy();
    expect(calls.some((c) => c.includes("unreadOnly=true"))).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(await screen.findByText("Note 1")).toBeTruthy();
  });

  it("refreshes straight away when Mail marks emails read", async () => {
    const calls = stubFetch();
    render(<NotificationsBell />);
    fireEvent.click(await screen.findByRole("button", { name: "3 unread notifications" }));
    await screen.findByText("Note 45");
    const before = { count: calls.filter((c) => c.includes("unread-count")).length, list: calls.filter((c) => c.startsWith("/api/notifications?")).length };

    announceNotificationsChanged();

    await waitFor(() => expect(calls.filter((c) => c.includes("unread-count")).length).toBeGreaterThan(before.count));
    await waitFor(() => expect(calls.filter((c) => c.startsWith("/api/notifications?")).length).toBeGreaterThan(before.list));
  });
});
