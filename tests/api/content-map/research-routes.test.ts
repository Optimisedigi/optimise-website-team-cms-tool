import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sample from "../../fixtures/content-map-research-sample.json";
import { createFakePayload, jsonResponse, type FakePayload } from "../../lib/content-map/fake-payload";
import { result, snap } from "../../lib/content-map/research-fixtures";

const holder = vi.hoisted(() => ({ payload: null as unknown as FakePayload, cookie: undefined as string | undefined }));
vi.mock("payload", () => ({ getPayload: vi.fn(async () => holder.payload) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("googleapis", () => ({ google: { searchconsole: vi.fn(() => { throw new Error("no google"); }) } }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: (name: string) => (name === "dashboard_token" && holder.cookie ? { value: holder.cookie } : undefined) })),
}));
const model = vi.hoisted(() => vi.fn());
vi.mock("@/lib/content-map/llm", async (orig) => ({ ...(await orig<object>()), callContentMapModel: model }));
const afterMock = vi.hoisted(() => vi.fn());
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: afterMock }));

import { POST as run } from "@/app/(frontend)/api/content-map/research/run/route";
import { POST as ingest } from "@/app/(frontend)/api/content-map/research/ingest/route";
import { POST as decide } from "@/app/(frontend)/api/content-map/research/decide/route";
import { POST as place } from "@/app/(frontend)/api/content-map/placement/route";
import { POST as viewPlace } from "@/app/(frontend)/api/content-map/view/placement/route";
import { signToken } from "@/app/(frontend)/api/dashboard/verify/route";
import { toClientView } from "@/lib/content-map/client-view";
import type { ContentMapApiResponse } from "@/lib/content-map/types";

const fetchMock = vi.fn();
const client = { id: 7, name: "Away", slug: "away", isActive: true, clientPin: "1", contentMapEnabled: true, websiteUrl: "https://a.com", topicAuthorities: [{ name: "Cost", primary: true }, { name: "Vietnam" }] };
const req = (body: unknown, headers: Record<string, string> = {}) => new NextRequest("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const staff = () => holder.payload.auth.mockResolvedValue({ user: { id: 1, role: "admin" } } as never);
const placementReply = { text: JSON.stringify({ items: [{ index: 0, topic: "cost", fit: 0.8, placement: "new-article" }] }), model: "m" };

beforeEach(() => {
  holder.cookie = undefined;
  holder.payload = createFakePayload({
    clients: [client, { id: 8, name: "Other", slug: "other", isActive: true, clientPin: "9", contentMapEnabled: true, topicAuthorities: [{ name: "Other" }] }],
    "content-map-snapshots": [{ id: 1, client: 7, status: "completed", generatedAt: "2026-10-01", data: snap() }],
  });
  holder.payload.auth.mockResolvedValue({ user: null } as never);
  afterMock.mockReset();
  model.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GROWTH_TOOLS_URL", "http://gt.test");
  vi.stubEnv("INTERNAL_API_KEY", "internal");
  vi.stubEnv("CMS_API_KEY", "cms-key");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("research/run", () => {
  it("401 without staff; starts once and reuses the running run", async () => {
    expect((await run(req({ clientId: 7 }))).status).toBe(401);
    staff();
    fetchMock.mockResolvedValue(jsonResponse(202, { runId: "g1", status: "running" }));
    const a = await (await run(req({ clientId: 7 }))).json();
    const b = await (await run(req({ clientId: 7 }))).json();
    expect(a).toMatchObject({ runId: "g1", reused: false, gsc: { connected: false } });
    expect(b).toMatchObject({ runId: "g1", reused: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("research/ingest", () => {
  it("API-key auth; idempotent by runId; schedules placement while insights are missing", async () => {
    const body = { clientId: 7, runId: "r1", status: "completed", result: result() };
    expect((await ingest(req(body))).status).toBe(401);
    expect((await ingest(req(body, { authorization: "users API-Key wrong" }))).status).toBe(401);
    const ok = await ingest(req(body, { authorization: "users API-Key cms-key" }));
    expect(await ok.json()).toMatchObject({ status: "completed", insightsPending: true });
    await ingest(req(body, { authorization: "users API-Key cms-key" }));
    expect(holder.payload.store["content-map-research"]).toHaveLength(1);
    expect(afterMock).toHaveBeenCalledTimes(2);
  });
});

describe("research/decide", () => {
  const idea = { id: "rs-1", title: "Vietnam developer cost in 2026", question: "How much?", topic: "cost", fit: 0.8, overlaps: [], placement: "new-article", pageId: null, pageTitle: null, newTopicName: null, linksTo: [], linksFrom: [], why: "", warnings: [], layers: ["volume"], evidence: [{ source: "volume", text: "300 searches a month", volume: 300 }], volume: 300, keywords: [], status: "listed", planItemId: null };
  beforeEach(() => {
    holder.payload.store["content-map-research"] = [{ id: 60, client: 7, status: "completed", generatedAt: "2026-10-02", result: result(), insights: { model: "m", ideas: [idea], briefs: {} } } as never];
  });
  it("401 without staff; dismiss → restore → add (model brief → research plan item)", async () => {
    expect((await decide(req({ clientId: 7, id: "rs-1", action: "dismiss" }))).status).toBe(401);
    staff();
    expect((await (await decide(req({ clientId: 7, id: "rs-1", action: "dismiss" }))).json()).idea.status).toBe("dismissed");
    expect((await decide(req({ clientId: 7, id: "rs-1", action: "dismiss" }))).status).toBe(409);
    expect((await (await decide(req({ clientId: 7, id: "rs-1", action: "restore" }))).json()).idea.status).toBe("listed");
    model.mockResolvedValue({ text: JSON.stringify({ ideas: [{ title: "Vietnam developer cost in 2026", question: "How much?", outline: ["x"] }] }), model: "m" });
    const added = await (await decide(req({ clientId: 7, id: "rs-1", action: "add" }))).json();
    expect(added.idea).toMatchObject({ status: "in-plan" });
    expect(added.planItem).toMatchObject({ origin: "research", researchId: "rs-1" });
    expect((await decide(req({ clientId: 8, id: "rs-1", action: "add" }))).status).toBe(404);
    expect((await decide(req({ clientId: 7, id: "rs-1", action: "nope" }))).status).toBe(400);
  });
});

describe("placement", () => {
  it("staff only → PlacementResult", async () => {
    expect((await place(req({ clientId: 7, title: "Developer costs" }))).status).toBe(401);
    staff();
    model.mockResolvedValue(placementReply);
    const out = await (await place(req({ clientId: 7, title: "Developer costs" }))).json();
    expect(out.placement).toMatchObject({ topic: "cost", placement: "new-article", why: "Fits Cost strongly." });
  });

  it("PIN: wrong slug → 401; 21st call in a day → 429; next day allowed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T10:00:00.000Z"));
    model.mockResolvedValue(placementReply);
    holder.cookie = signToken("other", Date.now() + 60_000);
    expect((await viewPlace(req({ slug: "away", title: "Developer costs" }))).status).toBe(401);
    holder.cookie = signToken("away", Date.now() + 3 * 86_400_000);
    for (let i = 0; i < 20; i++) expect((await viewPlace(req({ slug: "away", title: `Idea ${i}` }))).status).toBe(200);
    expect((await viewPlace(req({ slug: "away", title: "One more" }))).status).toBe(429);
    vi.setSystemTime(new Date("2026-10-21T10:00:01.000Z"));
    expect((await viewPlace(req({ slug: "away", title: "Tomorrow" }))).status).toBe(200);
  });
});

describe("client-view allowlist (fixture)", () => {
  it("no competitor domain, URL or title anywhere", () => {
    const state = sample as unknown as ContentMapApiResponse;
    const domains = new Set<string>();
    for (const t of Object.values(state.research?.topics ?? {})) for (const d of t.competitorDomains) domains.add(d.domain);
    for (const i of state.research?.ideas ?? []) for (const e of i.evidence) for (const d of e.domains ?? []) domains.add(d);
    for (const p of state.plan ?? []) for (const r of p.reasons) if (r.kind === "competitors") for (const d of r.domains ?? []) domains.add(d);
    expect(domains.size).toBeGreaterThan(0);
    const view = toClientView(state);
    // Research data: no competitor domain anywhere in the research / inProgress parts or in research/competitor plan reasons.
    const research = JSON.stringify({ research: view.research, inProgress: view.inProgress, reasons: (view.plan ?? []).flatMap((p) => p.reasons.filter((r) => r.kind !== "ai-cites-others")) });
    for (const d of domains) expect(research).not.toContain(d);
    // AI-citation data (round 2, shown to clients by design) is the only place the rest may appear.
    const rest = JSON.stringify({ ...view, research: null, inProgress: null, citations: null, plan: (view.plan ?? []).map((p) => ({ ...p, reasons: p.reasons.filter((r) => r.kind !== "ai-cites-others"), sources: [] })) });
    for (const d of domains) expect(rest).not.toContain(d);
    expect(JSON.stringify(view.research?.topics)).not.toContain("competitorDomains\":[{");
    const out = JSON.stringify(view);
    expect(out).not.toContain(state.research?.insightsModel || "kimi-k3");
  });
});
