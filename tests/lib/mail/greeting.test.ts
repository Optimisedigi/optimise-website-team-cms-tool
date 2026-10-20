import { describe, expect, it } from "vitest";
import { cleanSuggestedSubject, ensureHiGreeting, greetingName } from "@/lib/mail/greeting";

describe("greetingName", () => {
  it("takes the first name from a display name, never from a bare address", () => {
    expect(greetingName('"Helena Smith" <helena@flipsidegroup.com.au>')).toBe("Helena");
    expect(greetingName("Jo <jo@x.com>, Sam <sam@y.com>")).toBe("Jo");
    expect(greetingName("jo@x.com")).toBe("");
    expect(greetingName("jo@x.com <jo@x.com>")).toBe("");
    expect(greetingName("")).toBe("");
  });
});

describe("ensureHiGreeting", () => {
  it("keeps a Hi greeting as written", () => {
    expect(ensureHiGreeting("Hi Sam,\n\nThursday works.", "Samantha")).toBe("Hi Sam,\n\nThursday works.");
  });

  it("turns other greetings into Hi", () => {
    expect(ensureHiGreeting("Dear Helena,\n\nThanks.", "Helena")).toBe("Hi Helena,\n\nThanks.");
    expect(ensureHiGreeting("Hello Jo, thanks for this.", "")).toBe("Hi Jo, thanks for this.");
    expect(ensureHiGreeting("Good morning Jo,\n\nx", "")).toBe("Hi Jo,\n\nx");
  });

  it("adds Hi and the name when there is no greeting", () => {
    expect(ensureHiGreeting("Thursday works for me.", "Helena")).toBe("Hi Helena,\n\nThursday works for me.");
    expect(ensureHiGreeting("\n  Thursday works.", "")).toBe("Hi,\n\nThursday works.");
    // "Hiring" is not a greeting.
    expect(ensureHiGreeting("Hiring is open.", "Jo")).toBe("Hi Jo,\n\nHiring is open.");
  });
});

describe("cleanSuggestedSubject", () => {
  it("returns one clean line", () => {
    expect(cleanSuggestedSubject('"Catch-up next week"')).toBe("Catch-up next week");
    expect(cleanSuggestedSubject("Subject: Q3 results\nextra")).toBe("Q3 results extra");
    expect(cleanSuggestedSubject(undefined)).toBe("");
  });
});
