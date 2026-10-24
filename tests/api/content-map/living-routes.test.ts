import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { NextRequest } from "next/server";
import sample from "../../fixtures/content-map-snapshot-sample.json";
import { createFakePayload, type FakePayload } from "../../lib/content-map/fake-payload";

const holder = vi.hoisted(() => ({ payload: null as unknown as FakePayload, cookie: undefined as string | undefined }));
vi.mock("payload", () => ({ getPayload: vi.fn(async () => holder.payload) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: (name: string) => (name === "dashboard_token" && holder.cookie ? { value: holder.cookie } : undefined) })),
}));
// The subscription model is never called for real: question filling sees it fail and keeps what exists.
vi.mock("@/lib/content-map/llm", async (orig) => ({ ...(await orig<object>()), callContentMapModel: vi.fn(async () => { throw new Error("no model in tests"); }) }));
const afterMock = vi.hoisted(() => vi.fn());
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: afterMock }));

import { POST as clientSuggest } from "@/app/(frontend)/api/content-map/view/suggestions/route";
import { POST as teamSuggest } from "@/app/(frontend)/api/content-map/suggestions/route";
import { POST as decide } from "@/app/(frontend)/api/content-map/suggestions/decide/route";
import { POST as questions } from "@/app/(frontend)/api/content-map/questions/route";
import { POST as citationsRun } from "@/app/(frontend)/api/content-map/citations/run/route";
import { POST as citationsIngest } from "@/app/(frontend)/api/content-map/citations/ingest/route";
import { POST as ingest } from "@/app/(frontend)/api/content-map/ingest/route";
import { GET as view } from "@/app/(frontend)/api/content-map/view/route";
import { signToken } from "@/app/(frontend)/api/dashboard/verify/route";

const fetchMock = vi.fn();
const client = { id: 7, name: "Away", slug: "away", isActive: true, clientPin: "1234", contentMapEnabled: true, websiteUrl: "https://a.com", topicAuthorities: [{ name: "Vietnam", primary: true }] };

function req(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}
const asClient = (slug: string) => { holder.cookie = signToken(slug, Date.now() + 60_000); };

beforeEach(() => {
  holder.cookie = undefined;
  holder.payload = createFakePayload({
    clients: [client, { id: 8, name: "Other", slug: "other", isActive: true, clientPin: "9", contentMapEnabled: true, topicAuthorities: [{ name: "Other" }] }],
  });
  holder.payload.auth.mockResolvedValue({ user: null } as never);
  afterMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GROWTH_TOOLS_URL", "http://gt.test");
  vi.stubEnv("INTERNAL_API_KEY", "internal");
  vi.stubEnv("CMS_API_KEY", "cms-key");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/content-map/view/suggestions (PIN)", () => {
  const body = { slug: "away", kind: "article", title: "Hiring devs <script>x</script>", why: "Leads", topic: "vietnam", clientId: 8 };

  it("401s without a cookie or with another slug's cookie", async () => {
    expect((await clientSuggest(req("/x", body))).status).toBe(401);
    asClient("other");
    expect((await clientSuggest(req("/x", body))).status).toBe(401);
    expect(holder.payload.store["content-map-suggestions"]).toBeUndefined();
  });

  it("creates a pending client suggestion for the slug's client only (ignores sent ids), sanitised", async () => {
    asClient("away");
    const res = await clientSuggest(req("/x", body));
    expect(res.status).toBe(200);
    expect((await res.json()).suggestion).toMatchObject({ status: "pending", origin: "client", suggestedBy: "You", title: "Hiring devs x" });
    // Stored against the slug's client (7), never an id sent in the body.
    expect(holder.payload.store["content-map-suggestions"]?.[0]).toMatchObject({ client: 7, origin: "client" });
  });

  it("400s on bad input and 429s past the daily limit", async () => {
    // The fake store stamps createdAt from 2026-10-01; put "now" on that day so the 24 h window applies.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 1, 0, 30)));
    onTestFinished(() => { vi.useRealTimers(); });
    asClient("away");
    expect((await clientSuggest(req("/x", { ...body, topic: "other" }))).status).toBe(400);
    expect((await clientSuggest(req("/x", { ...body, slug: "../x" }))).status).toBe(400);
    for (let i = 0; i < 10; i++) expect((await clientSuggest(req("/x", body))).status).toBe(200);
    expect((await clientSuggest(req("/x", body))).status).toBe(429);
  });
});

describe("staff routes", () => {
  beforeEach(() => holder.payload.auth.mockResolvedValue({ user: { id: 1, name: "Peter Smith" } } as never));

  it("team suggestion → pending, then dismiss via decide", async () => {
    const res = await teamSuggest(req("/x", { clientId: "7", kind: "topic", title: "Hiring developers", why: "" }));
    const { suggestion } = await res.json();
    expect(suggestion).toMatchObject({ origin: "team", status: "pending", suggestedBy: "Peter" });
    const d = await decide(req("/x", { clientId: "7", id: suggestion.id, decision: "dismiss", reason: "Later" }));
    expect((await d.json()).suggestion).toMatchObject({ status: "dismissed", dismissReason: "Later" });
    expect((await decide(req("/x", { clientId: "7", id: suggestion.id, decision: "nope" }))).status).toBe(400);
  });

  it("staff routes 401 without a session", async () => {
    holder.payload.auth.mockResolvedValue({ user: null } as never);
    expect((await teamSuggest(req("/x", { clientId: "7" }))).status).toBe(401);
    expect((await decide(req("/x", { clientId: "7" }))).status).toBe(401);
    expect((await questions(req("/x", { clientId: "7" }))).status).toBe(401);
    expect((await citationsRun(req("/x", { clientId: "7" }))).status).toBe(401);
  });

  it("questions add/remove returns TrackedQuestionView[]", async () => {
    const res = await questions(req("/x", { clientId: "7", action: "add", topic: "vietnam", question: "Is Vietnam good for QA?" }));
    const list = (await res.json()).questions;
    expect(list).toEqual([expect.objectContaining({ topic: "vietnam", question: "Is Vietnam good for QA?", source: "team", checks: [] })]);
    const removed = await questions(req("/x", { clientId: "7", action: "remove", id: list[0].id }));
    expect((await removed.json()).questions).toEqual([]);
  });

  it("citations/run calls GT once and reuses the run", async () => {
    holder.payload.store["content-map-questions"] = [{ id: 1, client: 7, topic: "vietnam", question: "Is Vietnam good?", source: "team", active: true, questionGroup: "planned" }];
    fetchMock.mockImplementation(async (url: string) => (String(url).includes("/citations") ? new Response(JSON.stringify({ runId: "c1", status: "running" }), { status: 202 }) : new Response("{}", { status: 500 })));
    const first = await (await citationsRun(req("/x", { clientId: "7" }))).json();
    expect(first).toMatchObject({ runId: "c1", status: "running" });
    const again = await (await citationsRun(req("/x", { clientId: "7" }))).json();
    expect(again).toMatchObject({ runId: "c1", reused: true });
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/api/content-map/citations"))).toHaveLength(1);
  });
});

describe("POST /api/content-map/citations/ingest", () => {
  const result = { version: 1, clientId: "7", siteUrl: "https://a.com", generatedAt: "2026-10-22T10:00:00.000Z", engines: ["chatgpt"], questions: [], sources: [], stats: { questions: 0, checks: 0, okChecks: 0, clientCitedChecks: 0, clientMentionedChecks: 0, topDomains: [] } };
  it("needs the GT API key and upserts idempotently, queuing insights once", async () => {
    expect((await citationsIngest(req("/x", { clientId: "7", runId: "c1", status: "completed", result }))).status).toBe(401);
    const auth = { Authorization: "users API-Key cms-key" };
    const res = await citationsIngest(req("/x", { clientId: "7", runId: "c1", status: "completed", result }, auth));
    expect(await res.json()).toMatchObject({ ok: true, status: "completed", insightsPending: true });
    expect(afterMock).toHaveBeenCalledTimes(1);
    await citationsIngest(req("/x", { clientId: "7", runId: "c1", status: "failed", error: "x" }, auth));
    expect(holder.payload.store["content-map-citations"]).toHaveLength(1);
    expect(holder.payload.store["content-map-citations"]?.[0]?.status).toBe("completed");
    expect((await citationsIngest(req("/x", { clientId: "7", runId: "c1", status: "weird" }, auth))).status).toBe(400);
  });
});

describe("weekly chain", () => {
  it("an analysis ingest never starts the paid AI citation check, even when none ran for years", async () => {
    holder.payload.store["content-map-questions"] = [{ id: 1, client: 7, topic: "vietnam", question: "Is Vietnam good?", source: "team", active: true, questionGroup: "planned" }];
    holder.payload.store["content-map-citations"] = [{ client: 7, runId: "old", status: "completed", generatedAt: "2020-01-01T00:00:00.000Z" }];
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ runId: "w1", status: "running" }), { status: 202 }));
    const withIdeas = { ...sample, ai: { ...sample.ai, ideas: { model: "m", generatedAt: "2026-10-22T00:00:00.000Z" } } };
    const res = await ingest(req("/x", { clientId: "7", runId: "a1", status: "completed", snapshot: withIdeas }, { Authorization: "users API-Key cms-key" }));
    expect(res.status).toBe(200);
    expect(afterMock).toHaveBeenCalledTimes(1);
    await (afterMock.mock.calls[0]?.[0] as () => Promise<void>)();
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/api/content-map/citations"))).toHaveLength(0);
    expect(holder.payload.store["content-map-citations"]?.some((d) => d.runId === "w1")).toBe(false);
  });
});

describe("GET /api/content-map/view living fields", () => {
  it("returns plan/suggestions/citations through the allowlist", async () => {
    holder.payload.store["content-map-suggestions"] = [
      { id: 1, client: 7, kind: "topic", title: "Mine", status: "pending", origin: "client", suggestedBy: "Client" },
      { id: 2, client: 7, kind: "topic", title: "Team pending", status: "pending", origin: "team", suggestedBy: "Peter" },
    ];
    holder.payload.store["content-map-citations"] = [{ id: 3, client: 7, runId: "c", status: "failed", error: "DataForSEO down" }];
    asClient("away");
    const body = await (await view(new Request("http://cms.test/api/content-map/view?slug=away") as never)).json();
    expect(body.suggestions.map((s: { id: string }) => s.id)).toEqual(["1"]);
    expect(body.citations).toMatchObject({ status: "failed", error: null, insightsModel: "" });
    expect(JSON.stringify(body)).not.toContain("DataForSEO");
    expect(Array.isArray(body.plan)).toBe(true);
  });
});
