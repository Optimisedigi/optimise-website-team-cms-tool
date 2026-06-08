/**
 * Tests for the link-accessible save path on
 * `PUT /api/client-discovery-briefings/by-scope`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockPayload = {
  auth: vi.fn(),
  find: vi.fn(),
  findByID: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

import { PUT } from "@/app/(frontend)/api/client-discovery-briefings/by-scope/route";

function putReq(
  query: { scope: string; id: string | number },
  body: unknown,
): NextRequest {
  const url = `http://localhost/api/client-discovery-briefings/by-scope?scope=${query.scope}&id=${query.id}`;
  return new NextRequest(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/client-discovery-briefings/by-scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPayload.auth.mockResolvedValue({ user: null });
    mockPayload.find.mockResolvedValue({ docs: [] });
    mockPayload.findByID.mockResolvedValue({ id: 9, slug: "acme" });
  });

  it("allows a public link visitor to save without a CMS session", async () => {
    mockPayload.create.mockImplementationOnce(async ({ data }) => ({
      id: 11,
      data: data.data,
      markdown: "# Client Discovery Briefing",
    }));

    const res = await PUT(
      putReq({ scope: "client", id: 9 }, { data: { businessName: "Acme" } }),
    );

    expect(res.status).toBe(200);
    expect(mockPayload.create).toHaveBeenCalledTimes(1);
    const createCall = mockPayload.create.mock.calls[0][0];
    expect(createCall.collection).toBe("client-discovery-briefings");
    expect(createCall.data.client).toBe(9);
    expect(createCall.data.data._activity[0].savedBy).toBe("Public link visitor");

    const json = await res.json();
    expect(json.data.businessName).toBe("Acme");
    expect(json.data._activity).toBeUndefined();
    expect(json.activity[0].savedBy).toBe("Public link visitor");
  });

  it("keeps prior activity and records changed fields on update", async () => {
    mockPayload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 12,
          data: {
            businessName: "Old Co",
            websiteUrl: "https://old.example",
            _activity: [
              {
                id: "old-save",
                savedAt: "2026-06-07T10:00:00.000Z",
                savedBy: "Public link visitor",
                changes: ["Website url changed from empty to https://old.example"],
                snapshot: { websiteUrl: "https://old.example" },
              },
            ],
          },
        },
      ],
    });
    mockPayload.update.mockImplementationOnce(async ({ data }) => ({
      id: 12,
      data: data.data,
      markdown: "# Client Discovery Briefing",
    }));

    const res = await PUT(
      putReq(
        { scope: "client", id: 9 },
        { data: { businessName: "New Co", websiteUrl: "https://old.example" } },
      ),
    );

    expect(res.status).toBe(200);
    const updateCall = mockPayload.update.mock.calls[0][0];
    expect(updateCall.id).toBe(12);
    expect(updateCall.data.data._activity[0].savedBy).toBe("Public link visitor");
    expect(updateCall.data.data._activity[0].changes).toContain(
      "Business Name changed from Old Co to New Co",
    );
    expect(updateCall.data.data._activity[1].id).toBe("old-save");
  });
});
