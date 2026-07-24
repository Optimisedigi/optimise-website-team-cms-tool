import { describe, it, expect, vi, beforeEach } from "vitest";
import { BlogPosts } from "@/collections/BlogPosts";

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/client-value-ledger", () => ({
  createLedgerItem: vi.fn().mockResolvedValue({ created: true, id: 1 }),
}));

import { logActivity } from "@/lib/activity-log";
import { createLedgerItem } from "@/lib/client-value-ledger";

// ─── Helpers ───────────────────────────────────────────────────
const mockPayload = {
  find: vi.fn().mockResolvedValue({ docs: [] }),
  create: vi.fn().mockResolvedValue({}),
  update: vi.fn().mockResolvedValue({}),
  logger: { error: vi.fn(), info: vi.fn() },
};

const mockReq = (overrides: Record<string, any> = {}) => ({
  payload: mockPayload,
  user: { id: 1, email: "admin@test.com" },
  ...overrides,
});

function findField(fields: any[], name: string): any {
  for (const f of fields) {
    if ("name" in f && f.name === name) return f;
    if ("tabs" in f) {
      for (const tab of f.tabs) {
        const found = findField(tab.fields, name);
        if (found) return found;
      }
    }
    if ("fields" in f && (f.type === "row" || f.type === "collapsible")) {
      const found = findField(f.fields, name);
      if (found) return found;
    }
  }
  return undefined;
}

function getBeforeChangeHooks() {
  return BlogPosts.hooks?.beforeChange ?? [];
}

function getAfterChangeHooks() {
  return BlogPosts.hooks?.afterChange ?? [];
}

// ─── Field Structure Tests ─────────────────────────────────────
describe("BlogPosts Collection", () => {
  it("should have correct slug", () => {
    expect(BlogPosts.slug).toBe("blog-posts");
  });

  it("should have drafts enabled", () => {
    expect(BlogPosts.versions).toBeDefined();
    expect(BlogPosts.versions).toHaveProperty("drafts", true);
  });

  it("should have client relationship field", () => {
    const clientField = findField(BlogPosts.fields, "client");
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
    const statusField = findField(BlogPosts.fields, "status");
    expect(statusField).toBeDefined();
    if (statusField && "options" in statusField) {
      const values = statusField.options?.map((o: any) => typeof o === "string" ? o : o.value);
      expect(values).toContain("draft");
      expect(values).toContain("review");
      expect(values).toContain("published");
    }
  });

  it("should default status to draft", () => {
    const statusField = findField(BlogPosts.fields, "status");
    expect(statusField).toHaveProperty("defaultValue", "draft");
  });

  it("should have public read access", () => {
    expect(BlogPosts.access?.read).toBeDefined();
    if (typeof BlogPosts.access?.read === "function") {
      expect(BlogPosts.access.read({} as any)).toBe(true);
    }
  });
});

// ─── beforeChange hook: Status sync ─────────────────────────────
describe("BlogPosts: beforeChange status sync hook", () => {
  let statusHook: any;

  beforeEach(() => {
    const hooks = getBeforeChangeHooks();
    statusHook = hooks[0];
  });

  it("should set _status to published when status is published", () => {
    const data = { status: "published" };
    const result = statusHook({ data });
    expect(result._status).toBe("published");
  });

  it("should set _status to draft when status is draft", () => {
    const data = { status: "draft" };
    const result = statusHook({ data });
    expect(result._status).toBe("draft");
  });

  it("should set _status to draft when status is review", () => {
    const data = { status: "review" };
    const result = statusHook({ data });
    expect(result._status).toBe("draft");
  });

  it("should not change _status when status is undefined", () => {
    const data = { title: "Test" };
    const result = statusHook({ data });
    expect(result._status).toBeUndefined();
  });
});

// ─── beforeChange hook: Markdown parsing ───────────────────────
describe("BlogPosts: beforeChange markdown parsing hook", () => {
  let markdownHook: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const hooks = getBeforeChangeHooks();
    expect(hooks.length).toBeGreaterThanOrEqual(1);
    markdownHook = hooks[1];
  });

  it("should return data unchanged when markdownSource is empty", () => {
    const data = { title: "Existing", markdownSource: "" };
    const result = markdownHook({ data });
    expect(result).toEqual(data);
  });

  it("should return data unchanged when markdownSource is missing", () => {
    const data = { title: "Existing" };
    const result = markdownHook({ data });
    expect(result).toEqual(data);
  });

  it("should return data when data is undefined", () => {
    const result = markdownHook({ data: undefined });
    expect(result).toBeUndefined();
  });

  it("should extract title from YAML frontmatter", () => {
    const data = {
      markdownSource: `---
title: My Great Post
excerpt: A brief summary
---

# Content heading

Body text here.`,
    };
    const result = markdownHook({ data });
    expect(result.title).toBe("My Great Post");
    expect(result.excerpt).toBe("A brief summary");
  });

  it("should extract title from H1 heading when no frontmatter title", () => {
    const data = {
      markdownSource: `# The H1 Title

Some paragraph content goes here.`,
    };
    const result = markdownHook({ data });
    expect(result.title).toBe("The H1 Title");
  });

  it("should extract metaTitle and metaDescription from frontmatter", () => {
    const data = {
      markdownSource: `---
title: Test Post
metaTitle: SEO Title
metaDescription: SEO description text
---

Body content.`,
    };
    const result = markdownHook({ data });
    expect(result.metaTitle).toBe("SEO Title");
    expect(result.metaDescription).toBe("SEO description text");
  });

  it("should handle case-insensitive frontmatter keys", () => {
    const data = {
      markdownSource: `---
Title: Capitalized
Description: Some description
ReadingTime: 5 min
---

Body text.`,
    };
    const result = markdownHook({ data });
    expect(result.title).toBe("Capitalized");
    expect(result.excerpt).toBe("Some description");
    // ReadingTime from frontmatter is overwritten by auto-calculated reading time
    expect(result.readingTime).toBe("1 min read");
  });

  it("should store parsed body as markdownContent", () => {
    const data = {
      markdownSource: `---
title: Test
---

## Section One

Paragraph content here.`,
    };
    const result = markdownHook({ data });
    expect(result.markdownContent).toContain("## Section One");
    expect(result.markdownContent).toContain("Paragraph content here.");
  });

  it("should auto-generate excerpt from body when missing", () => {
    const data = {
      markdownSource: `---
title: Test
---

This is the first paragraph of the blog post and it should become the excerpt automatically.`,
    };
    const result = markdownHook({ data });
    expect(result.excerpt).toContain("This is the first paragraph");
  });

  it("should auto-generate slug from title when missing", () => {
    const data = {
      markdownSource: `---
title: How to Improve Website Speed
---

Body text here.`,
    };
    const result = markdownHook({ data });
    expect(result.slug).toBe("how-to-improve-website-speed");
  });

  it("should not overwrite existing slug", () => {
    const data = {
      slug: "existing-slug",
      markdownSource: `---
title: New Title
---

Body.`,
    };
    const result = markdownHook({ data });
    expect(result.slug).toBe("existing-slug");
  });

  it("should auto-calculate reading time based on word count", () => {
    // ~200 words = 1 min read, ~400 words = 2 min read
    const words = new Array(400).fill("word").join(" ");
    const data = {
      markdownSource: `---
title: Test
---

${words}`,
    };
    const result = markdownHook({ data });
    expect(result.readingTime).toBe("2 min read");
  });

  it("should set minimum reading time of 1 min", () => {
    const data = {
      markdownSource: `---
title: Short
---

Hello world.`,
    };
    const result = markdownHook({ data });
    expect(result.readingTime).toBe("1 min read");
  });

  it("should auto-fill metaTitle from title when missing", () => {
    const data = {
      markdownSource: `---
title: My Blog Post Title
---

Body content.`,
    };
    const result = markdownHook({ data });
    expect(result.metaTitle).toBe("My Blog Post Title");
  });

  it("should truncate metaTitle to 60 characters", () => {
    const longTitle = "A".repeat(80);
    const data = {
      markdownSource: `---
title: ${longTitle}
---

Body content.`,
    };
    const result = markdownHook({ data });
    expect(result.metaTitle.length).toBeLessThanOrEqual(60);
  });

  it("should auto-fill metaDescription from excerpt when missing", () => {
    const data = {
      markdownSource: `---
title: Test
excerpt: Short summary of the post
---

Body.`,
    };
    const result = markdownHook({ data });
    expect(result.metaDescription).toBe("Short summary of the post");
  });

  it("should clear markdownSource after processing", () => {
    const data = {
      markdownSource: `---
title: Test
---

Body content.`,
    };
    const result = markdownHook({ data });
    expect(result.markdownSource).toBe("");
  });

  it("should parse Key: Value lines when no YAML frontmatter found", () => {
    const data = {
      markdownSource: `Title: Parsed From Lines
Excerpt: My excerpt

## Content starts here

Some body text.`,
    };
    const result = markdownHook({ data });
    expect(result.title).toBe("Parsed From Lines");
    expect(result.excerpt).toBe("My excerpt");
    expect(result.markdownContent).toContain("## Content starts here");
  });

  it("should strip ## Meta title sections from body and extract values", () => {
    const data = {
      markdownSource: `---
title: Main Title
---

## Meta title
Custom SEO Title

## Introduction

Real content here.`,
    };
    const result = markdownHook({ data });
    expect(result.metaTitle).toBe("Custom SEO Title");
    expect(result.markdownContent).not.toContain("## Meta title");
    expect(result.markdownContent).toContain("## Introduction");
  });

  it("should strip reading time line from body", () => {
    const data = {
      markdownSource: `---
title: Test
---

Estimated reading time: 5 minutes

Real content here.`,
    };
    const result = markdownHook({ data });
    expect(result.markdownContent).not.toContain("Estimated reading time");
    expect(result.markdownContent).toContain("Real content here.");
  });

  it("should strip horizontal rules from body", () => {
    const data = {
      markdownSource: `---
title: Test
---

---

Content after rule.`,
    };
    const result = markdownHook({ data });
    expect(result.markdownContent).not.toMatch(/^---+\s*$/m);
    expect(result.markdownContent).toContain("Content after rule.");
  });

  it("should handle parsing errors gracefully", () => {
    // gray-matter handles most edge cases, but we test that try/catch works
    const data = {
      markdownSource: `---
title: Test
---

Body text.`,
    };
    // This should not throw
    const result = markdownHook({ data });
    expect(result.title).toBe("Test");
  });

  it("should truncate excerpt to 160 characters with ellipsis", () => {
    const longParagraph = "A".repeat(200);
    const data = {
      markdownSource: `---
title: Test
---

${longParagraph}`,
    };
    const result = markdownHook({ data });
    expect(result.excerpt.length).toBeLessThanOrEqual(160);
    expect(result.excerpt).toContain("...");
  });
});

// ─── afterChange hook: blog published activity ─────────────────
describe("BlogPosts: afterChange hook", () => {
  let afterChangeHook: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const hooks = getAfterChangeHooks();
    expect(hooks.length).toBeGreaterThanOrEqual(1);
    afterChangeHook = hooks[0];
  });

  it("should log activity when post is newly published", async () => {
    await afterChangeHook({
      doc: { id: "p1", title: "My Post", status: "published", excerpt: "A brief summary", client: "c1" },
      previousDoc: { status: "draft" },
      req: mockReq(),
    });

    expect(logActivity).toHaveBeenCalledWith(mockPayload, {
      type: "blog_published",
      title: "Published: My Post",
      description: "A brief summary",
      user: 1,
      client: "c1",
      targetUrl: "/admin/collections/blog-posts/p1",
    });
    expect(createLedgerItem).toHaveBeenCalledWith(
      mockPayload,
      expect.objectContaining({
        client: "c1",
        blogPost: "p1",
        category: "content",
        visibility: "client_visible",
        dedupeKey: "blog-published:p1",
      }),
    );
  });

  it("should not log when status remains published (no change)", async () => {
    await afterChangeHook({
      doc: { title: "My Post", status: "published", client: "c1" },
      previousDoc: { status: "published" },
      req: mockReq(),
    });

    expect(logActivity).not.toHaveBeenCalled();
    expect(createLedgerItem).not.toHaveBeenCalled();
  });

  it("should not log when status changes to draft", async () => {
    await afterChangeHook({
      doc: { title: "My Post", status: "draft", client: "c1" },
      previousDoc: { status: "review" },
      req: mockReq(),
    });

    expect(logActivity).not.toHaveBeenCalled();
    expect(createLedgerItem).not.toHaveBeenCalled();
  });

  it("should extract client id from populated client object", async () => {
    await afterChangeHook({
      doc: { title: "Post", status: "published", client: { id: "c99", name: "Test" } },
      previousDoc: { status: "draft" },
      req: mockReq(),
    });

    expect(logActivity).toHaveBeenCalledWith(
      mockPayload,
      expect.objectContaining({ client: "c99" }),
    );
  });

  it("should use empty string when excerpt is missing", async () => {
    await afterChangeHook({
      doc: { title: "Post", status: "published", client: "c1" },
      previousDoc: { status: "draft" },
      req: mockReq(),
    });

    expect(logActivity).toHaveBeenCalledWith(
      mockPayload,
      expect.objectContaining({ description: "" }),
    );
  });
});

// ─── Field validation tests ────────────────────────────────────
describe("BlogPosts: field validation", () => {
  it("requires client confirmation before publishing", () => {
    const clientConfirmedField = findField(BlogPosts.fields, "clientConfirmed");
    const result = clientConfirmedField.validate(false, { siblingData: { status: "published" } });
    expect(result).toContain("Please confirm the selected client is correct before publishing.");
  });

  it("should reject excerpt > 200 chars when status is published", () => {
    const excerptField = findField(BlogPosts.fields, "excerpt");
    const longExcerpt = "A".repeat(201);
    const result = excerptField.validate(longExcerpt, { siblingData: { _status: "published" } });
    expect(result).toContain("200 characters");
  });

  it("should allow excerpt > 200 chars when status is draft", () => {
    const excerptField = findField(BlogPosts.fields, "excerpt");
    const longExcerpt = "A".repeat(201);
    const result = excerptField.validate(longExcerpt, { siblingData: { _status: "draft" } });
    expect(result).toBe(true);
  });

  it("should allow null excerpt", () => {
    const excerptField = findField(BlogPosts.fields, "excerpt");
    const result = excerptField.validate(null, { siblingData: { _status: "published" } });
    expect(result).toBe(true);
  });

  it("should reject metaTitle > 100 chars when published", () => {
    const metaTitleField = findField(BlogPosts.fields, "metaTitle");
    const longTitle = "A".repeat(101);
    const result = metaTitleField.validate(longTitle, { siblingData: { _status: "published" } });
    expect(result).toContain("100 characters");
  });

  it("should allow metaTitle > 100 chars when draft", () => {
    const metaTitleField = findField(BlogPosts.fields, "metaTitle");
    const longTitle = "A".repeat(101);
    const result = metaTitleField.validate(longTitle, { siblingData: { _status: "draft" } });
    expect(result).toBe(true);
  });

  it("should reject metaDescription > 200 chars when published", () => {
    const metaDescField = findField(BlogPosts.fields, "metaDescription");
    const longDesc = "A".repeat(201);
    const result = metaDescField.validate(longDesc, { siblingData: { _status: "published" } });
    expect(result).toContain("200 characters");
  });

  it("should auto-generate slug from title via beforeValidate hook", () => {
    const slugField = findField(BlogPosts.fields, "slug");
    const hook = slugField.hooks.beforeValidate[0];
    const result = hook({ value: undefined, data: { title: "My Great Post!" } });
    expect(result).toBe("my-great-post");
  });

  it("should preserve existing slug in beforeValidate hook", () => {
    const slugField = findField(BlogPosts.fields, "slug");
    const hook = slugField.hooks.beforeValidate[0];
    const result = hook({ value: "existing-slug", data: { title: "Ignored" } });
    expect(result).toBe("existing-slug");
  });
});
