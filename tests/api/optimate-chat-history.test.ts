import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}));

const mockPayload = {
  auth: vi.fn(),
  find: vi.fn(),
};

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

import { GET } from "@/app/(frontend)/api/optimate-chat-history/route";

function makeReq(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3001/api/optimate-chat-history");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url, { method: "GET" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/optimate-chat-history", () => {
  it("returns 401 when unauthenticated", async () => {
    mockPayload.auth.mockResolvedValue({ user: null });
    const res = await GET(makeReq({ auditId: "5" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when neither auditId nor sessionId is supplied", async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 7, role: "manager" } });
    const res = await GET(makeReq({}));
    expect(res.status).toBe(400);
  });

  describe("?sessionId=...", () => {
    it("filters by the calling user when not admin", async () => {
      mockPayload.auth.mockResolvedValue({ user: { id: 7, role: "manager" } });
      mockPayload.find.mockResolvedValue({ docs: [] });

      await GET(makeReq({ sessionId: "abc-123" }));

      expect(mockPayload.find).toHaveBeenCalledTimes(1);
      const call = mockPayload.find.mock.calls[0][0];
      expect(call.collection).toBe("optimate-chat-turns");
      expect(call.where).toEqual({
        sessionId: { equals: "abc-123" },
        user: { equals: 7 },
      });
      expect(call.sort).toBe("createdAt");
    });

    it("omits the user filter for admin callers", async () => {
      mockPayload.auth.mockResolvedValue({ user: { id: 1, role: "admin" } });
      mockPayload.find.mockResolvedValue({ docs: [] });

      await GET(makeReq({ sessionId: "abc-123" }));

      const call = mockPayload.find.mock.calls[0][0];
      expect(call.where).toEqual({ sessionId: { equals: "abc-123" } });
    });

    it("maps turn rows into the response shape", async () => {
      mockPayload.auth.mockResolvedValue({ user: { id: 7, role: "manager" } });
      mockPayload.find.mockResolvedValue({
        docs: [
          {
            id: 1,
            role: "user",
            content: "hello",
            createdAt: "2026-05-12T10:00:00.000Z",
          },
          {
            id: 2,
            role: "assistant",
            content: "hi there",
            runId: "run-1",
            modelUsed: "claude-sonnet",
            createdAt: "2026-05-12T10:00:05.000Z",
          },
        ],
      });

      const res = await GET(makeReq({ sessionId: "abc-123" }));
      const data = await res.json();
      expect(data.sessionId).toBe("abc-123");
      expect(data.turns).toHaveLength(2);
      expect(data.turns[1]).toMatchObject({
        role: "assistant",
        content: "hi there",
        runId: "run-1",
        modelUsed: "claude-sonnet",
      });
    });
  });

  describe("?auditId=...", () => {
    it("groups turns by sessionId and returns a session list", async () => {
      mockPayload.auth.mockResolvedValue({ user: { id: 7, role: "manager" } });
      // Sorted desc by createdAt — newest first. Two sessions, three turns.
      mockPayload.find.mockResolvedValue({
        docs: [
          {
            id: 10,
            sessionId: "sess-b",
            role: "assistant",
            preview: "Sure, here are the numbers",
            content: "Sure, here are the numbers",
            createdAt: "2026-05-12T11:00:00.000Z",
          },
          {
            id: 9,
            sessionId: "sess-b",
            role: "user",
            preview: "Show me last week",
            content: "Show me last week",
            createdAt: "2026-05-12T10:59:00.000Z",
          },
          {
            id: 1,
            sessionId: "sess-a",
            role: "user",
            preview: "Hi",
            content: "Hi",
            createdAt: "2026-05-11T08:00:00.000Z",
          },
        ],
      });

      const res = await GET(makeReq({ auditId: "42" }));
      const data = await res.json();

      // Newest session first.
      expect(data.sessions).toHaveLength(2);
      expect(data.sessions[0].sessionId).toBe("sess-b");
      expect(data.sessions[0].turnCount).toBe(2);
      expect(data.sessions[0].firstMessage).toBe("Show me last week");
      expect(data.sessions[1].sessionId).toBe("sess-a");
      expect(data.sessions[1].turnCount).toBe(1);
    });

    it("applies ownership filter for non-admin callers", async () => {
      mockPayload.auth.mockResolvedValue({ user: { id: 7, role: "manager" } });
      mockPayload.find.mockResolvedValue({ docs: [] });

      await GET(makeReq({ auditId: "42" }));

      const call = mockPayload.find.mock.calls[0][0];
      expect(call.where).toEqual({
        audit: { equals: "42" },
        user: { equals: 7 },
      });
      expect(call.sort).toBe("-createdAt");
    });

    it("omits ownership filter for admin", async () => {
      mockPayload.auth.mockResolvedValue({ user: { id: 1, role: "admin" } });
      mockPayload.find.mockResolvedValue({ docs: [] });

      await GET(makeReq({ auditId: "42" }));

      const call = mockPayload.find.mock.calls[0][0];
      expect(call.where).toEqual({ audit: { equals: "42" } });
    });
  });
});
