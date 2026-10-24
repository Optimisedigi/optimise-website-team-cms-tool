import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const payload = { auth: vi.fn(), find: vi.fn(), logger: { error: vi.fn() } };
vi.mock("payload", () => ({ getPayload: vi.fn(async () => payload) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

import { GET } from "@/app/(frontend)/api/notifications/route";

const get = (query: string) => GET(new NextRequest(`http://localhost/api/notifications${query}`));

describe("GET /api/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    payload.auth.mockResolvedValue({ user: { id: 7 } });
    payload.find.mockResolvedValue({ docs: [{ id: 5 }, { id: 4 }], totalDocs: 30, totalPages: 15 });
  });

  it("sorts newest first with id as the tie-break", async () => {
    await get("?limit=2");
    expect(payload.find).toHaveBeenCalledWith(expect.objectContaining({ sort: ["-createdAt", "-id"], limit: 2, page: 1 }));
  });

  it("returns the rows after a keyset cursor, combined with unreadOnly", async () => {
    const res = await get("?limit=2&unreadOnly=true&beforeCreatedAt=2026-10-22T02:42:00.000Z&beforeId=613");
    const where = payload.find.mock.calls[0]![0].where;
    expect(where.and).toEqual([
      { recipient: { equals: 7 } },
      { readAt: { exists: false } },
      {
        or: [
          { createdAt: { less_than: "2026-10-22T02:42:00.000Z" } },
          { and: [{ createdAt: { equals: "2026-10-22T02:42:00.000Z" } }, { id: { less_than: 613 } }] },
        ],
      },
    ]);
    expect(await res.json()).toMatchObject({ hasNextPage: true });
  });

  it("ignores a malformed cursor", async () => {
    await get("?beforeCreatedAt=nope&beforeId=613");
    expect(payload.find.mock.calls[0]![0].where.and).toEqual([{ recipient: { equals: 7 } }]);
  });

  it("reports no next page once the last rows are returned", async () => {
    payload.find.mockResolvedValue({ docs: [{ id: 2 }, { id: 1 }], totalDocs: 2, totalPages: 1 });
    const res = await get("?limit=2&beforeCreatedAt=2026-10-01T00:00:00.000Z&beforeId=3");
    expect(await res.json()).toMatchObject({ hasNextPage: false });
  });
});
