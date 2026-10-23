import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sample from "../../fixtures/content-map-snapshot-sample.json";
import {
  applyRetention,
  buildAnalyseRequest,
  buildArticles,
  requestRefresh,
  triggerContentMapRun,
  upsertRun,
} from "@/lib/content-map/snapshots";
import type { Payload } from "payload";
import { createFakePayload, jsonResponse, type FakePayload } from "./fake-payload";

const NOW = Date.parse("2026-10-23T12:00:00.000Z");
const now = () => NOW;
const asPayload = (p: FakePayload) => p as unknown as Payload;
const client = {
  id: 7,
  name: "Away",
  websiteUrl: "https://awaydigitalteams.com",
  contentMapEnabled: true,
  topicAuthorities: [{ name: "Vietnam", primary: true }, { name: "Cost" }],
};

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.stubEnv("GROWTH_TOOLS_URL", "http://gt.test/");
  vi.stubEnv("INTERNAL_API_KEY", "internal");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("AnalyseRequest", () => {
  it("drops archived/trashed posts, caps at 500 and maps fields", () => {
    const posts = [
      { id: 1, title: "A", slug: "a", status: "published", category: "Cost", markdownContent: "# A" },
      { id: 2, title: "B", slug: "b", status: "archived" },
      { id: 3, title: "C", slug: "c", status: "draft", deletedAt: "2026-01-01" },
      { id: 4, title: "D", slug: "d", status: "" },
    ];
    expect(buildArticles(posts)).toEqual([
      { cmsId: "1", title: "A", slug: "a", status: "published", category: "Cost", markdown: "# A" },
      { cmsId: "4", title: "D", slug: "d", status: "draft" },
    ]);
    const many = Array.from({ length: 600 }, (_, i) => ({ id: i, title: `${i}`, slug: `${i}`, status: "draft" }));
    expect(buildArticles(many)).toHaveLength(500);
  });

  it("sends authorities, articles and every decision to GT", async () => {
    const p = createFakePayload({
      clients: [client],
      "blog-posts": [{ id: 1, client: 7, title: "A", slug: "a", status: "published" }, { id: 2, client: 8, title: "X", slug: "x", status: "draft" }],
      "internal-link-suggestions": [
        { client: 7, origin: "content-map", opportunityKey: "/a>/b", status: "approved" },
        { client: 7, origin: "content-map", opportunityKey: "/c>/d", status: "rejected" },
        { client: 7, origin: "manual", opportunityKey: "/e>/f", status: "approved" },
      ],
    });
    fetchMock.mockResolvedValue(jsonResponse(202, { runId: "run-1", status: "running" }));
    const res = await triggerContentMapRun(asPayload(p), "7", "full", now);
    expect(res.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://gt.test/api/content-map/analyse");
    expect((init.headers as Record<string, string>)["x-internal-key"]).toBe("internal");
    expect(JSON.parse(String(init.body))).toEqual(
      buildAnalyseRequest({
        clientId: "7",
        siteUrl: client.websiteUrl,
        mode: "full",
        authorities: [
          { key: "vietnam", name: "Vietnam", primary: true },
          { key: "cost", name: "Cost", primary: false },
        ],
        posts: [{ id: 1, title: "A", slug: "a", status: "published" }],
        decisions: [
          { key: "/a>/b", decision: "accepted" },
          { key: "/c>/d", decision: "dismissed" },
        ],
      }),
    );
    expect(p.store["content-map-snapshots"]?.[0]).toMatchObject({ runId: "run-1", status: "running", client: 7 });
  });
});

describe("run reuse", () => {
  it("reuses a running run started under 30 minutes ago without calling GT", async () => {
    const p = createFakePayload({
      clients: [client],
      "content-map-snapshots": [{ client: 7, runId: "r0", status: "running", startedAt: new Date(NOW - 29 * 60_000).toISOString() }],
    });
    const res = await triggerContentMapRun(asPayload(p), "7", "full", now);
    expect(res).toMatchObject({ ok: true, reused: true, run: { runId: "r0" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts a new run when the running one is stale, adopting GT's 409 runId", async () => {
    const p = createFakePayload({
      clients: [client],
      "content-map-snapshots": [{ client: 7, runId: "old", status: "running", startedAt: new Date(NOW - 31 * 60_000).toISOString() }],
    });
    fetchMock.mockResolvedValue(jsonResponse(409, { runId: "gt-run" }));
    const res = await triggerContentMapRun(asPayload(p), "7", "full", now);
    expect(res).toMatchObject({ ok: true, reused: true, run: { runId: "gt-run", status: "running" } });
  });

  it("refuses clients that are off, have no site or no authorities", async () => {
    const p = createFakePayload({ clients: [{ ...client, contentMapEnabled: false }, { ...client, id: 8, websiteUrl: "" }] });
    expect(await triggerContentMapRun(asPayload(p), "7", "full", now)).toMatchObject({ ok: false, status: 400 });
    expect(await triggerContentMapRun(asPayload(p), "8", "full", now)).toMatchObject({ ok: false, status: 400 });
    expect(await triggerContentMapRun(asPayload(p), "99", "full", now)).toMatchObject({ ok: false, status: 404 });
  });

  it("reports GT failures as 502", async () => {
    const p = createFakePayload({ clients: [client] });
    fetchMock.mockResolvedValue(jsonResponse(400, { error: "bad url" }));
    expect(await triggerContentMapRun(asPayload(p), "7", "full", now)).toMatchObject({ ok: false, status: 502 });
  });
});

describe("upsertRun + retention", () => {
  it("is idempotent by runId and hands pendingRefresh back once", async () => {
    const p = createFakePayload({
      "content-map-snapshots": [{ client: 7, runId: "r1", status: "running", pendingRefresh: true, startedAt: "2026-10-23T11:00:00.000Z" }],
    });
    const first = await upsertRun(asPayload(p), { clientId: "7", runId: "r1", status: "completed", snapshot: sample }, now);
    expect(first.pendingRefresh).toBe(true);
    expect(first.doc).toMatchObject({ status: "completed", phase: "done", pendingRefresh: false, generatedAt: sample.generatedAt });
    const again = await upsertRun(asPayload(p), { clientId: "7", runId: "r1", status: "completed", snapshot: sample }, now);
    expect(again.pendingRefresh).toBe(false);
    expect(p.store["content-map-snapshots"]).toHaveLength(1);
  });

  it("marks a completed push with an invalid snapshot as failed", async () => {
    const p = createFakePayload();
    const out = await upsertRun(asPayload(p), { clientId: "7", runId: "r2", status: "completed", snapshot: { version: 2 } }, now);
    expect(out.doc).toMatchObject({ status: "failed", error: "Snapshot missing or invalid", client: 7 });
  });

  it("keeps the latest 12 completed plus running runs", async () => {
    const completed = Array.from({ length: 14 }, (_, i) => ({ id: i + 1, client: 7, runId: `c${i}`, status: "completed" }));
    const p = createFakePayload({
      "content-map-snapshots": [
        { id: 100, client: 7, runId: "old-fail", status: "failed" },
        ...completed,
        { id: 200, client: 7, runId: "live", status: "running" },
        { id: 300, client: 8, runId: "other", status: "completed" },
      ],
    });
    expect(await applyRetention(asPayload(p), "7")).toBe(3);
    const left = p.store["content-map-snapshots"]?.map((d) => d.runId);
    expect(left).toEqual([...completed.slice(2).map((d) => d.runId), "live", "other"]);
  });
});

describe("requestRefresh", () => {
  it("flags the active run instead of starting a second one", async () => {
    const p = createFakePayload({
      clients: [client],
      "content-map-snapshots": [{ id: 5, client: 7, runId: "r", status: "running", startedAt: new Date(NOW - 60_000).toISOString() }],
    });
    await requestRefresh(asPayload(p), "7", now);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(p.store["content-map-snapshots"]?.[0]?.pendingRefresh).toBe(true);
  });

  it("starts a refresh run when nothing is running", async () => {
    const p = createFakePayload({ clients: [client] });
    fetchMock.mockResolvedValue(jsonResponse(202, { runId: "r9" }));
    await requestRefresh(asPayload(p), "7", now);
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).mode).toBe("refresh");
  });
});
