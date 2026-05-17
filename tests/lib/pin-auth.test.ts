import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFind = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve({ find: mockFind, create: mockCreate, update: mockUpdate })),
}));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pin-auth lockout", () => {
  it("returns ok on first successful PIN", async () => {
    mockFind.mockResolvedValue({ docs: [] });
    mockCreate.mockResolvedValue({});
    const { checkPinWithLockout } = await import("../../src/lib/pin-auth");
    const r = await checkPinWithLockout("audit:1", "1234", "1234");
    expect(r.ok).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 401 with 'Incorrect PIN' on first failure", async () => {
    mockFind.mockResolvedValue({ docs: [] });
    mockCreate.mockResolvedValue({});
    const { checkPinWithLockout } = await import("../../src/lib/pin-auth");
    const r = await checkPinWithLockout("audit:1", "9999", "1234");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(401);
      expect(r.message).toBe("Incorrect PIN");
    }
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].data.attempts).toBe(1);
  });

  it("locks after 5 failed attempts", async () => {
    const bucket = {
      id: 1,
      bucketKey: "audit:1",
      attempts: 4,
      lockedUntil: null,
      windowStart: new Date().toISOString(),
    };
    mockFind.mockResolvedValue({ docs: [bucket] });
    mockUpdate.mockResolvedValue({});
    const { checkPinWithLockout } = await import("../../src/lib/pin-auth");
    const r = await checkPinWithLockout("audit:1", "9999", "1234");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(429);
      expect(r.message).toBe("Too many incorrect attempts. Please try again in 15 minutes.");
    }
    expect(mockUpdate.mock.calls[0][0].data.lockedUntil).toBeTruthy();
    expect(mockUpdate.mock.calls[0][0].data.attempts).toBe(5);
  });

  it("returns 429 if bucket is already locked, even with correct PIN", async () => {
    const future = new Date(Date.now() + 5 * 60_000).toISOString();
    const bucket = {
      id: 1,
      bucketKey: "audit:1",
      attempts: 5,
      lockedUntil: future,
      windowStart: new Date().toISOString(),
    };
    mockFind.mockResolvedValue({ docs: [bucket] });
    const { checkPinWithLockout } = await import("../../src/lib/pin-auth");
    const r = await checkPinWithLockout("audit:1", "1234", "1234");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(429);
    }
    // Bucket NOT updated since we bailed before comparison
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("resets bucket on successful auth", async () => {
    const bucket = {
      id: 1,
      bucketKey: "audit:1",
      attempts: 3,
      lockedUntil: null,
      windowStart: new Date().toISOString(),
    };
    mockFind.mockResolvedValue({ docs: [bucket] });
    mockUpdate.mockResolvedValue({});
    const { checkPinWithLockout } = await import("../../src/lib/pin-auth");
    const r = await checkPinWithLockout("audit:1", "1234", "1234");
    expect(r.ok).toBe(true);
    expect(mockUpdate.mock.calls[0][0].data.attempts).toBe(0);
    expect(mockUpdate.mock.calls[0][0].data.lockedUntil).toBeNull();
  });

  it("auto-unlocks after lockedUntil has passed", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const bucket = {
      id: 1,
      bucketKey: "audit:1",
      attempts: 5,
      lockedUntil: past,
      windowStart: new Date(Date.now() - 30 * 60_000).toISOString(),
    };
    mockFind.mockResolvedValue({ docs: [bucket] });
    mockUpdate.mockResolvedValue({});
    const { checkPinWithLockout } = await import("../../src/lib/pin-auth");
    const r = await checkPinWithLockout("audit:1", "1234", "1234");
    expect(r.ok).toBe(true);
  });
});
