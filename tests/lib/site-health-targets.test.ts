import { describe, expect, it } from "vitest";

import { resolveSiteHealthCrawlUrl, resolveSiteHealthEmails, withHttps } from "@/lib/site-health/targets";

describe("site health targets", () => {
  it("prefers the monitor URL, else the client website", () => {
    expect(resolveSiteHealthCrawlUrl({ seoAuto: { siteUrl: "https://override.example" }, websiteUrl: "www.client.example" })).toBe(
      "https://override.example",
    );
    expect(resolveSiteHealthCrawlUrl({ websiteUrl: "www.client.example" })).toBe("https://www.client.example");
  });

  it("prefers monitor emails, else the contact email", () => {
    expect(
      resolveSiteHealthEmails({
        seoAuto: { notificationEmails: [{ email: "a@x.com" }, { email: "" }] },
        contactEmail: "hello@x.com",
      }),
    ).toEqual(["a@x.com"]);
    expect(resolveSiteHealthEmails({ contactEmail: "hello@x.com" })).toEqual(["hello@x.com"]);
  });

  it("adds https when the stored website has no scheme", () => {
    expect(withHttps("optimisedigital.online")).toBe("https://optimisedigital.online");
  });
});
