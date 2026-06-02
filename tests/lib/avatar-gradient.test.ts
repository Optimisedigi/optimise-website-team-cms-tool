import { describe, it, expect } from "vitest";
import {
  AVATAR_PALETTE_SIZE,
  avatarColor,
  avatarGradient,
  avatarInitial,
  logoUrl,
  websiteHost,
} from "@/components/clients-list/avatar-gradient";

describe("avatarInitial", () => {
  it("returns the uppercased first letter", () => {
    expect(avatarInitial("acme corp")).toBe("A");
  });

  it("falls back to '?' for empty/nullish names", () => {
    expect(avatarInitial("")).toBe("?");
    expect(avatarInitial(null)).toBe("?");
    expect(avatarInitial(undefined)).toBe("?");
    expect(avatarInitial("   ")).toBe("?");
  });
});

describe("avatarGradient", () => {
  it("is deterministic for the same name", () => {
    expect(avatarGradient("Acme Corp")).toBe(avatarGradient("Acme Corp"));
  });

  it("returns a CSS linear-gradient string", () => {
    expect(avatarGradient("Brightline")).toMatch(/^linear-gradient\(135deg, #[0-9a-f]{6}, #[0-9a-f]{3,6}\)$/i);
  });

  it("produces a valid gradient even for empty input", () => {
    expect(avatarGradient("")).toMatch(/^linear-gradient\(/);
  });
});

describe("avatarColor", () => {
  it("assigns a distinct colour to every id within one palette cycle", () => {
    const seen = new Set<string>();
    for (let id = 1; id <= AVATAR_PALETTE_SIZE; id++) {
      seen.add(avatarColor(id, `Client ${id}`));
    }
    // No two ids in a full cycle collide.
    expect(seen.size).toBe(AVATAR_PALETTE_SIZE);
  });

  it("is stable for the same id", () => {
    expect(avatarColor(5, "Acme")).toBe(avatarColor(5, "Acme"));
  });

  it("maps id independently of the name", () => {
    expect(avatarColor(3, "Acme")).toBe(avatarColor(3, "Totally Different Name"));
  });

  it("accepts a numeric-string id", () => {
    expect(avatarColor("7", "Acme")).toBe(avatarColor(7, "Acme"));
  });

  it("falls back to a name-based gradient when id is missing", () => {
    expect(avatarColor(null, "Brightline")).toBe(avatarGradient("Brightline"));
    expect(avatarColor(undefined, "Brightline")).toBe(avatarGradient("Brightline"));
  });

  it("always returns a linear-gradient string", () => {
    expect(avatarColor(1, "x")).toMatch(/^linear-gradient\(135deg, #[0-9a-f]{6}, #[0-9a-f]{3,6}\)$/i);
  });
});

describe("logoUrl", () => {
  it("prefers the thumbnail size over the original", () => {
    expect(
      logoUrl({ url: "/orig.png", sizes: { thumbnail: { url: "/thumb.png" } } }),
    ).toBe("/thumb.png");
  });

  it("falls back to the original url when no thumbnail", () => {
    expect(logoUrl({ url: "/orig.png" })).toBe("/orig.png");
  });

  it("returns empty string for an unpopulated id or nullish value", () => {
    expect(logoUrl(42)).toBe("");
    expect(logoUrl(null)).toBe("");
    expect(logoUrl(undefined)).toBe("");
  });
});

describe("websiteHost", () => {
  it("strips scheme, www, and path", () => {
    expect(websiteHost("https://www.acme.com/about")).toBe("acme.com");
  });

  it("handles bare hosts without a scheme", () => {
    expect(websiteHost("brightline.io")).toBe("brightline.io");
  });

  it("returns empty string for empty/nullish input", () => {
    expect(websiteHost("")).toBe("");
    expect(websiteHost(null)).toBe("");
    expect(websiteHost(undefined)).toBe("");
  });
});
