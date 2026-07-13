import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockPayload = {
  auth: vi.fn(),
  findByID: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  db: {
    beginTransaction: vi.fn(),
    commitTransaction: vi.fn(),
    rollbackTransaction: vi.fn(),
  },
};

vi.mock("payload", () => ({
  createLocalReq: vi.fn(async ({ user }) => ({ user })),
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

vi.mock("@/lib/access", () => ({
  userHasFeature: vi.fn(() => true),
}));

import { POST } from "@/app/(frontend)/api/negative-keyword-lists/[id]/keywords/route";

function request(body: unknown): NextRequest {
  return new NextRequest("https://cms.example/api/negative-keyword-lists/13/keywords", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const list = {
  id: 13,
  client: 6,
  name: "Account wide",
  updatedAt: "2026-07-13T04:32:38.611Z",
  keywords: [
    { id: "a", keyword: "jobs", matchType: "phrase", flaggedForRemoval: true },
    { id: "b", keyword: "free", matchType: "exact", flaggedForRemoval: false },
    { id: "c", keyword: "course", matchType: "phrase", flaggedForRemoval: true },
  ],
};

describe("negative keyword list keyword mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } });
    mockPayload.db.beginTransaction.mockResolvedValue("tx-1");
    mockPayload.db.commitTransaction.mockResolvedValue(undefined);
    mockPayload.db.rollbackTransaction.mockResolvedValue(undefined);
    mockPayload.findByID.mockResolvedValue(list);
    mockPayload.update.mockImplementation(async ({ data }: { data: { keywords: unknown[] } }) => ({
      ...list,
      keywords: data.keywords,
      updatedAt: "2026-07-13T05:00:00.000Z",
    }));
    mockPayload.create.mockResolvedValue({ id: 1 });
  });

  it("rejects a stale browser snapshot without writing", async () => {
    const response = await POST(request({
      operation: "delete",
      keywordIds: ["a"],
      expectedUpdatedAt: "2026-07-13T04:00:00.000Z",
      expectedKeywordCount: 3,
    }), { params: Promise.resolve({ id: "13" }) });

    expect(response.status).toBe(409);
    expect(mockPayload.update).not.toHaveBeenCalled();
    expect(mockPayload.db.rollbackTransaction).toHaveBeenCalledWith("tx-1");
  });

  it("deletes only explicitly identified keywords from the server-fresh list", async () => {
    const response = await POST(request({
      operation: "delete",
      keywordIds: ["a", "c"],
      expectedUpdatedAt: list.updatedAt,
      expectedKeywordCount: 3,
    }), { params: Promise.resolve({ id: "13" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.keywordCount).toBe(1);
    expect(mockPayload.update).toHaveBeenCalledWith(expect.objectContaining({
      collection: "negative-keyword-lists",
      id: "13",
      data: { keywords: [list.keywords[1]] },
      req: expect.objectContaining({ transactionID: "tx-1" }),
    }));
    expect(mockPayload.db.commitTransaction).toHaveBeenCalledWith("tx-1");
  });

  it("updates one identified keyword without accepting a replacement array", async () => {
    const response = await POST(request({
      operation: "update",
      keywordId: "b",
      patch: { matchType: "phrase" },
      expectedUpdatedAt: list.updatedAt,
      expectedKeywordCount: 3,
    }), { params: Promise.resolve({ id: "13" }) });

    expect(response.status).toBe(200);
    expect(mockPayload.update).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        keywords: [
          list.keywords[0],
          { ...list.keywords[1], matchType: "phrase" },
          list.keywords[2],
        ],
      },
    }));
  });
});
