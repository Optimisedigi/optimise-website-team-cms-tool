import { beforeEach, describe, expect, it, vi } from "vitest";

const { payload } = vi.hoisted(() => ({
  payload: {
    find: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
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
    // First find: the admin recipient. Second find: this week's existing notification (none).
    payload.find.mockImplementation(async (args: { collection: string }) =>
      args.collection === "users" ? { docs: [{ id: 7 }] } : { docs: [] });
    payload.create.mockResolvedValue({ id: 1 });
    payload.update.mockResolvedValue({ id: 1 });
    payload.count.mockResolvedValue({ totalDocs: 3 });
    payload.db.beginTransaction.mockResolvedValue("tx-1");
    payload.db.commitTransaction.mockResolvedValue(undefined);
    payload.db.rollbackTransaction.mockResolvedValue(undefined);
  });

  it("records the activity entry and starts this week's notification at the supplied event time", async () => {
    const usedAt = "2026-09-08T01:02:03.000Z";
    payload.count.mockResolvedValue({ totalDocs: 1 });
    const request = new Request("http://localhost/api/google-ads-estimate-usage", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "internal-key" },
      body: JSON.stringify({ keyword: "plumber", targetArea: "Perth", status: "success", source: "live", usedAt }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(payload.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      collection: "activity-log",
      data: expect.objectContaining({
        type: "google_ads_keyword_cost_finder_used",
        createdAt: usedAt,
      }),
    }));
    expect(payload.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      collection: "notifications",
      data: expect.objectContaining({
        createdAt: usedAt,
        title: "Google Ads keyword cost finder used this week (1)",
        body: "Week of 7th Sep. Latest: plumber in Perth, success/live, Tue 8th Sep, 9:02am",
        url: "/admin/collections/activity-log?where[and][0][type][equals]=google_ads_keyword_cost_finder_used&where[and][1][createdAt][greater_than_equal]=2026-09-06T16%3A00%3A00.000Z",
      }),
    }));
    expect(payload.db.commitTransaction).toHaveBeenCalledWith("tx-1");
  });

  it("bumps the existing weekly notification instead of adding another one", async () => {
    payload.count.mockResolvedValue({ totalDocs: 5 });
    payload.find.mockImplementation(async (args: { collection: string }) =>
      args.collection === "users"
        ? { docs: [{ id: 7 }] }
        : { docs: [{ id: 44, createdAt: "2026-09-08T01:00:00.000Z", body: "old" }] });
    const usedAt = "2026-09-10T03:30:00.000Z";
    const request = new Request("http://localhost/api/google-ads-estimate-usage", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "internal-key" },
      body: JSON.stringify({ keyword: "electrician", targetArea: "Sydney", status: "success", source: "cache", usedAt }),
    });

    await POST(request as never);

    expect(payload.create).toHaveBeenCalledOnce();
    expect(payload.create).toHaveBeenCalledWith(expect.objectContaining({ collection: "activity-log" }));
    expect(payload.update).toHaveBeenCalledWith(expect.objectContaining({
      collection: "notifications",
      id: 44,
      data: expect.objectContaining({
        title: "Google Ads keyword cost finder used this week (5)",
        body: "Week of 7th Sep. Latest: electrician in Sydney, success/cache, Thu 10th Sep, 11:30am",
        readAt: null,
        createdAt: usedAt,
      }),
    }));
  });

  it("starts a new notification when the week rolls over (Monday, Perth time)", async () => {
    payload.count.mockResolvedValue({ totalDocs: 1 });
    // Sunday 11:59pm UTC is Monday 7:59am in Perth: a new week.
    const request = new Request("http://localhost/api/google-ads-estimate-usage", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "internal-key" },
      body: JSON.stringify({ keyword: "plumber", usedAt: "2026-09-13T23:59:00.000Z" }),
    });

    await POST(request as never);

    const notification = payload.create.mock.calls.find((c: any[]) => c[0].collection === "notifications")?.[0];
    expect(notification.data.url).toContain(encodeURIComponent("2026-09-13T16:00:00.000Z"));
    expect(notification.data.body).toMatch(/^Week of 14th Sep\./);
  });

  it("still records activity when no notification recipient exists", async () => {
    payload.find.mockImplementation(async () => ({ docs: [] }));
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

  it("rolls back when the activity write fails", async () => {
    payload.create.mockRejectedValueOnce(new Error("activity failed"));
    const request = new Request("http://localhost/api/google-ads-estimate-usage", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "internal-key" },
      body: JSON.stringify({ keyword: "plumber" }),
    });

    await expect(POST(request as never)).rejects.toThrow("activity failed");
    expect(payload.db.rollbackTransaction).toHaveBeenCalledWith("tx-1");
    expect(payload.db.commitTransaction).not.toHaveBeenCalled();
  });

  it("rolls back when the notification write fails", async () => {
    payload.create.mockResolvedValueOnce({ id: 1 }).mockRejectedValueOnce(new Error("notification failed"));
    const request = new Request("http://localhost/api/google-ads-estimate-usage", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "internal-key" },
      body: JSON.stringify({ keyword: "plumber" }),
    });

    await expect(POST(request as never)).rejects.toThrow("notification failed");
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
