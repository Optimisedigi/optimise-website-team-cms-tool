import { beforeEach, describe, expect, it, vi } from "vitest";

const find = vi.fn();

vi.mock("payload", () => ({ getPayload: vi.fn(async () => ({ find })) }));
vi.mock("@/payload.config", () => ({ default: {} }));

describe("GET /api/optimate/clients", () => {
  beforeEach(() => {
    vi.resetModules();
    find.mockReset();
    process.env.CMS_API_KEY = "test-key";
  });

  it("returns each client's Meta Ad account ID", async () => {
    find.mockResolvedValue({
      docs: [
        {
          id: 12,
          name: "Example client",
          slug: "example-client",
          metaAdAccountId: "act_123456789",
        },
      ],
    });
    const { GET } = await import("@/app/(frontend)/api/optimate/clients/route");
    const response = await GET(
      new Request("http://localhost/api/optimate/clients", {
        headers: { "x-api-key": "test-key" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      expect.objectContaining({ metaAdAccountId: "act_123456789" }),
    ]);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ metaAdAccountId: true }) }),
    );
  });
});
