import { beforeEach, describe, expect, it, vi } from "vitest";

const { payload } = vi.hoisted(() => ({
  payload: {
    find: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
    db: {
      beginTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      rollbackTransaction: vi.fn(),
    },
  },
}));

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue(payload),
  createLocalReq: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

import { POST } from "@/app/(frontend)/api/google-ads-estimate-usage/route";

describe("POST /api/google-ads-estimate-usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUDIT_API_KEY = "internal-key";
    payload.find.mockResolvedValue({ docs: [{ id: 7 }] });
    payload.create.mockResolvedValue({ id: 1 });
    payload.count.mockResolvedValue({ totalDocs: 3 });
    payload.db.beginTransaction.mockResolvedValue("tx-1");
    payload.db.commitTransaction.mockResolvedValue(undefined);
    payload.db.rollbackTransaction.mockResolvedValue(undefined);
  });

  it("records matching notification and activity entries at the supplied event time", async () => {
    const usedAt = "2026-09-08T01:02:03.000Z";
    const request = new Request("http://localhost/api/google-ads-estimate-usage", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "internal-key" },
      body: JSON.stringify({ keyword: "plumber", targetArea: "Perth", status: "success", source: "live", usedAt }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(payload.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      collection: "notifications",
      data: expect.objectContaining({ createdAt: usedAt }),
    }));
    expect(payload.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      collection: "activity-log",
      data: expect.objectContaining({
        type: "google_ads_keyword_cost_finder_used",
        createdAt: usedAt,
      }),
    }));
    expect(payload.db.commitTransaction).toHaveBeenCalledWith("tx-1");
  });

  it("still records activity when no notification recipient exists", async () => {
    payload.find.mockResolvedValue({ docs: [] });
    const request = new Request("http://localhost/api/google-ads-estimate-usage", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "internal-key" },
      body: JSON.stringify({ keyword: "plumber" }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ stored: false, activityStored: true });
    expect(payload.create).toHaveBeenCalledOnce();
    expect(payload.create).toHaveBeenCalledWith(expect.objectContaining({ collection: "activity-log" }));
  });

  it("rolls back both records when either write fails", async () => {
    payload.create.mockResolvedValueOnce({ id: 1 }).mockRejectedValueOnce(new Error("activity failed"));
    const request = new Request("http://localhost/api/google-ads-estimate-usage", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "internal-key" },
      body: JSON.stringify({ keyword: "plumber" }),
    });

    await expect(POST(request as never)).rejects.toThrow("activity failed");
    expect(payload.db.rollbackTransaction).toHaveBeenCalledWith("tx-1");
    expect(payload.db.commitTransaction).not.toHaveBeenCalled();
  });

  it("replaces future event times with receipt time", async () => {
    const request = new Request("http://localhost/api/google-ads-estimate-usage", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "internal-key" },
      body: JSON.stringify({ keyword: "plumber", usedAt: "2999-01-01T00:00:00.000Z" }),
    });

    await POST(request as never);

    const createdAt = payload.create.mock.calls[0][0].data.createdAt;
    expect(Date.parse(createdAt)).toBeLessThanOrEqual(Date.now());
    expect(createdAt).not.toBe("2999-01-01T00:00:00.000Z");
  });
});
