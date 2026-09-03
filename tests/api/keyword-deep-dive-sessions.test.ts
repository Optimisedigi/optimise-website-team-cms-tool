import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}));

const mockPayload = {
  auth: vi.fn(),
  findByID: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

// The route appends only the new keywords via a raw-SQL helper (a full-array
// payload.update blew SQLite's 32,766-variable cap on large lists).
const appendNklKeywords = vi.fn(async (_p: unknown, _id: number, _client: number, kws: unknown[]) => kws.length);
vi.mock("@/lib/nkl-append-keywords", () => ({ appendNklKeywords: (...args: any[]) => appendNklKeywords(...(args as [unknown, number, number, unknown[]])) }));

import { POST as applyToNkl } from "@/app/(frontend)/api/keyword-deep-dive-sessions/[id]/apply-to-nkl/route";

// ─── Helpers ───────────────────────────────────────────────────
function makeApplyRequest(sessionId: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(
    `http://localhost:3001/api/keyword-deep-dive-sessions/${sessionId}/apply-to-nkl`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

const mockNkl = {
  id: 42,
  name: "Test NKL",
  keywords: [
    { keyword: "existing kw", matchType: "exact", flaggedForRemoval: false },
  ],
};

const mockSession = {
  id: 7,
  client: 1,
  title: "Session 1",
  status: "pending",
  keywords: [
    { keyword: "new kw 1", matchType: "exact", flaggedForRemoval: false },
    { keyword: "new kw 2", matchType: "broad", flaggedForRemoval: false },
  ],
};

// ─── apply-to-nkl Tests ──────────────────────────────────────
describe("POST /api/keyword-deep-dive-sessions/[id]/apply-to-nkl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPayload.auth.mockResolvedValue({ user: { id: 1, role: "admin" } });
  });

  it("returns 400 when nklId is missing", async () => {
    const req = makeApplyRequest("7", { keywords: [{ keyword: "kw", matchType: "exact" }] });
    const res = await applyToNkl(req, { params: Promise.resolve({ id: "7" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 when keywords is empty", async () => {
    const req = makeApplyRequest("7", { nklId: "42", keywords: [] });
    const res = await applyToNkl(req, { params: Promise.resolve({ id: "7" }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 when session not found", async () => {
    vi.mocked(mockPayload.findByID).mockResolvedValueOnce(null);
    const req = makeApplyRequest("999", { nklId: "42", keywords: [{ keyword: "kw", matchType: "exact" }] });
    const res = await applyToNkl(req, { params: Promise.resolve({ id: "999" }) });
    expect(res.status).toBe(404);
  });

  it("returns 404 when NKL not found", async () => {
    vi.mocked(mockPayload.findByID)
      .mockResolvedValueOnce(mockSession)
      .mockResolvedValueOnce(null);
    const req = makeApplyRequest("7", { nklId: "999", keywords: [{ keyword: "kw", matchType: "exact" }] });
    const res = await applyToNkl(req, { params: Promise.resolve({ id: "7" }) });
    expect(res.status).toBe(404);
  });

  it("skips duplicate keywords and merges new ones", async () => {
    vi.mocked(mockPayload.findByID)
      .mockResolvedValueOnce(mockSession)
      .mockResolvedValueOnce(mockNkl);

    let updateCalls: any[] = [];
    vi.mocked(mockPayload.update).mockImplementation((opts: any) => {
      updateCalls.push(opts);
      return Promise.resolve({ id: opts.id });
    });

    const req = makeApplyRequest("7", {
      nklId: "42",
      keywords: [
        { keyword: "new kw 1", matchType: "exact" },  // new
        { keyword: "existing kw", matchType: "exact" }, // duplicate — should be skipped
      ],
    });
    const res = await applyToNkl(req, { params: Promise.resolve({ id: "7" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.applied).toBe(1); // only "new kw 1" added
    expect(body.skipped).toBe(1); // "existing kw" skipped

    // Only the non-duplicate keyword is appended to the NKL
    expect(appendNklKeywords).toHaveBeenCalledTimes(1);
    const [, nklId, , appended] = appendNklKeywords.mock.calls[0];
    expect(nklId).toBe(42);
    expect(appended).toEqual([{ keyword: "new kw 1", matchType: "exact" }]);

    // Session marked as applied
    expect(updateCalls[0].collection).toBe("keyword-deep-dive-sessions");
    expect(updateCalls[0].data.status).toBe("applied");
  });

  it("updates session status to applied with NKL reference", async () => {
    vi.mocked(mockPayload.findByID)
      .mockResolvedValueOnce(mockSession)
      .mockResolvedValueOnce({ ...mockNkl, keywords: [] });

    let updateCalls: any[] = [];
    vi.mocked(mockPayload.update).mockImplementation((opts: any) => {
      updateCalls.push(opts);
      return Promise.resolve({ id: opts.id });
    });

    const req = makeApplyRequest("7", {
      nklId: "42",
      keywords: [{ keyword: "kw", matchType: "phrase" }],
    });
    const res = await applyToNkl(req, { params: Promise.resolve({ id: "7" }) });
    expect(res.status).toBe(200);

    const sessionUpdate = updateCalls[0];
    expect(sessionUpdate.data.status).toBe("applied");
    expect(sessionUpdate.data.appliedToNKL).toBe(42);
  });
});
