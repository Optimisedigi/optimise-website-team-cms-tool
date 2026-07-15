import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";

// Real domain cleaner + all other helpers; only the single-competitor fetch is
// mocked so we control success/failure without touching Scrapling/Blob.
vi.mock("@/lib/scrapling-service", () => ({
  extractSocialLinks: vi.fn(),
  checkMetaAdsViaScrapling: vi.fn(),
}));
vi.mock("@/lib/blob-upload", () => ({ uploadScreenshotToBlob: vi.fn() }));

vi.mock("@/lib/proposal-meta-ads", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/proposal-meta-ads")>();
  return { ...actual, fetchMetaAdsForCompetitor: vi.fn() };
});

import { fetchMetaAdsForCompetitor } from "@/lib/proposal-meta-ads";
import {
  initMetaAdsJob,
  processNextBatch,
  recoverStaleMetaJob,
  sweepStaleMetaJobs,
  parseJobState,
  computeProgress,
  isLeaseExpired,
  META_ADS_LEASE_MS,
  type MetaAdsJobState,
} from "@/lib/proposal-meta-ads-job";

const mockFetchOne = fetchMetaAdsForCompetitor as unknown as Mock;

// ── In-memory Payload fake ──────────────────────────────────────────────
function clone<T>(v: T): T {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

function makePayload(opts?: { failAnalysisUpdate?: () => boolean }) {
  const collections: Record<string, Map<string, any>> = {
    "client-proposals": new Map(),
    "competitor-analyses": new Map(),
  };
  return {
    _collections: collections,
    findByID: vi.fn(async ({ collection, id }: any) => {
      const doc = collections[collection].get(String(id));
      if (!doc) throw new Error(`not found ${collection}/${id}`);
      return clone(doc);
    }),
    update: vi.fn(async ({ collection, id, data }: any) => {
      if (collection === "competitor-analyses" && opts?.failAnalysisUpdate?.()) {
        throw new Error("simulated analysis write failure");
      }
      const cur = collections[collection].get(String(id)) || { id };
      const next = { ...cur, ...clone(data), id: cur.id ?? id };
      collections[collection].set(String(id), next);
      return clone(next);
    }),
    find: vi.fn(async ({ collection, where }: any) => {
      const all = [...collections[collection].values()];
      const eq = where?.metaAdsStatus?.equals;
      const docs = eq ? all.filter((d) => d.metaAdsStatus === eq) : all;
      return { docs: clone(docs) };
    }),
  };
}

function seed(payload: ReturnType<typeof makePayload>, competitorCount: number) {
  const competitors = Array.from({ length: competitorCount }, (_, i) => ({
    domain: `comp-${i}.com`,
    name: `Comp ${i}`,
    metaAds: null,
  }));
  payload._collections["competitor-analyses"].set("50", { id: 50, competitors });
  payload._collections["client-proposals"].set("1", {
    id: 1,
    competitorAnalysis: 50,
    metaAdsStatus: "idle",
    metaAdsJobState: null,
    metaAdsUpdatedAt: null,
  });
}

function proposal(payload: ReturnType<typeof makePayload>) {
  return payload._collections["client-proposals"].get("1");
}
function state(payload: ReturnType<typeof makePayload>): MetaAdsJobState {
  return parseJobState(proposal(payload).metaAdsJobState)!;
}
function analysisComps(payload: ReturnType<typeof makePayload>) {
  return payload._collections["competitor-analyses"].get("50").competitors;
}

function okOutcome(domain: string) {
  return { ok: true, domain, metaAds: { isRunningAds: true, activeAdCount: 1, adScreenshots: ["u"] }, socialLinks: { facebook: domain } };
}
function failOutcome(domain: string) {
  return { ok: false, domain, error: "scrapling down" };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.NEXT_PUBLIC_SERVER_URL = "http://localhost:3004";
  process.env.INTERNAL_API_KEY = "test-key";
  globalThis.fetch = vi.fn(async () => new Response("{}", { status: 202 })) as any;
});

afterEach(() => vi.restoreAllMocks());

describe("initMetaAdsJob", () => {
  it("creates a stable snapshot with index/domain and total, running status", async () => {
    const payload = makePayload();
    seed(payload, 3);

    const res = await initMetaAdsJob(payload as any, 1);

    expect(res.created).toBe(true);
    expect(res.shouldDispatch).toBe(true);
    expect(res.state.total).toBe(3);
    expect(res.state.cursor).toBe(0);
    expect(res.state.items).toEqual([
      { index: 0, domain: "comp-0.com" },
      { index: 1, domain: "comp-1.com" },
      { index: 2, domain: "comp-2.com" },
    ]);
    expect(proposal(payload).metaAdsStatus).toBe("running");
  });

  it("returns existing progress for a healthy running job instead of duplicating", async () => {
    const payload = makePayload();
    seed(payload, 3);
    const first = await initMetaAdsJob(payload as any, 1);

    const second = await initMetaAdsJob(payload as any, 1);
    expect(second.created).toBe(false);
    expect(second.shouldDispatch).toBe(false);
    expect(second.state.jobId).toBe(first.state.jobId);
  });

  it("creates a fresh job (new jobId) after a terminal state", async () => {
    const payload = makePayload();
    seed(payload, 1);
    const first = await initMetaAdsJob(payload as any, 1);
    // force terminal
    const term = { ...state(payload), completedAt: new Date().toISOString() };
    await payload.update({ collection: "client-proposals", id: 1, data: { metaAdsJobState: term, metaAdsStatus: "completed" } });

    const retry = await initMetaAdsJob(payload as any, 1);
    expect(retry.created).toBe(true);
    expect(retry.state.jobId).not.toBe(first.state.jobId);
  });

  it("resumes (dispatch) a valid non-terminal job whose lease expired", async () => {
    const payload = makePayload();
    seed(payload, 2);
    await initMetaAdsJob(payload as any, 1);
    // simulate a stale interrupted job: old heartbeat, lease expired, still running
    const stale = { ...state(payload), leaseToken: "old", leaseExpiresAt: new Date(Date.now() - 1).toISOString() };
    await payload.update({
      collection: "client-proposals",
      id: 1,
      data: { metaAdsJobState: stale, metaAdsUpdatedAt: new Date(Date.now() - META_ADS_LEASE_MS - 1000).toISOString() },
    });

    const res = await initMetaAdsJob(payload as any, 1);
    expect(res.created).toBe(false);
    expect(res.shouldDispatch).toBe(true);
  });

  it("marks completed immediately when there are no competitor domains", async () => {
    const payload = makePayload();
    payload._collections["competitor-analyses"].set("50", { id: 50, competitors: [{ name: "no domain" }] });
    payload._collections["client-proposals"].set("1", { id: 1, competitorAnalysis: 50, metaAdsStatus: "idle" });

    const res = await initMetaAdsJob(payload as any, 1);
    expect(res.terminal).toBe(true);
    expect(proposal(payload).metaAdsStatus).toBe("completed");
  });

  it("throws when the proposal has no linked competitor analysis", async () => {
    const payload = makePayload();
    payload._collections["client-proposals"].set("1", { id: 1, competitorAnalysis: null });
    await expect(initMetaAdsJob(payload as any, 1)).rejects.toThrow(/competitor analysis/i);
  });
});

describe("processNextBatch", () => {
  it("processes exactly two competitors and never exceeds two browser ops per batch", async () => {
    const payload = makePayload();
    seed(payload, 5);
    await initMetaAdsJob(payload as any, 1);
    mockFetchOne.mockImplementation(async (c: any) => okOutcome(c.domain));

    const res = await processNextBatch(payload as any, 1);

    expect(mockFetchOne).toHaveBeenCalledTimes(2);
    expect(res.done).toBe(false);
    expect(res.shouldDispatch).toBe(true);
    expect(state(payload).cursor).toBe(2);
    expect(state(payload).completed).toBe(2);
  });

  it("persists each success onto the analysis before advancing the cursor", async () => {
    const payload = makePayload();
    seed(payload, 2);
    await initMetaAdsJob(payload as any, 1);
    mockFetchOne.mockImplementation(async (c: any) => okOutcome(c.domain));

    await processNextBatch(payload as any, 1);

    const comps = analysisComps(payload);
    expect(comps[0].metaAds.isRunningAds).toBe(true);
    expect(comps[1].metaAds.isRunningAds).toBe(true);
    expect(state(payload).cursor).toBe(2);
  });

  it("records a failed item and still processes the other, without stopping", async () => {
    const payload = makePayload();
    seed(payload, 2);
    await initMetaAdsJob(payload as any, 1);
    mockFetchOne
      .mockImplementationOnce(async (c: any) => failOutcome(c.domain))
      .mockImplementationOnce(async (c: any) => okOutcome(c.domain));

    const res = await processNextBatch(payload as any, 1);

    expect(res.done).toBe(true); // both processed => terminal
    const s = state(payload);
    expect(s.failed).toBe(1);
    expect(s.completed).toBe(1);
    expect(s.failedItems[0].domain).toBe("comp-0.com");
    expect(analysisComps(payload)[1].metaAds.isRunningAds).toBe(true);
    expect(proposal(payload).metaAdsStatus).toBe("failed");
  });

  it("resumes from the cursor across successive batches", async () => {
    const payload = makePayload();
    seed(payload, 3);
    await initMetaAdsJob(payload as any, 1);
    mockFetchOne.mockImplementation(async (c: any) => okOutcome(c.domain));

    const b1 = await processNextBatch(payload as any, 1);
    expect(b1.done).toBe(false);
    expect(state(payload).cursor).toBe(2);

    const b2 = await processNextBatch(payload as any, 1);
    expect(b2.done).toBe(true);
    expect(state(payload).cursor).toBe(3);
    expect(state(payload).completed).toBe(3);
    expect(proposal(payload).metaAdsStatus).toBe("completed");
  });

  it("rejects a worker whose expected jobId does not match", async () => {
    const payload = makePayload();
    seed(payload, 2);
    await initMetaAdsJob(payload as any, 1);
    mockFetchOne.mockImplementation(async (c: any) => okOutcome(c.domain));

    const res = await processNextBatch(payload as any, 1, { expectedJobId: "not-the-job" });
    expect(res.done).toBe(false);
    expect(res.reason).toBe("job-mismatch");
    expect(mockFetchOne).not.toHaveBeenCalled();
    expect(state(payload).cursor).toBe(0);
  });

  it("does not run a batch when another worker holds a fresh lease", async () => {
    const payload = makePayload();
    seed(payload, 2);
    await initMetaAdsJob(payload as any, 1);
    const held = { ...state(payload), leaseToken: "other", leaseExpiresAt: new Date(Date.now() + META_ADS_LEASE_MS).toISOString() };
    await payload.update({ collection: "client-proposals", id: 1, data: { metaAdsJobState: held } });

    const res = await processNextBatch(payload as any, 1);
    expect(res.reason).toBe("busy");
    expect(res.shouldDispatch).toBe(false);
    expect(mockFetchOne).not.toHaveBeenCalled();
  });

  it("retries infrastructure failures only up to the limit then fails terminally", async () => {
    let fail = true;
    const payload = makePayload({ failAnalysisUpdate: () => fail });
    seed(payload, 1);
    await initMetaAdsJob(payload as any, 1);
    mockFetchOne.mockImplementation(async (c: any) => okOutcome(c.domain));

    // attempt 1 + 2: infra error, retryable (not terminal)
    const r1 = await processNextBatch(payload as any, 1);
    expect(r1.reason).toBe("infra-retry");
    expect(proposal(payload).metaAdsStatus).toBe("running");
    const r2 = await processNextBatch(payload as any, 1);
    expect(r2.reason).toBe("infra-retry");
    // attempt 3: exceeds limit => terminal failed, prior successes preserved
    const r3 = await processNextBatch(payload as any, 1);
    expect(r3.done).toBe(true);
    expect(proposal(payload).metaAdsStatus).toBe("failed");
    expect(state(payload).completedAt).toBeTruthy();
    fail = false;
  });

  it("always writes a terminal completed status when all succeed", async () => {
    const payload = makePayload();
    seed(payload, 2);
    await initMetaAdsJob(payload as any, 1);
    mockFetchOne.mockImplementation(async (c: any) => okOutcome(c.domain));

    const res = await processNextBatch(payload as any, 1);
    expect(res.done).toBe(true);
    expect(proposal(payload).metaAdsStatus).toBe("completed");
    expect(proposal(payload).metaAdsError).toBeNull();
    expect(state(payload).completedAt).toBeTruthy();
  });
});

describe("recovery", () => {
  it("leaves a healthy job (fresh heartbeat) untouched", async () => {
    const payload = makePayload();
    seed(payload, 2);
    await initMetaAdsJob(payload as any, 1);
    await payload.update({ collection: "client-proposals", id: 1, data: { metaAdsUpdatedAt: new Date().toISOString() } });

    const outcome = await recoverStaleMetaJob(payload as any, proposal(payload));
    expect(outcome).toBe("healthy");
    expect(state(payload).recoveryAttempts).toBe(0);
  });

  it("resumes a stale job while attempts remain", async () => {
    const payload = makePayload();
    seed(payload, 3);
    await initMetaAdsJob(payload as any, 1);
    await payload.update({ collection: "client-proposals", id: 1, data: { metaAdsUpdatedAt: new Date(Date.now() - META_ADS_LEASE_MS - 1000).toISOString() } });

    const outcome = await recoverStaleMetaJob(payload as any, proposal(payload));
    expect(outcome).toBe("resumed");
    expect(state(payload).recoveryAttempts).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalled(); // dispatched
  });

  it("fails a stale job terminally once recoveries are exhausted", async () => {
    const payload = makePayload();
    seed(payload, 3);
    await initMetaAdsJob(payload as any, 1);
    const exhausted = {
      ...state(payload),
      recoveryAttempts: 2,
    };
    await payload.update({
      collection: "client-proposals",
      id: 1,
      data: { metaAdsJobState: exhausted, metaAdsUpdatedAt: new Date(Date.now() - META_ADS_LEASE_MS - 1000).toISOString() },
    });

    const outcome = await recoverStaleMetaJob(payload as any, proposal(payload));
    expect(outcome).toBe("failed");
    expect(proposal(payload).metaAdsStatus).toBe("failed");
    expect(state(payload).completedAt).toBeTruthy();
    expect(computeProgress(state(payload)).processed).toBe(3);
  });

  it("force-fails a legacy running proposal with no durable job state", async () => {
    const payload = makePayload();
    payload._collections["client-proposals"].set("1", {
      id: 1,
      competitorAnalysis: 50,
      metaAdsStatus: "running",
      metaAdsJobState: null,
      metaAdsUpdatedAt: new Date(Date.now() - META_ADS_LEASE_MS - 1000).toISOString(),
    });

    const outcome = await recoverStaleMetaJob(payload as any, proposal(payload));
    expect(outcome).toBe("failed");
    expect(proposal(payload).metaAdsStatus).toBe("failed");
  });

  it("sweepStaleMetaJobs returns separate resumed/failed ids", async () => {
    const payload = makePayload();
    seed(payload, 2);
    await initMetaAdsJob(payload as any, 1);
    await payload.update({ collection: "client-proposals", id: 1, data: { metaAdsUpdatedAt: new Date(Date.now() - META_ADS_LEASE_MS - 1000).toISOString() } });

    const result = await sweepStaleMetaJobs(payload as any);
    expect(result.resumed).toEqual([1]);
    expect(result.failed).toEqual([]);
  });
});

describe("helpers", () => {
  it("isLeaseExpired true for null lease and past expiry", () => {
    const base = { leaseToken: null, leaseExpiresAt: null } as any;
    expect(isLeaseExpired(base)).toBe(true);
    expect(isLeaseExpired({ leaseToken: "x", leaseExpiresAt: new Date(Date.now() - 1).toISOString() } as any)).toBe(true);
    expect(isLeaseExpired({ leaseToken: "x", leaseExpiresAt: new Date(Date.now() + 10000).toISOString() } as any)).toBe(false);
  });

  it("computeProgress percent + processed", () => {
    const p = computeProgress({ jobId: "j", completed: 3, failed: 1, total: 8, startedAt: "s", completedAt: null } as any);
    expect(p.processed).toBe(4);
    expect(p.percent).toBe(50);
  });
});
