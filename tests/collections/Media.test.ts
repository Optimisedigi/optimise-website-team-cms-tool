import { describe, it, expect } from "vitest";
import { Media } from "@/collections/Media";

describe("Media Collection", () => {
  it("should have correct slug", () => {
    expect(Media.slug).toBe("media");
  });

  it("should be in Content admin group", () => {
    expect(Media.admin?.group).toBe("Content");
  });

  it("should have public read access", () => {
    expect(Media.access?.read).toBeDefined();
    if (typeof Media.access?.read === "function") {
      expect(Media.access.read({} as never)).toBe(true);
    }
  });

  it("should have upload configuration", () => {
    expect(Media.upload).toBeDefined();
  });

  it("should only accept image mime types", () => {
    if (typeof Media.upload === "object" && Media.upload.mimeTypes) {
      expect(Media.upload.mimeTypes).toContain("image/*");
    }
  });

  it("should have image sizes configured", () => {
    if (typeof Media.upload === "object" && Media.upload.imageSizes) {
      const sizeNames = Media.upload.imageSizes.map((s) => s.name);
      expect(sizeNames).toContain("thumbnail");
      expect(sizeNames).toContain("card");
      expect(sizeNames).toContain("hero");
    }
  });

  it("should have thumbnail size at 400x300", () => {
    if (typeof Media.upload === "object" && Media.upload.imageSizes) {
      const thumbnail = Media.upload.imageSizes.find((s) => s.name === "thumbnail");
      expect(thumbnail?.width).toBe(400);
      expect(thumbnail?.height).toBe(300);
    }
  });

  it("should have hero size at 1920x1080", () => {
    if (typeof Media.upload === "object" && Media.upload.imageSizes) {
      const hero = Media.upload.imageSizes.find((s) => s.name === "hero");
      expect(hero?.width).toBe(1920);
      expect(hero?.height).toBe(1080);
    }
  });

  it("should have required alt field", () => {
    const altField = Media.fields.find(
      (f) => "name" in f && f.name === "alt"
    );
    expect(altField).toBeDefined();
    expect(altField).toHaveProperty("required", true);
    expect(altField).toHaveProperty("type", "text");
  });

  it("should have optional caption field", () => {
    const captionField = Media.fields.find(
      (f) => "name" in f && f.name === "caption"
    );
    expect(captionField).toBeDefined();
    expect(captionField).toHaveProperty("type", "text");
    expect(captionField).not.toHaveProperty("required", true);
  });
});
