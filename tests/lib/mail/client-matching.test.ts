import { describe, expect, it } from "vitest";
import {
  buildClientDomainIndex,
  extractEmailAddresses,
  matchMessageToClient,
  messageDirection,
  normaliseDomain,
} from "@/lib/mail/client-matching";

const clients = [
  { id: 1, name: "In The Picture", websiteUrl: "https://www.inthepicture.com.au/", isActive: true },
  {
    id: 2,
    name: "Acme",
    websiteUrl: "acme.com",
    contactEmail: "boss@acme-group.net",
    additionalContacts: [{ email: "owner.acme@gmail.com" }],
    isActive: true,
  },
  { id: 3, name: "Shop Sub", websiteUrl: "https://shop.bigbrand.com.au", isActive: true },
  { id: 4, name: "Big Brand", websiteUrl: "bigbrand.com.au", isActive: true },
  { id: 5, name: "Dup A", websiteUrl: "shared.com", isActive: true },
  { id: 6, name: "Dup B", websiteUrl: "shared.com", isActive: true },
  { id: 7, name: "Old Co", websiteUrl: "oldco.com", isActive: false },
  { id: 8, name: "New Co", websiteUrl: "oldco.com", isActive: true },
  { id: 9, name: "Gmail website?", websiteUrl: "gmail.com", isActive: true },
];

const own = ["peter@optimisedigital.online"];
const index = buildClientDomainIndex(clients, { ownAddresses: own });
const match = (from: string, to = "peter@optimisedigital.online", cc = "") =>
  matchMessageToClient(index, { from, to, cc });

describe("normaliseDomain", () => {
  it("strips protocol, www, path, port and case", () => {
    expect(normaliseDomain("https://WWW.InThePicture.com.au/about?x=1")).toBe("inthepicture.com.au");
    expect(normaliseDomain("inthepicture.com.au:443")).toBe("inthepicture.com.au");
    expect(normaliseDomain("jo@InThePicture.com.au")).toBe("inthepicture.com.au");
    expect(normaliseDomain("not a domain")).toBe("");
    expect(normaliseDomain(null)).toBe("");
  });
});

describe("extractEmailAddresses", () => {
  it("pulls every address from a header, lowercased and deduped", () => {
    expect(extractEmailAddresses('"Smith, Jo" <Jo@X.com>, sam@y.com.au, jo@x.com')).toEqual(["jo@x.com", "sam@y.com.au"]);
  });
});

describe("matchMessageToClient", () => {
  it("matches the example: any sender at @inthepicture.com.au", () => {
    expect(match("Jo <jo@inthepicture.com.au>")).toMatchObject({ clientId: 1, matchedOn: "inthepicture.com.au", matchType: "domain" });
  });

  it("is an exact domain match, not a substring match", () => {
    expect(match("x@notinthepicture.com.au")).toBeNull();
    expect(match("x@inthepicture.com")).toBeNull();
  });

  it("rolls subdomains up to the client domain", () => {
    expect(match("x@mail.inthepicture.com.au")?.clientId).toBe(1);
  });

  it("prefers the most specific client domain", () => {
    expect(match("x@shop.bigbrand.com.au")?.clientId).toBe(3);
    expect(match("x@bigbrand.com.au")?.clientId).toBe(4);
  });

  it("supports several domains per client via contact emails", () => {
    expect(match("x@acme.com")?.clientId).toBe(2);
    expect(match("someone@acme-group.net")?.clientId).toBe(2);
  });

  it("never treats shared mailbox providers as a client domain, but matches exact contact addresses", () => {
    expect(match("random@gmail.com")).toBeNull();
    expect(match("Owner <Owner.Acme@gmail.com>")).toMatchObject({ clientId: 2, matchType: "address" });
  });

  it("matches outgoing mail on the recipient and ignores our own domain", () => {
    expect(match("Peter <peter@optimisedigital.online>", "jo@inthepicture.com.au")?.clientId).toBe(1);
    expect(match("peter@optimisedigital.online", "team@optimisedigital.online")).toBeNull();
  });

  it("falls back to Cc when From and To do not match", () => {
    expect(match("x@unknown.com", "peter@optimisedigital.online", "jo@inthepicture.com.au")?.clientId).toBe(1);
  });

  it("leaves ambiguous domains unmatched, but active beats inactive", () => {
    expect(match("x@shared.com")).toBeNull();
    expect(match("x@oldco.com")?.clientId).toBe(8);
  });
});

describe("messageDirection", () => {
  it("is outbound only when the sender is one of our addresses", () => {
    expect(messageDirection("Peter <PETER@optimisedigital.online>", own)).toBe("outbound");
    expect(messageDirection("jo@inthepicture.com.au", own)).toBe("inbound");
  });
});
