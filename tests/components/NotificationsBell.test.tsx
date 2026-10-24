import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@payloadcms/ui", () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/RocketSplash", () => ({ default: () => null }));
vi.mock("@/components/ClientEmailAlert", () => ({ default: () => null }));

import NotificationsBell from "@/components/NotificationsBell";

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

describe("NotificationsBell badge", () => {
  it("shows the real unread count above 99 instead of 99+", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ count: 142 }), { status: 200, headers: { "Content-Type": "application/json" } }),
    ) as typeof fetch;
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));

    render(<NotificationsBell />);

    expect(await screen.findByText("142")).toBeTruthy();
    expect(screen.queryByText("99+")).toBeNull();
    vi.unstubAllGlobals();
  });
});
