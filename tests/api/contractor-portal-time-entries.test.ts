import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockPayload = {
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

const contractor = {
  id: 7,
  name: "Sam Specialist",
  email: null,
  isActive: true,
};
const matchingUser = {
  id: 42,
  name: "Sam Specialist",
  email: "sam@example.com",
};

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/contractor/valid-portal-token-123", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("contractor portal time-entry ownership", () => {
  it("creates a portal entry with both contractor and matching legacy user links", async () => {
    const { POST } = await import("@/app/(frontend)/api/contractor/[token]/route");
    mockPayload.find
      .mockResolvedValueOnce({ docs: [contractor] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [matchingUser] });
    mockPayload.create.mockResolvedValue({ id: 30 });

    const response = await POST(
      postRequest({ weekCommencing: "2026-07-20", hours: 22, action: "submit" }),
      { params: Promise.resolve({ token: "valid-portal-token-123" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, status: "submitted" });
    expect(mockPayload.find).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ collection: "users", pagination: false }),
    );
    expect(mockPayload.create).toHaveBeenCalledWith({
      collection: "contractor-time-entries",
      data: {
        contractor: 7,
        user: 42,
        weekCommencing: "2026-07-20",
        hours: 22,
        status: "submitted",
      },
      overrideAccess: true,
    });
  });

  it("backfills the matching user when a legacy contractor-only portal entry is updated", async () => {
    const { POST } = await import("@/app/(frontend)/api/contractor/[token]/route");
    mockPayload.find
      .mockResolvedValueOnce({ docs: [contractor] })
      .mockResolvedValueOnce({
        docs: [{ id: 30, contractor: 7, user: null, status: "draft" }],
      })
      .mockResolvedValueOnce({ docs: [matchingUser] });
    mockPayload.update.mockResolvedValue({ id: 30 });

    const response = await POST(
      postRequest({ weekCommencing: "2026-07-20", hours: 22, action: "submit" }),
      { params: Promise.resolve({ token: "valid-portal-token-123" }) },
    );

    expect(response.status).toBe(200);
    expect(mockPayload.update).toHaveBeenCalledWith({
      collection: "contractor-time-entries",
      id: 30,
      data: {
        hours: 22,
        status: "submitted",
        user: 42,
      },
      overrideAccess: true,
    });
  });
});
