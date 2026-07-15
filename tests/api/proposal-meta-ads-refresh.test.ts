import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { NextRequest } from "next/server";

// Invoke after() callbacks directly so worker dispatch is observable in tests.
const afterCallbacks: Array<() => unknown> = [];
vi.mock("next/server", async (importActual) => {
  const actual = await importActual<typeof import("next/server")>();
  return {
    ...actual,
    after: (fn: () => unknown) => {
      afterCallbacks.push(fn);
      return Promise.resolve(fn());
    },
  };
});

const mockPayload = {
  auth: vi.fn(),
  findByID: vi.fn(),
  update: vi.fn(),
};
vi.mock("payload", () => ({ getPayload: vi.fn(() => Promise.resolve(mockPayload)) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

vi.mock("@/lib/proposal-meta-ads-job", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/proposal-meta-ads-job")>();
  return {
    ...actual,
    initMetaAdsJob: vi.fn(),
    processNextBatch: vi.fn(),
    dispatchMetaAdsWorker: vi.fn(() => Promise.resolve(true)),
  };
});

import { POST as refreshPOST } from "@/app/(frontend)/api/proposals/[id]/refresh-meta-ads/route";
import { POST as workerPOST } from "@/app/(frontend)/api/proposals/[id]/refresh-meta-ads/worker/route";
import { initMetaAdsJob, processNextBatch, dispatchMetaAdsWorker } from "@/lib/proposal-meta-ads-job";

const mockInit = initMetaAdsJob as Mock;
const mockBatch = processNextBatch as Mock;
const mockDispatch = dispatchMetaAdsWorker as Mock;

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function sampleState(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    jobId: "job-1",
    competitorAnalysisId: 50,
    items: [{ index: 0, domain: "a.com" }, { index: 1, domain: "b.com" }],
    cursor: 0,
    total: 2,
    completed: 0,
    failed: 0,
    failedItems: [],
    startedAt: new Date().toISOString(),
    completedAt: null,
    leaseToken: null,
    leaseExpiresAt: null,
    recoveryAttempts: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.INTERNAL_API_KEY = "test-key";
});

describe("POST /api/proposals/[id]/refresh-meta-ads", () => {
  it("returns 401 without an authenticated user", async () => {
    mockPayload.auth.mockResolvedValue({ user: null });
    const req = new NextRequest("http://localhost:3004/api/proposals/1/refresh-meta-ads", { method: "POST" });
    const res = await refreshPOST(req, params("1"));
    expect(res.status).toBe(401);
    expect(mockInit).not.toHaveBeenCalled();
  });

  it("initializes a new job, dispatches a worker, returns 202 with progress", async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } });
    mockInit.mockResolvedValue({ state: sampleState(), created: true, shouldDispatch: true, terminal: false });

    const req = new NextRequest("http://localhost:3004/api/proposals/1/refresh-meta-ads", { method: "POST" });
    const res = await refreshPOST(req, params("1"));
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body.status).toBe("running");
    expect(body.total).toBe(2);
    expect(body.processed).toBe(0);
    expect(mockDispatch).toHaveBeenCalledWith("1", "http://localhost:3004");
  });

  it("does not dispatch a duplicate worker for an already-active job", async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } });
    mockInit.mockResolvedValue({
      state: sampleState({ cursor: 1, completed: 1 }),
      created: false,
      shouldDispatch: false,
      terminal: false,
    });

    const req = new NextRequest("http://localhost:3004/api/proposals/1/refresh-meta-ads", { method: "POST" });
    const res = await refreshPOST(req, params("1"));
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body.processed).toBe(1);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("reinitializes a legacy stuck job (init resolves a fresh/resumed job)", async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } });
    mockInit.mockResolvedValue({ state: sampleState({ jobId: "new-job" }), created: true, shouldDispatch: true, terminal: false });

    const req = new NextRequest("http://localhost:3004/api/proposals/1/refresh-meta-ads", { method: "POST" });
    const res = await refreshPOST(req, params("1"));

    expect(res.status).toBe(202);
    expect(mockDispatch).toHaveBeenCalled();
  });

  it("returns 400 when init throws (no competitor analysis)", async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } });
    mockInit.mockRejectedValue(new Error("No linked competitor analysis found for this proposal."));

    const req = new NextRequest("http://localhost:3004/api/proposals/1/refresh-meta-ads", { method: "POST" });
    const res = await refreshPOST(req, params("1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/competitor analysis/i);
  });
});

describe("POST /api/proposals/[id]/refresh-meta-ads/worker", () => {
  it("rejects requests without the internal key", async () => {
    const req = new NextRequest("http://localhost:3004/api/proposals/1/refresh-meta-ads/worker", { method: "POST" });
    const res = await workerPOST(req, params("1"));
    expect(res.status).toBe(401);
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it("runs one batch and dispatches the next when not done", async () => {
    mockBatch.mockResolvedValue({ done: false, state: sampleState({ cursor: 2 }), shouldDispatch: true });
    const req = new NextRequest("http://localhost:3004/api/proposals/1/refresh-meta-ads/worker", {
      method: "POST",
      headers: { "x-internal-key": "test-key" },
    });
    const res = await workerPOST(req, params("1"));
    expect(res.status).toBe(202);
    // after() ran synchronously via the mock
    await vi.waitFor(() => expect(mockBatch).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(mockDispatch).toHaveBeenCalledWith("1", "http://localhost:3004"));
  });

  it("does not dispatch another batch once the job is done", async () => {
    mockBatch.mockResolvedValue({ done: true, state: sampleState({ cursor: 2, completedAt: new Date().toISOString() }), shouldDispatch: false });
    const req = new NextRequest("http://localhost:3004/api/proposals/1/refresh-meta-ads/worker", {
      method: "POST",
      headers: { "x-internal-key": "test-key" },
    });
    const res = await workerPOST(req, params("1"));
    expect(res.status).toBe(202);
    await vi.waitFor(() => expect(mockBatch).toHaveBeenCalledTimes(1));
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
