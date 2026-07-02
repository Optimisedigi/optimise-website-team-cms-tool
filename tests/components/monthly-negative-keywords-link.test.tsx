import { describe, expect, it } from "vitest";

import { relationshipId } from "@/components/monthly-negative-keywords-relationship";

describe("MonthlyNegativeKeywordsLink relationship resolver", () => {
  it("resolves Payload relationship values shaped as { value, relationTo }", () => {
    expect(relationshipId({ value: 6, relationTo: "clients" })).toBe("6");
    expect(relationshipId({ value: "6", relationTo: "clients" })).toBe("6");
  });

  it("resolves nested Payload relationship values shaped as { value: { id } }", () => {
    expect(relationshipId({ value: { id: 6 } })).toBe("6");
    expect(relationshipId({ value: { id: "6" } })).toBe("6");
  });
});
