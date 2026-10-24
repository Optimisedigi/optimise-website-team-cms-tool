import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ events: [] as string[], job: null as null | (() => Promise<void>), releaseIdeas: () => {} }));
vi.mock("payload", () => ({ getPayload: vi.fn(async () => ({ findByID: vi.fn(async () => ({ id: 7 })) })) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => Promise<void>) => { h.job = fn; } }));
vi.mock("@/lib/content-map/snapshots", () => ({
  upsertRun: vi.fn(async () => ({ doc: { id: 1, status: "completed" }, snapshot: { ai: {} }, pendingRefresh: false })),
  triggerContentMapRun: vi.fn(),
}));
vi.mock("@/lib/content-map/ideas", () => ({
  needsIdeas: () => true,
  refreshIdeas: vi.fn(async () => {
    h.events.push("ideas:start");
    await new Promise<void>((r) => { h.releaseIdeas = r; });
    h.events.push("ideas:end");
    return { ok: true };
  }),
}));
vi.mock("@/lib/content-map/citations", () => ({ maybeStartWeeklyCitations: vi.fn(async () => { h.events.push("citations"); return null; }) }));
vi.mock("@/lib/content-map/placement", () => ({ runResearchSchedule: vi.fn(async () => { h.events.push("research+gsc"); return { gsc: null, research: null, placed: false }; }) }));

import { POST } from "@/app/(frontend)/api/content-map/ingest/route";

describe("analysis ingest chain", () => {
  it("starts research + GSC immediately, citations only after ideas", async () => {
    vi.stubEnv("CMS_API_KEY", "cms-key");
    const res = await POST(new Request("http://x/api/content-map/ingest", {
      method: "POST",
      headers: { Authorization: "users API-Key cms-key", "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "7", runId: "r1", status: "completed", snapshot: {} }),
    }) as never);
    expect(res.status).toBe(200);
    const job = h.job?.();
    await vi.waitFor(() => expect(h.events).toEqual(["ideas:start", "research+gsc"]));
    h.releaseIdeas();
    await job;
    expect(h.events).toEqual(["ideas:start", "research+gsc", "ideas:end", "citations"]);
    vi.unstubAllEnvs();
  });
});
