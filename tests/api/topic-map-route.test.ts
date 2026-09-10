import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
const find = vi.fn();
const findByID = vi.fn();
vi.mock("payload", () => ({ getPayload: vi.fn(async () => ({ auth, find, findByID })) }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

const route = await import("@/app/(frontend)/api/blog-posts/topic-map/route");
const request = (query = "") => new Request(`http://localhost/api/blog-posts/topic-map${query}`) as never;

describe("topic map route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue({ user: { id: 1 } });
    findByID.mockResolvedValue({ blogCategories: "SEO\nNews", blogTags: "Audit", websiteUrl: "https://example.com" });
    find.mockResolvedValueOnce({ docs: [], hasNextPage: false });
  });

  it("rejects unauthenticated requests", async () => {
    auth.mockResolvedValue({ user: null });
    expect((await route.GET(request("?clientId=1"))).status).toBe(401);
  });

  it("rejects missing and invalid client IDs", async () => {
    expect((await route.GET(request())).status).toBe(400);
    expect((await route.GET(request("?clientId=../1"))).status).toBe(400);
    expect(findByID).not.toHaveBeenCalled();
  });

  it("returns 404 when the user cannot load the client", async () => {
    findByID.mockRejectedValue(new Error("not found"));
    expect((await route.GET(request("?clientId=1"))).status).toBe(404);
  });

  it("returns configured empty categories with access and tenant scoping", async () => {
    const response = await route.GET(request("?clientId=1"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.graph.categories.map((category: { label: string }) => category.label)).toEqual(["SEO", "News"]);
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ collection: "blog-posts", where: { client: { equals: "1" } }, overrideAccess: false, user: { id: 1 } }));
  });

  it("excludes suggestions whose source is not a loaded client article", async () => {
    find.mockReset();
    find.mockResolvedValueOnce({ docs: [{ id: 1, title: "A", slug: "a", category: "SEO", tags: [] }], hasNextPage: false });
    find.mockResolvedValueOnce({ docs: [
      { id: 1, sourceUrl: "/blog/a", targetUrl: "/service", status: "pending" },
      { id: 2, sourceUrl: "/blog/another-client", targetUrl: "/service", status: "pending" },
    ], hasNextPage: false });
    const body = await (await route.GET(request("?clientId=1"))).json();
    expect(body.graph.edges.filter((edge: { type: string }) => edge.type === "suggested_link")).toHaveLength(1);
  });

  it("returns a stable failure response for upstream errors", async () => {
    find.mockReset();
    find.mockRejectedValue(new Error("database unavailable"));
    const response = await route.GET(request("?clientId=1"));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to build topic map" });
  });
});
