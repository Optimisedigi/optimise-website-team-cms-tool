import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
let mockUser: Record<string, unknown> | null = { id: 10, role: "admin" };

vi.mock("@payloadcms/ui", () => ({ useAuth: () => ({ user: mockUser }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import ClientEmailAlert, { EXPANDED_MS } from "@/components/ClientEmailAlert";

const alert = (id: number, client = "In The Picture") => ({
  id,
  title: `Client email – please read: ${client}`,
  body: "Jo Smith · Can you call me?",
  url: `/admin/mail?thread=t${id}`,
  createdAt: new Date().toISOString(),
});

let alertsResponse: Array<ReturnType<typeof alert>> = [];
const fetchMock = vi.fn(async (url: string) => {
  if (String(url).startsWith("/api/mail/client-alerts")) {
    return new Response(JSON.stringify({ alerts: alertsResponse, total: alertsResponse.length }), { status: 200 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  push.mockReset();
  fetchMock.mockClear();
  mockUser = { id: 10, role: "admin" };
  alertsResponse = [];
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("ClientEmailAlert", () => {
  it("renders nothing when there are no alerts", async () => {
    render(<ClientEmailAlert panelOpen={false} />);
    await flush();
    expect(fetchMock).toHaveBeenCalledWith("/api/mail/client-alerts?sync=1", expect.anything());
    expect(screen.queryByTestId("client-email-alert")).toBeNull();
  });

  it("does not poll for users without Mail access", async () => {
    mockUser = { id: 11, role: "user", featureAccess: [] };
    render(<ClientEmailAlert panelOpen={false} />);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("slides up fully open, then collapses to a chip after ~20s", async () => {
    alertsResponse = [alert(1)];
    render(<ClientEmailAlert panelOpen={false} />);
    await flush();
    const root = await screen.findByTestId("client-email-alert");
    expect(root.dataset.state).toBe("expanded");
    expect(screen.getByText("Client email – please read")).toBeInTheDocument();
    expect(screen.getByText("In The Picture")).toBeInTheDocument();
    // Stacked above the OptiMate orb while the panel is closed.
    expect(root.style.right).toBe("24px");
    expect(root.style.bottom).toBe("108px");

    await act(async () => { vi.advanceTimersByTime(EXPANDED_MS + 10); });
    expect(screen.getByTestId("client-email-alert").dataset.state).toBe("chip");
    expect(screen.getByText(/Client email: In The Picture/)).toBeInTheDocument();
  });

  it("sits to the left of the OptiMate panel when it is open", async () => {
    alertsResponse = [alert(1)];
    render(<ClientEmailAlert panelOpen />);
    await flush();
    const root = await screen.findByTestId("client-email-alert");
    expect(root.style.right).toBe(`${24 + 412 + 12}px`);
    expect(root.style.bottom).toBe("24px");
  });

  it("dismiss marks the alert read and hides it", async () => {
    alertsResponse = [alert(7)];
    render(<ClientEmailAlert panelOpen={false} />);
    await flush();
    fireEvent.click(await screen.findByText("Dismiss"));
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/7/mark-read", expect.objectContaining({ method: "POST" }));
    expect(screen.queryByTestId("client-email-alert")).toBeNull();
  });

  it("Open email marks it read and opens the thread in Mail", async () => {
    alertsResponse = [alert(3)];
    render(<ClientEmailAlert panelOpen={false} />);
    await flush();
    fireEvent.click(await screen.findByText("Open email"));
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/3/mark-read", expect.objectContaining({ method: "POST" }));
    expect(push).toHaveBeenCalledWith("/admin/mail?thread=t3");
  });

  it("shows how many more are waiting and can dismiss them all", async () => {
    alertsResponse = [alert(2, "Acme"), alert(1)];
    render(<ClientEmailAlert panelOpen={false} />);
    await flush();
    expect(await screen.findByText(/\+1 more/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Dismiss all"));
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/2/mark-read", expect.anything());
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/1/mark-read", expect.anything());
    expect(screen.queryByTestId("client-email-alert")).toBeNull();
  });
});
