import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockPayload = {
  find: vi.fn(),
  auth: vi.fn(),
  logger: { error: vi.fn() },
};

vi.mock("payload", () => ({ getPayload: vi.fn(() => Promise.resolve(mockPayload)) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

import { GET } from "@/app/(frontend)/api/match-type-violations/route";

beforeEach(() => {
  mockPayload.find.mockReset().mockResolvedValue({ docs: [], totalDocs: 0, totalPages: 0, page: 1 });
  mockPayload.auth.mockResolvedValue({ user: { id: 1 } });
});

describe("GET /api/match-type-violations aiDecision filters", () => {
  it("restricts to triaged rows when aiDecided=true", async () => {
    await GET(
      new NextRequest("https://cms.example/api/match-type-violations?status=pending&aiDecided=true"),
    );
    const where = mockPayload.find.mock.calls[0][0].where;
    expect(where.and).toEqual(expect.arrayContaining([{ aiDecidedAt: { exists: true } }]));
  });

  it("filters to a single bucket with aiDecision", async () => {
    await GET(new NextRequest("https://cms.example/api/match-type-violations?aiDecision=competitor"));
    const where = mockPayload.find.mock.calls[0][0].where;
    expect(where.and).toEqual(expect.arrayContaining([{ aiDecision: { equals: "competitor" } }]));
  });

  it("adds neither clause by default", async () => {
    await GET(new NextRequest("https://cms.example/api/match-type-violations"));
    const where = mockPayload.find.mock.calls[0][0].where;
    const json = JSON.stringify(where ?? {});
    expect(json).not.toContain("aiDecided");
    expect(json).not.toContain("aiDecision");
  });
});
