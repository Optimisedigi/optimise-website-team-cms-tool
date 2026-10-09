import { describe, expect, it } from "vitest";
import { latestIdealClientByClient, resolveTargetCustomer } from "@/lib/optimate-target-customer";

describe("resolveTargetCustomer", () => {
  it("prefers the Business tab value", () => {
    expect(
      resolveTargetCustomer({
        businessTab: "Sydney homeowners",
        discoveryBriefing: "Briefing answer",
        googleAdsTriage: "Triage answer",
      }),
    ).toBe("Sydney homeowners");
  });

  it("falls back to the discovery briefing when the Business tab is blank", () => {
    expect(
      resolveTargetCustomer({
        businessTab: "   ",
        discoveryBriefing: "Briefing answer",
        googleAdsTriage: "Triage answer",
      }),
    ).toBe("Briefing answer");
  });

  it("falls back to Google Ads triage when the first two are blank", () => {
    expect(
      resolveTargetCustomer({
        businessTab: null,
        discoveryBriefing: undefined,
        googleAdsTriage: "Triage answer",
      }),
    ).toBe("Triage answer");
  });

  it("collapses whitespace", () => {
    expect(resolveTargetCustomer({ businessTab: "  Sydney \n\t homeowners  " })).toBe(
      "Sydney homeowners",
    );
  });

  it("returns null when every source is blank or missing", () => {
    expect(resolveTargetCustomer({ businessTab: "", discoveryBriefing: " \n ", googleAdsTriage: 42 })).toBeNull();
    expect(resolveTargetCustomer({})).toBeNull();
  });
});

describe("latestIdealClientByClient", () => {
  it("keeps the newest briefing per client", () => {
    const map = latestIdealClientByClient([
      { client: 5, data: { idealClient: "Newest" } },
      { client: 5, data: { idealClient: "Older" } },
    ]);
    expect(map.get("5")).toBe("Newest");
  });

  it("lets an older briefing fill in when the newer one has no answer", () => {
    const map = latestIdealClientByClient([
      { client: 5, data: { idealClient: "   " } },
      { client: 5, data: {} },
      { client: 5, data: { idealClient: "Older answer" } },
    ]);
    expect(map.get("5")).toBe("Older answer");
  });

  it("accepts numeric, string, and populated relation shapes", () => {
    const map = latestIdealClientByClient([
      { client: 5, data: { idealClient: "Five" } },
      { client: "6", data: { idealClient: "Six" } },
      { client: { id: 7 }, data: { idealClient: "Seven" } },
    ]);
    expect(map.get("5")).toBe("Five");
    expect(map.get("6")).toBe("Six");
    expect(map.get("7")).toBe("Seven");
  });

  it("ignores data that is not a plain object and collapses whitespace", () => {
    const map = latestIdealClientByClient([
      { client: 1, data: "not an object" },
      { client: 1, data: ["idealClient"] },
      { client: 1, data: null },
      { client: 1, data: { idealClient: " Tradies \n in  Perth " } },
      { client: undefined, data: { idealClient: "Orphan" } },
    ]);
    expect(map.get("1")).toBe("Tradies in Perth");
    expect(map.size).toBe(1);
  });
});
