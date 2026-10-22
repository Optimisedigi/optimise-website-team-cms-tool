import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
let mockUser: Record<string, unknown> | null = { id: 10, role: "admin" };

vi.mock("@payloadcms/ui", () => ({ useAuth: () => ({ user: mockUser }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import ClientEmailAlert, { FRESH_MS, POLL_MS, SHOWN_STORAGE_KEY, VISIBLE_MS } from "@/components/ClientEmailAlert";

const alert = (id: number, client = "In The Picture", createdAt = new Date().toISOString()) => ({
  id,
  title: `Client email – please read: ${client}`,
  body: "Jo Smith · Can you call me?",
  url: `/admin/mail?thread=t${id}`,
  createdAt,
});

let alertsResponse: Array<ReturnType<typeof alert>> = [];
let syncedResponse = true;
const fetchMock = vi.fn(async (url: string) => {
  if (String(url).startsWith("/api/mail/client-alerts")) {
    return new Response(JSON.stringify({ alerts: alertsResponse, total: alertsResponse.length, synced: syncedResponse }), { status: 200 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  push.mockReset();
  fetchMock.mockClear();
  mockUser = { id: 10, role: "admin" };
  alertsResponse = [];
  syncedResponse = true;
  localStorage.clear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function nextPoll() {
  await act(async () => {
    vi.advanceTimersByTime(POLL_MS);
  });
  await flush();
}

function mount(props: Partial<{ suppressed: boolean; onArrive: () => void }> = {}) {
  const onArrive = props.onArrive ?? vi.fn();
  const view = render(<ClientEmailAlert suppressed={props.suppressed ?? false} onArrive={onArrive} />);
  return { onArrive, ...view };
}

describe("ClientEmailAlert (drop-down under the bell)", () => {
  it("does not poll for users without Mail access", async () => {
    mockUser = { id: 11, role: "user", featureAccess: [] };
    mount();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never drops down alerts that already exist when the CMS opens", async () => {
    alertsResponse = [alert(1)];
    const { onArrive } = mount();
    await flush();
    expect(fetchMock).toHaveBeenCalledWith("/api/mail/client-alerts?sync=1", expect.anything());
    await nextPoll();
    expect(screen.queryByTestId("client-email-alert")).toBeNull();
    expect(onArrive).not.toHaveBeenCalled();
  });

  it("keeps the baseline until this page has run its own sync (older mail never drops down)", async () => {
    syncedResponse = false; // first sync throttled by another tab
    mount();
    await flush();
    syncedResponse = true;
    alertsResponse = [alert(2)]; // created by this page's first real sync, for mail that came in earlier
    await nextPoll();
    expect(screen.queryByTestId("client-email-alert")).toBeNull();
  });

  it("drops down a new alert once, rings the bell, and hides itself", async () => {
    const { onArrive } = mount();
    await flush();
    alertsResponse = [alert(3)];
    await nextPoll();
    expect(screen.getByTestId("client-email-alert")).toBeInTheDocument();
    expect(screen.getByText("In The Picture")).toBeInTheDocument();
    expect(onArrive).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(SHOWN_STORAGE_KEY) ?? "[]")).toEqual(["3"]);

    await act(async () => {
      vi.advanceTimersByTime(VISIBLE_MS + 10);
    });
    expect(screen.queryByTestId("client-email-alert")).toBeNull();
    await nextPoll();
    expect(screen.queryByTestId("client-email-alert")).toBeNull();
    expect(onArrive).toHaveBeenCalledTimes(1);
  });

  it("does not show again in another tab or after a reload", async () => {
    localStorage.setItem(SHOWN_STORAGE_KEY, JSON.stringify(["4"]));
    mount();
    await flush();
    alertsResponse = [alert(4)];
    await nextPoll();
    expect(screen.queryByTestId("client-email-alert")).toBeNull();
  });

  it("skips alerts older than the fresh window", async () => {
    mount();
    await flush();
    alertsResponse = [alert(5, "Acme", new Date(Date.now() - FRESH_MS - 60_000).toISOString())];
    await nextPoll();
    expect(screen.queryByTestId("client-email-alert")).toBeNull();
  });

  it("Later hides it without marking it read (it stays in the bell)", async () => {
    mount();
    await flush();
    alertsResponse = [alert(6)];
    await nextPoll();
    fireEvent.click(screen.getByText("Later"));
    expect(screen.queryByTestId("client-email-alert")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/mark-read"), expect.anything());
  });

  it("Open email marks it read and opens the thread in Mail", async () => {
    mount();
    await flush();
    alertsResponse = [alert(7)];
    await nextPoll();
    fireEvent.click(screen.getByText("Open email"));
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/7/mark-read", expect.objectContaining({ method: "POST" }));
    expect(push).toHaveBeenCalledWith("/admin/mail?thread=t7");
  });

  it("is held back while the bell list is open", async () => {
    const { rerender, onArrive } = mount({ suppressed: true });
    await flush();
    alertsResponse = [alert(8)];
    await nextPoll();
    expect(screen.queryByTestId("client-email-alert")).toBeNull();
    rerender(<ClientEmailAlert suppressed={false} onArrive={onArrive} />);
    expect(screen.getByTestId("client-email-alert")).toBeInTheDocument();
  });
});
