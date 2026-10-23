import { describe, expect, it } from "vitest";
import type { Payload, TypedUser } from "payload";
import { contentMapPath, resolveClientParam, slugifyClientName } from "@/lib/content-map/paths";
import { createFakePayload } from "./fake-payload";

const user = { id: 1 } as unknown as TypedUser;
const seed = () =>
  createFakePayload({
    clients: [
      { id: 7, name: "Away Digital Teams", tradingName: "Away Teams", slug: "away-digital-teams" },
      { id: 8, name: "Nguyễn & Co", slug: "nguyen-co" },
    ],
  });

describe("Content Map page paths", () => {
  it("builds the /SEO/Topic-association-linking/<slug> path", () => {
    expect(contentMapPath("away-digital-teams")).toBe("/SEO/Topic-association-linking/away-digital-teams");
    expect(contentMapPath("a b")).toBe("/SEO/Topic-association-linking/a%20b");
    expect(slugifyClientName("Nguyễn & Co")).toBe("nguyen-and-co");
  });

  it("finds the client by exact slug with the user's access applied", async () => {
    const p = seed();
    expect(await resolveClientParam(p as unknown as Payload, "away-digital-teams", user)).toEqual({ id: "7", name: "Away Digital Teams", slug: "away-digital-teams", redirect: false });
    expect(p.find).toHaveBeenCalledWith(expect.objectContaining({ collection: "clients", overrideAccess: false, user }));
  });

  it("accepts different capitalisation, the client name or trading name, and asks for a redirect to the slug", async () => {
    const p = seed() as unknown as Payload;
    expect(await resolveClientParam(p, "Away-Digital-Teams", user)).toMatchObject({ id: "7", redirect: true });
    expect(await resolveClientParam(p, "Away%20Digital%20Teams", user)).toMatchObject({ id: "7", slug: "away-digital-teams", redirect: true });
    expect(await resolveClientParam(p, "away-teams", user)).toMatchObject({ id: "7", redirect: true });
  });

  it("returns null for unknown clients", async () => {
    expect(await resolveClientParam(seed() as unknown as Payload, "nobody", user)).toBeNull();
    expect(await resolveClientParam(seed() as unknown as Payload, "", user)).toBeNull();
  });
});

import { clientSiteUrl, normaliseSiteUrl } from "@/lib/content-map/paths";

describe("normaliseSiteUrl", () => {
  it("adds https:// to bare domains like the CMS Website URL field often holds", () => {
    expect(normaliseSiteUrl("www.optimisedigital.online")).toBe("https://www.optimisedigital.online");
    expect(normaliseSiteUrl("  optimisedigital.online/ ")).toBe("https://optimisedigital.online");
    expect(clientSiteUrl({ websiteUrl: "www.optimisedigital.online" })).toBe("https://www.optimisedigital.online");
  });

  it("keeps full addresses and drops query/fragment", () => {
    expect(normaliseSiteUrl("https://www.site.com/")).toBe("https://www.site.com");
    expect(normaliseSiteUrl("http://site.com/blog/?utm=x#top")).toBe("http://site.com/blog");
  });

  it("rejects things that aren't public web addresses", () => {
    expect(normaliseSiteUrl("")).toBe("");
    expect(normaliseSiteUrl("localhost")).toBe("");
    expect(normaliseSiteUrl("ftp://site.com")).toBe("");
    expect(normaliseSiteUrl(undefined)).toBe("");
  });
});
