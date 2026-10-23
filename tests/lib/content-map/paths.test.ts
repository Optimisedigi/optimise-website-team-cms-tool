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
