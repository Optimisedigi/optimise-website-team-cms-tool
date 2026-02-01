import { describe, it, expect } from "vitest";
import { BlogPosts } from "@/collections/BlogPosts";

describe("BlogPosts Collection", () => {
  it("should have correct slug", () => {
    expect(BlogPosts.slug).toBe("blog-posts");
  });

  it("should have drafts enabled", () => {
    expect(BlogPosts.versions).toBeDefined();
    expect(BlogPosts.versions).toHaveProperty("drafts", true);
  });

  it("should have client relationship field", () => {
    const clientField = BlogPosts.fields.find(
      (f) => "name" in f && f.name === "client"
    );
    expect(clientField).toBeDefined();
    expect(clientField).toHaveProperty("type", "relationship");
    expect(clientField).toHaveProperty("relationTo", "clients");
    expect(clientField).toHaveProperty("required", true);
  });

  it("should have tabs structure for content organization", () => {
    const tabsField = BlogPosts.fields.find((f) => f.type === "tabs");
    expect(tabsField).toBeDefined();
    if (tabsField && "tabs" in tabsField) {
      const tabLabels = tabsField.tabs.map((t) => t.label);
      expect(tabLabels).toContain("Content");
      expect(tabLabels).toContain("SEO & Meta");
      expect(tabLabels).toContain("Media & Display");
      expect(tabLabels).toContain("Categorization");
      expect(tabLabels).toContain("Publishing");
    }
  });

  it("should be in Content admin group", () => {
    expect(BlogPosts.admin?.group).toBe("Content");
  });

  it("should use title as display field", () => {
    expect(BlogPosts.admin?.useAsTitle).toBe("title");
  });

  it("should have status field with draft/review/published options", () => {
    const tabsField = BlogPosts.fields.find((f) => f.type === "tabs");
    if (tabsField && "tabs" in tabsField) {
      const publishingTab = tabsField.tabs.find((t) => t.label === "Publishing");
      const statusField = publishingTab?.fields.find(
        (f) => "name" in f && f.name === "status"
      );
      expect(statusField).toBeDefined();
      if (statusField && "options" in statusField) {
        const values = statusField.options?.map((o: { value: string }) => o.value);
        expect(values).toContain("draft");
        expect(values).toContain("review");
        expect(values).toContain("published");
      }
    }
  });

  it("should default status to draft", () => {
    const tabsField = BlogPosts.fields.find((f) => f.type === "tabs");
    if (tabsField && "tabs" in tabsField) {
      const publishingTab = tabsField.tabs.find((t) => t.label === "Publishing");
      const statusField = publishingTab?.fields.find(
        (f) => "name" in f && f.name === "status"
      );
      expect(statusField).toHaveProperty("defaultValue", "draft");
    }
  });
});
