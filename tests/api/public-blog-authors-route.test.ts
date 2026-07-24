import { beforeEach, describe, expect, it, vi } from "vitest";

const payloadFind = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn(async () => ({ find: payloadFind })),
}));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

const route = await import("@/app/(frontend)/api/public/blog-authors/[clientId]/route");

function params(clientId: string) {
  return { params: Promise.resolve({ clientId }) };
}

describe("public blog authors route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the public projection with shared-cache headers", async () => {
    payloadFind.mockResolvedValue({
      docs: [
        {
          id: 5,
          authors: [
            {
              name: "Tracey Markham NP",
              jobTitle: "Nurse Practitioner",
              blurb: "Public biography.",
              image: {
                id: 123,
                url: "/api/media/file/tracey-markham-np.webp",
                alt: "Tracey Markham",
                width: 800,
                height: 800,
              },
              expertiseTags: [{ tag: "AHPRA Registered", id: "internal-tag-row" }],
              socialLinks: [],
            },
          ],
        },
      ],
    });

    const response = await route.GET(
      new Request("http://localhost/api/public/blog-authors/5"),
      params("5"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    await expect(response.json()).resolves.toEqual({
      authors: [
        {
          name: "Tracey Markham NP",
          jobTitle: "Nurse Practitioner",
          blurb: "Public biography.",
          image: {
            url: "/api/media/file/tracey-markham-np.webp",
            alt: "Tracey Markham",
            width: 800,
            height: 800,
          },
          expertiseTags: [{ tag: "AHPRA Registered" }],
          socialLinks: [],
        },
      ],
    });
    expect(payloadFind).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "clients",
        where: { id: { equals: 5 } },
        depth: 1,
        overrideAccess: true,
      }),
    );
  });

  it("rejects invalid client IDs before querying Payload", async () => {
    const response = await route.GET(
      new Request("http://localhost/api/public/blog-authors/not-a-number"),
      params("not-a-number"),
    );

    expect(response.status).toBe(400);
    expect(payloadFind).not.toHaveBeenCalled();
  });

  it("returns 404 when the client does not exist", async () => {
    payloadFind.mockResolvedValue({ docs: [] });

    const response = await route.GET(
      new Request("http://localhost/api/public/blog-authors/999"),
      params("999"),
    );

    expect(response.status).toBe(404);
  });
});
