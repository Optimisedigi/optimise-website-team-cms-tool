import { describe, expect, it } from "vitest";
import { Users } from "@/collections/Users";

describe("user document locking", () => {
  it("does not query Payload's oversized lock relations when saving Gmail tokens", () => {
    expect(Users.lockDocuments).toBe(false);
  });
});
