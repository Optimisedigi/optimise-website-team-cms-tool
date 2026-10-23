import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sample from "../../fixtures/content-map-snapshot-sample.json";
import { createFakePayload, jsonResponse, type FakePayload } from "../../lib/content-map/fake-payload";

const holder: { payload: FakePayload } = { payload: createFakePayload() };
vi.mock("payload", () => ({ getPayload: vi.fn(async () => holder.payload) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
const afterMock = vi.hoisted(() => vi.fn());
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: afterMock }));

import { GET as getMap } from "@/app/(frontend)/api/content-map/route";
import { POST as ingest } from "@/app/(frontend)/api/content-map/ingest/route";
import { POST as decide } from "@/app/(frontend)/api/content-map/decision/route";
import { POST as run } from "@/app/(frontend)/api/content-map/run/route";
import { GET as cron } from "@/app/(frontend)/api/content-map/cron/route";

const client = {
  id: 7,
  name: "Away",
  websiteUrl: "https://awaydigitalteams.com",
  contentMapEnabled: true,
  topicAuthorities: [{ name: "Vietnam", primary: true }],
};
const opp = sample.opportunities[0];
const fetchMock = vi.fn();

function req(url: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return new NextRequest(`http://localhost${url}`, {
    method: init.method ?? "GET",
    headers: { "Content-Type": "application/json", ...init.headers },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

beforeEach(() => {
  holder.payload = createFakePayload({ clients: [client, { id: 8, name: "Off", websiteUrl: "https://off.com", contentMapEnabled: false }] });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.stubEnv("GROWTH_TOOLS_URL", "http://gt.test");
  vi.stubEnv("INTERNAL_API_KEY", "internal");
  vi.stubEnv("CMS_API_KEY", "cms-key");
  vi.stubEnv("CRON_SECRET", "cron-secret");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GET /api/content-map", () => {
  it("401s without a user and reads the client with the user's access", async () => {
    holder.payload.auth.mockResolvedValueOnce({ user: null } as never);
    expect((await getMap(req("/api/content-map?clientId=7"))).status).toBe(401);
    await getMap(req("/api/content-map?clientId=7"));
    expect(holder.payload.findByID).toHaveBeenCalledWith(expect.objectContaining({ collection: "clients", overrideAccess: false, user: expect.anything() }));
  });

  it("returns the ContentMapApiResponse shape with termW", async () => {
    if (!opp) throw new Error("fixture");
    const p = holder.payload;
    p.store["content-map-snapshots"] = [{ id: 1, client: 7, runId: "r1", status: "completed", data: sample, stats: sample.stats, generatedAt: sample.generatedAt, createdAt: "2026-10-01" }];
    p.store["internal-link-suggestions"] = [{ id: 2, client: 7, origin: "content-map", opportunityKey: opp.key, status: "approved" }];
    p.store["blog-prompts"] = [{ id: 3, client: 7, source: "content-map", contentMapRecommendationId: "r1" }];
    const res = await getMap(req("/api/content-map?clientId=7"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["actions", "citations", "client", "decisions", "history", "inProgress", "plan", "research", "run", "sent", "snapshot", "suggestions", "termW"]);
    expect(body.client).toMatchObject({ id: "7", name: "Away", enabled: true, authorities: [{ key: "vietnam", primary: true }] });
    expect(body.run).toBeNull();
    expect(body.snapshot.generatedAt).toBe(sample.generatedAt);
    expect(body.decisions).toEqual([{ key: opp.key, decision: "accepted" }]);
    expect(body.termW).toEqual(Object.fromEntries([...opp.terms].sort().map((t) => [t, 1])));
    expect(body.sent).toEqual({ r1: "3" });
    expect(body.history).toEqual([{ generatedAt: sample.generatedAt, stats: sample.stats }]);
  });

  it("polls GT for a run going over 2 minutes and shows the completed snapshot", async () => {
    holder.payload.store["content-map-snapshots"] = [
      { id: 1, client: 7, runId: "slow", status: "running", startedAt: new Date(Date.now() - 3 * 60_000).toISOString(), createdAt: "2026-10-02" },
    ];
    fetchMock.mockResolvedValue(jsonResponse(200, { runId: "slow", clientId: "7", status: "completed", snapshot: sample }));
    const body = await (await getMap(req("/api/content-map?clientId=7"))).json();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://gt.test/api/content-map/runs/slow");
    expect(body.run).toBeNull();
    expect(body.snapshot?.generatedAt).toBe(sample.generatedAt);
  });

  it("does not poll a fresh run", async () => {
    holder.payload.store["content-map-snapshots"] = [{ id: 1, client: 7, runId: "new", status: "running", phase: "crawling", startedAt: new Date().toISOString() }];
    const body = await (await getMap(req("/api/content-map?clientId=7"))).json();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.run).toMatchObject({ runId: "new", status: "running", phase: "crawling" });
  });
});

describe("POST /api/content-map/ingest", () => {
  const push = (body: unknown, key?: string) =>
    ingest(req("/api/content-map/ingest", { method: "POST", body, headers: key === undefined ? {} : { Authorization: `users API-Key ${key}` } }));

  it("401s on a missing or wrong key", async () => {
    const body = { clientId: "7", runId: "r1", status: "failed" };
    expect((await push(body)).status).toBe(401);
    expect((await push(body, "wrong")).status).toBe(401);
    expect((await push(body, "cms-key-longer")).status).toBe(401);
  });

  it("upserts by runId idempotently", async () => {
    const body = { clientId: "7", runId: "r1", status: "completed", snapshot: sample };
    expect((await push(body, "cms-key")).status).toBe(200);
    expect((await push(body, "cms-key")).status).toBe(200);
    expect(holder.payload.store["content-map-snapshots"]).toHaveLength(1);
    expect(holder.payload.store["content-map-snapshots"]?.[0]).toMatchObject({ status: "completed", client: 7 });
  });

  it("queues CMS-written ideas after the response when GT ran without an LLM", async () => {
    afterMock.mockClear();
    const res = await push({ clientId: "7", runId: "r9", status: "completed", snapshot: sample }, "cms-key");
    expect(await res.json()).toMatchObject({ ok: true, ideasPending: true });
    expect(afterMock).toHaveBeenCalledTimes(1);
    afterMock.mockClear();
    const withIdeas = { ...sample, ai: { ...sample.ai, ideas: { model: "kimi-k3", generatedAt: "2026-10-23T00:00:00.000Z" } } };
    const again = await push({ clientId: "7", runId: "r10", status: "completed", snapshot: withIdeas }, "cms-key");
    expect(await again.json()).toMatchObject({ ideasPending: false });
    // Still one post-response job: the weekly citation check (no ideas to write).
    expect(afterMock).toHaveBeenCalledTimes(1);
  });

  it("starts a refresh when pendingRefresh was set", async () => {
    holder.payload.store["content-map-snapshots"] = [{ id: 1, client: 7, runId: "r1", status: "running", pendingRefresh: true, startedAt: new Date().toISOString() }];
    fetchMock.mockResolvedValue(jsonResponse(202, { runId: "r2" }));
    const res = await push({ clientId: "7", runId: "r1", status: "failed", error: "boom" }, "cms-key");
    expect(await res.json()).toMatchObject({ ok: true, status: "failed", refreshRunId: "r2" });
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).mode).toBe("refresh");
  });

  it("validates the body and the client", async () => {
    expect((await push({ clientId: "7", runId: "r1", status: "running" }, "cms-key")).status).toBe(400);
    expect((await push({ clientId: "99", runId: "r1", status: "failed" }, "cms-key")).status).toBe(404);
  });
});

describe("POST /api/content-map/decision", () => {
  it("accepts, dismisses and undoes", async () => {
    if (!opp) throw new Error("fixture");
    holder.payload.store["content-map-snapshots"] = [{ id: 1, client: 7, runId: "r1", status: "completed", data: sample, generatedAt: sample.generatedAt }];
    const send = (decision: string) => decide(req("/api/content-map/decision", { method: "POST", body: { clientId: 7, key: opp.key, decision } }));
    expect((await send("accepted")).status).toBe(200);
    expect(holder.payload.store["internal-link-suggestions"]?.[0]?.status).toBe("approved");
    expect((await send("dismissed")).status).toBe(200);
    expect(holder.payload.store["internal-link-suggestions"]?.[0]?.status).toBe("rejected");
    expect((await send("undo")).status).toBe(200);
    expect(holder.payload.store["internal-link-suggestions"]).toHaveLength(0);
    expect((await send("maybe")).status).toBe(400);
  });
});

describe("POST /api/content-map/run", () => {
  it("returns the run and reports GT conflicts as adopted runs", async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { runId: "gt-1" }));
    const res = await run(req("/api/content-map/run", { method: "POST", body: { clientId: "7" } }));
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).toContain("gt-1");
    expect((await run(req("/api/content-map/run", { method: "POST", body: { clientId: "8" } }))).status).toBe(400);
  });
});

describe("GET /api/content-map/cron", () => {
  const call = (auth?: string) => cron(req("/api/content-map/cron", { headers: auth ? { authorization: auth } : {} }));
  it("requires the CRON_SECRET bearer", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer nope")).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("runs a full analysis for each enabled client with a website", async () => {
    holder.payload.store.clients?.push({ id: 9, name: "No site", websiteUrl: "", contentMapEnabled: true, topicAuthorities: [{ name: "A" }] });
    fetchMock.mockResolvedValue(jsonResponse(202, { runId: "w1" }));
    const body = await (await call("Bearer cron-secret")).json();
    expect(body.triggered).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toMatchObject({ clientId: "7", mode: "full" });
  });
});
