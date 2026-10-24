import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakePayload, type FakePayload } from "../../lib/content-map/fake-payload";

const holder = vi.hoisted(() => ({ payload: null as unknown as FakePayload }));
const afterMock = vi.hoisted(() => vi.fn());
const writeResearch = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const writeCitations = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock("payload", () => ({ getPayload: vi.fn(async () => holder.payload) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: afterMock }));
vi.mock("@/lib/content-map/placement", () => ({ writeResearchInsights: writeResearch }));
vi.mock("@/lib/content-map/citations", () => ({ writeInsights: writeCitations }));

import { POST } from "@/app/(frontend)/api/content-map/insights/run/route";

const req = (body: unknown, token?: string) =>
  new Request("http://cms.test/api/content-map/insights/run", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }) as never;

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "secret");
  afterMock.mockReset();
  writeResearch.mockClear();
  writeCitations.mockClear();
  holder.payload = createFakePayload({
    "content-map-research": [{ id: 1, client: 1, status: "completed" }, { id: 3, client: 1, status: "running" }],
    "content-map-citations": [{ id: 2, client: 1, status: "completed" }],
  });
});

describe("POST /api/content-map/insights/run", () => {
  it("needs the cron secret", async () => {
    expect((await POST(req({ kind: "research", id: "1" }))).status).toBe(401);
    expect((await POST(req({ kind: "research", id: "1" }, "wrong"))).status).toBe(401);
  });

  it("validates kind/id and only runs completed runs", async () => {
    expect((await POST(req({ kind: "other", id: "1" }, "secret"))).status).toBe(400);
    expect((await POST(req({ kind: "research", id: "x;drop" }, "secret"))).status).toBe(400);
    expect((await POST(req({ kind: "research", id: "99" }, "secret"))).status).toBe(404);
    expect((await POST(req({ kind: "research", id: "3" }, "secret"))).status).toBe(409);
  });

  it("answers 202 at once and runs the right job after the response", async () => {
    const res = await POST(req({ kind: "research", id: "1" }, "secret"));
    expect(res.status).toBe(202);
    expect(writeResearch).not.toHaveBeenCalled();
    await (afterMock.mock.calls[0]![0] as () => Promise<void>)();
    expect(writeResearch).toHaveBeenCalledWith(holder.payload, expect.objectContaining({ id: 1 }));
    expect((await POST(req({ kind: "citations", id: 2 }, "secret"))).status).toBe(202);
    await (afterMock.mock.calls[1]![0] as () => Promise<void>)();
    expect(writeCitations).toHaveBeenCalledWith(holder.payload, expect.objectContaining({ id: 2 }));
  });
});
