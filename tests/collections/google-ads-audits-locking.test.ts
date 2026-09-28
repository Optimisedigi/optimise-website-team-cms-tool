import { describe, expect, it } from "vitest";
import { GoogleAdsAudits } from "@/collections/GoogleAdsAudits";

describe("Google Ads audit document locking", () => {
  it("does not run Payload's oversized lock lookup when opening an audit", () => {
    expect(GoogleAdsAudits.lockDocuments).toBe(false);
  });
});
