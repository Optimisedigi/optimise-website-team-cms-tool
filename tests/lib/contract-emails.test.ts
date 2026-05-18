import { describe, it, expect } from "vitest";
import {
  parseClientEmails,
  validateClientEmails,
  getPrimaryClientEmail,
} from "@/lib/contract-emails";

describe("parseClientEmails", () => {
  it("returns empty for null/undefined/empty", () => {
    expect(parseClientEmails(null)).toEqual({ primary: null, ccs: [], all: [] });
    expect(parseClientEmails(undefined)).toEqual({ primary: null, ccs: [], all: [] });
    expect(parseClientEmails("")).toEqual({ primary: null, ccs: [], all: [] });
    expect(parseClientEmails("   ")).toEqual({ primary: null, ccs: [], all: [] });
  });

  it("parses a single email", () => {
    expect(parseClientEmails("foo@bar.com")).toEqual({
      primary: "foo@bar.com",
      ccs: [],
      all: ["foo@bar.com"],
    });
  });

  it("parses a comma-separated list and trims whitespace", () => {
    expect(parseClientEmails("a@x.com, b@x.com ,c@x.com")).toEqual({
      primary: "a@x.com",
      ccs: ["b@x.com", "c@x.com"],
      all: ["a@x.com", "b@x.com", "c@x.com"],
    });
  });

  it("dedupes case-insensitively while preserving order", () => {
    expect(parseClientEmails("A@x.com, a@x.com, b@x.com, B@x.com")).toEqual({
      primary: "A@x.com",
      ccs: ["b@x.com"],
      all: ["A@x.com", "b@x.com"],
    });
  });

  it("drops empty segments from trailing commas", () => {
    expect(parseClientEmails("a@x.com,,b@x.com,")).toEqual({
      primary: "a@x.com",
      ccs: ["b@x.com"],
      all: ["a@x.com", "b@x.com"],
    });
  });
});

describe("validateClientEmails", () => {
  it("accepts empty values (field is optional)", () => {
    expect(validateClientEmails(null)).toBe(true);
    expect(validateClientEmails(undefined)).toBe(true);
    expect(validateClientEmails("")).toBe(true);
  });

  it("accepts a single valid email", () => {
    expect(validateClientEmails("foo@bar.com")).toBe(true);
  });

  it("accepts a comma-separated list of valid emails", () => {
    expect(validateClientEmails("a@x.com, b@x.com, c@x.com")).toBe(true);
  });

  it("rejects an invalid single email", () => {
    const result = validateClientEmails("not-an-email");
    expect(typeof result).toBe("string");
    expect(result).toMatch(/not-an-email/);
  });

  it("rejects when any entry in the list is invalid", () => {
    const result = validateClientEmails("a@x.com, broken, b@x.com");
    expect(typeof result).toBe("string");
    expect(result).toMatch(/broken/);
  });

  it("rejects non-string input", () => {
    expect(typeof validateClientEmails(123 as unknown)).toBe("string");
    expect(typeof validateClientEmails({} as unknown)).toBe("string");
  });
});

describe("getPrimaryClientEmail", () => {
  it("returns the first email from a list", () => {
    expect(getPrimaryClientEmail("a@x.com, b@x.com")).toBe("a@x.com");
  });

  it("returns empty string when no emails", () => {
    expect(getPrimaryClientEmail(null)).toBe("");
    expect(getPrimaryClientEmail("")).toBe("");
  });

  it("returns a single email unchanged", () => {
    expect(getPrimaryClientEmail("solo@x.com")).toBe("solo@x.com");
  });
});
