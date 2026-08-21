import { beforeEach, describe, expect, it, vi } from "vitest";

const db = { beginTransaction: vi.fn(), commitTransaction: vi.fn(), rollbackTransaction: vi.fn() };
const payload = { auth: vi.fn(), find: vi.fn(), create: vi.fn(), db };
vi.mock("payload", () => ({
  getPayload: vi.fn(async () => payload),
  createLocalReq: vi.fn(async ({ user }) => ({ user })),
}));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

const batch = {
  weekStart: "2026-08-17",
  tasks: [
    { title: "SEO review", clientId: "1", assignedToId: "7", taskType: "seo", priority: "normal", dueDate: "2026-08-19", instructions: "Review rankings" },
    { title: "Write email", clientId: "1", taskType: "email", priority: "high", dueDate: "2026-08-21" },
  ],
};
const request = (body: unknown = batch) => new Request("http://localhost/api/optimate/taskmate/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("TaskMate assignment route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    payload.auth.mockResolvedValue({ user: { id: 7, role: "admin" } });
    payload.find.mockImplementation(async ({ collection }: { collection: string }) => collection === "clients"
      ? { docs: [{ id: 1, name: "Acme" }] }
      : { docs: [{ id: 7, name: "Alex", email: "alex@example.com", role: "staff" }] });
    payload.create.mockImplementation(async ({ data }) => ({ id: data.title }));
    db.beginTransaction.mockResolvedValue("tx-1");
    db.commitTransaction.mockResolvedValue(undefined);
    db.rollbackTransaction.mockResolvedValue(undefined);
  });

  it("denies unauthenticated and non-admin users", async () => {
    const { POST } = await import("@/app/(frontend)/api/optimate/taskmate/assign/route");
    payload.auth.mockResolvedValueOnce({ user: null });
    expect((await POST(request())).status).toBe(401);
    payload.auth.mockResolvedValueOnce({ user: { id: 2, role: "staff" } });
    expect((await POST(request())).status).toBe(403);
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("rejects stale clients and invalid batches before opening a transaction", async () => {
    const { POST } = await import("@/app/(frontend)/api/optimate/taskmate/assign/route");
    expect((await POST(request({ ...batch, tasks: [{ ...batch.tasks[0], clientId: "999" }] }))).status).toBe(400);
    expect((await POST(request({ ...batch, tasks: [{ ...batch.tasks[0], assignedToId: "999" }] }))).status).toBe(400);
    expect((await POST(request({ ...batch, weekStart: "2026-08-18" }))).status).toBe(400);
    expect(db.beginTransaction).not.toHaveBeenCalled();
  });

  it("creates and commits the complete batch in one transaction", async () => {
    const { POST } = await import("@/app/(frontend)/api/optimate/taskmate/assign/route");
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(payload.create).toHaveBeenCalledTimes(2);
    expect(payload.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ client: 1, assignedTo: 7, status: "in_progress" }), req: expect.objectContaining({ transactionID: "tx-1" }) }));
    expect(db.commitTransaction).toHaveBeenCalledWith("tx-1");
    expect(db.rollbackTransaction).not.toHaveBeenCalled();
  });

  it("rolls back when any create fails", async () => {
    const { POST } = await import("@/app/(frontend)/api/optimate/taskmate/assign/route");
    payload.create.mockResolvedValueOnce({ id: 1 }).mockRejectedValueOnce(new Error("write failed"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(db.rollbackTransaction).toHaveBeenCalledWith("tx-1");
    expect(db.commitTransaction).not.toHaveBeenCalled();
  });

  it("fails closed when transactions are unavailable", async () => {
    const { POST } = await import("@/app/(frontend)/api/optimate/taskmate/assign/route");
    db.beginTransaction.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(503);
    expect(payload.create).not.toHaveBeenCalled();
  });
});
