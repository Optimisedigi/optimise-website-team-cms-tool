import { beforeEach, describe, expect, it, vi } from "vitest";
import sampleJson from "../../fixtures/content-map-snapshot-sample.json";
import { createFakePayload, type FakePayload } from "../../lib/content-map/fake-payload";

const holder = vi.hoisted(() => ({ payload: null as unknown as FakePayload, cookie: undefined as string | undefined }));
vi.mock("payload", () => ({ getPayload: vi.fn(async () => holder.payload) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: (name: string) => (name === "dashboard_token" && holder.cookie ? { value: holder.cookie } : undefined) })),
}));

import { GET } from "@/app/(frontend)/api/content-map/view/route";
import { signToken } from "@/app/(frontend)/api/dashboard/verify/route";

const get = (slug: string) => GET(new Request(`http://cms.test/api/content-map/view?slug=${encodeURIComponent(slug)}`) as never);
const token = (slug: string) => signToken(slug, Date.now() + 60_000);

beforeEach(() => {
  holder.cookie = undefined;
  holder.payload = createFakePayload({
    clients: [
      { id: 7, name: "Away", slug: "away", isActive: true, clientPin: "1234", contentMapEnabled: true, websiteUrl: "https://a.com" },
      { id: 8, name: "Other", slug: "other", isActive: true, clientPin: "9999", contentMapEnabled: true },
      { id: 9, name: "Off", slug: "off", isActive: true, clientPin: "1111", contentMapEnabled: false },
    ],
    "content-map-snapshots": [{ id: 1, client: 7, runId: "r1", status: "completed", generatedAt: "2026-10-22T09:00:00.000Z", data: sampleJson }],
    "internal-link-suggestions": [{ id: 3, client: 7, origin: "content-map", opportunityKey: "k", status: "rejected" }],
  });
  holder.payload.auth.mockResolvedValue({ user: null } as never);
});

describe("GET /api/content-map/view", () => {
  it("needs the client's PIN cookie or a staff session", async () => {
    expect((await get("away")).status).toBe(401);
  });

  it("returns the client-safe view with a PIN cookie for that slug", async () => {
    holder.cookie = token("away");
    const res = await get("away");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = await res.json();
    expect(body.client).toMatchObject({ id: "", name: "Away", slug: "away" });
    expect(body.termW).toEqual({});
    expect(body.decisions).toEqual([]);
    expect(body.snapshot.nodes.length).toBeGreaterThan(0);
  });

  it("rejects a PIN cookie for a different client, and clients with Content Map off", async () => {
    holder.cookie = token("other");
    expect((await get("away")).status).toBe(401);
    holder.cookie = token("off");
    expect((await get("off")).status).toBe(401);
  });

  it("lets signed-in staff preview the client view", async () => {
    holder.payload.auth.mockResolvedValue({ user: { id: 1 } } as never);
    const res = await get("away");
    expect(res.status).toBe(200);
    expect((await res.json()).client.id).toBe("");
  });

  it("rejects malformed slugs", async () => {
    expect((await get("../admin")).status).toBe(400);
  });
});
