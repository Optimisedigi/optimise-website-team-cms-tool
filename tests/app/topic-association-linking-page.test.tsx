import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakePayload, type FakePayload } from "../lib/content-map/fake-payload";

const holder = vi.hoisted(() => ({ payload: null as unknown as FakePayload, cookie: undefined as string | undefined }));
vi.mock("payload", () => ({ getPayload: vi.fn(async () => holder.payload) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: (name: string) => (name === "dashboard_token" && holder.cookie ? { value: holder.cookie } : undefined) })),
}));
vi.mock("next/font/google", () => ({ Space_Grotesk: () => ({ variable: "sg" }), JetBrains_Mono: () => ({ variable: "jb" }) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { to }); }),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("@/components/content-map/ContentMapPage", () => ({ default: function ContentMapPage() { return null; } }));
vi.mock("@/components/PinGateFrame", () => ({ PinGateFrame: function PinGateFrame() { return null; } }));
vi.mock("@/components/dashboards/shared/DashboardPinEntry", () => ({ DashboardPinEntry: function DashboardPinEntry() { return null; } }));

import Page from "@/app/(frontend)/SEO/Topic-association-linking/[clientSlug]/page";
import { signToken } from "@/app/(frontend)/api/dashboard/verify/route";

type El = { type: { name?: string } | string; props: Record<string, unknown> & { children?: unknown } };
async function outcome(slug: string, view?: string) {
  try {
    const el = (await Page({ params: Promise.resolve({ clientSlug: slug }), searchParams: Promise.resolve(view ? { view } : {}) })) as unknown as El;
    const inner = (Array.isArray(el.props.children) ? el.props.children[0] : el.props.children) as El;
    return { inner };
  } catch (err) {
    return { error: (err as Error).message, to: (err as { to?: string }).to };
  }
}

beforeEach(() => {
  holder.cookie = undefined;
  holder.payload = createFakePayload({
    clients: [
      { id: 7, name: "Away Digital Teams", slug: "away-digital-teams", isActive: true, clientPin: "1234", contentMapEnabled: true },
      { id: 8, name: "No Pin", slug: "no-pin", isActive: true, contentMapEnabled: true },
    ],
  });
  holder.payload.auth.mockResolvedValue({ user: null } as never);
});

describe("/SEO/Topic-association-linking/[clientSlug]", () => {
  it("shows clients the same PIN screen as the other reports", async () => {
    const { inner } = await outcome("away-digital-teams");
    expect((inner.type as { name: string }).name).toBe("PinGateFrame");
    expect(inner.props).toMatchObject({ eyebrow: "Topic Association Linking", title: "Away Digital Teams" });
    expect((inner.props.children as El).props).toMatchObject({ slug: "away-digital-teams", redirectTo: "/SEO/Topic-association-linking/away-digital-teams" });
    expect(((inner.props.footer as El).props as { href: string }).href).toBe("/admin/login?redirect=%2FSEO%2FTopic-association-linking%2Faway-digital-teams");
  });

  it("shows the read-only client view once the PIN cookie is set", async () => {
    holder.cookie = signToken("away-digital-teams", Date.now() + 60_000);
    const { inner } = await outcome("away-digital-teams");
    expect((inner.type as { name: string }).name).toBe("ContentMapPage");
    expect(inner.props).toEqual({ clientId: "", slug: "away-digital-teams", audience: "client" });
  });

  it("gives signed-in staff the team view, and a client-view preview", async () => {
    holder.payload.auth.mockResolvedValue({ user: { id: 1 } } as never);
    expect((await outcome("away-digital-teams")).inner!.props).toEqual({ clientId: "7", slug: "away-digital-teams", audience: "team", staff: true });
    expect((await outcome("away-digital-teams", "client")).inner!.props).toMatchObject({ audience: "client", staff: true });
  });

  it("redirects staff from a client name to its slug, keeping the view", async () => {
    holder.payload.auth.mockResolvedValue({ user: { id: 1 } } as never);
    expect(await outcome("Away-Digital-Teams", "client")).toMatchObject({ error: "NEXT_REDIRECT", to: "/SEO/Topic-association-linking/away-digital-teams?view=client" });
  });

  it("redirects other capitalisations of the slug for clients, but never matches by name", async () => {
    expect(await outcome("AWAY-DIGITAL-TEAMS")).toMatchObject({ error: "NEXT_REDIRECT", to: "/SEO/Topic-association-linking/away-digital-teams" });
    expect(await outcome("Away Digital Teams")).toMatchObject({ error: "NEXT_NOT_FOUND" });
  });

  it("404s for unknown clients and clients without a PIN", async () => {
    expect(await outcome("nobody")).toMatchObject({ error: "NEXT_NOT_FOUND" });
    expect(await outcome("no-pin")).toMatchObject({ error: "NEXT_NOT_FOUND" });
  });
});
