import { GET } from "@/app/(frontend)/api/organic-growth-snapshots/sweep/route";

const findMock = vi.fn();
const createMock = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn(async () => ({ find: findMock, create: createMock })),
}));

vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

describe("organic growth snapshot sweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "secret";
  });

  it("rejects unauthorised sweep requests", async () => {
    const response = await GET(new Request("https://cms.test/api/organic-growth-snapshots/sweep"));
    expect(response.status).toBe(401);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("skips clients whose due snapshot already exists", async () => {
    findMock
      .mockResolvedValueOnce({ docs: [{ id: 1, isActive: true, clientStartDate: "2026-01-15T00:00:00Z" }] })
      .mockResolvedValueOnce({ docs: [{ client: 1, periodEnd: "2026-04-30", snapshotType: "quarterly" }, { client: 1, periodEnd: "2026-01-31", snapshotType: "month_1" }] });

    const response = await GET(new Request("https://cms.test/api/organic-growth-snapshots/sweep", { headers: { authorization: "Bearer secret" } }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, createdCount: 0, created: [] });
    expect(createMock).not.toHaveBeenCalled();
  });
});
