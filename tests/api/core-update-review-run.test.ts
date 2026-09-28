import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  process.env.GROWTH_TOOLS_URL = "https://growth.example";
  process.env.INTERNAL_API_KEY = "internal-key";
});

const mockPayload = {
  auth: vi.fn(),
  findByID: vi.fn(),
  update: vi.fn(),
};

vi.mock("payload", () => ({ getPayload: vi.fn(async () => mockPayload) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

import { POST } from "@/app/(frontend)/api/clients/[id]/core-update-review/run/route";

describe("manual core update review", () => {
  beforeEach(() => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } });
    mockPayload.findByID.mockResolvedValue({
      id: 1,
      name: "Optimise Digital",
      websiteUrl: "www.optimisedigital.online",
      gscPropertyUrl: "sc-domain:optimisedigital.online",
    });
    mockPayload.update.mockResolvedValue({ id: 1 });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ audit: { overallRiskScore: 20 } }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));
  });

  it("sends an HTTPS crawl URL when the client's saved website has no scheme", async () => {
    const response = await POST(
      new NextRequest("https://cms.example/api/clients/1/core-update-review/run", { method: "POST" }),
      { params: Promise.resolve({ id: "1" }) },
    );

    expect(response.status).toBe(200);
    const fetchMock = vi.mocked(globalThis.fetch);
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.siteUrl).toBe("https://www.optimisedigital.online");
    expect(request.gscSiteUrl).toBe("sc-domain:optimisedigital.online");
    expect(request.sendEmail).toBe(false);
  });

  it("rejects an invalid website before calling Growth Tools", async () => {
    mockPayload.findByID.mockResolvedValue({ id: 1, websiteUrl: "http://" });

    const response = await POST(
      new NextRequest("https://cms.example/api/clients/1/core-update-review/run", { method: "POST" }),
      { params: Promise.resolve({ id: "1" }) },
    );

    expect(response.status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
