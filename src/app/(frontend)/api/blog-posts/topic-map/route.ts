import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

/**
 * GET /api/blog-posts/topic-map?clientId=123
 *
 * Returns the client's blog posts grouped by tag (the topic/authority cluster),
 * plus the internal links each post points to (parsed from markdownContent and
 * matched against the client's configured service pages). Powers the Topic Map
 * view on the Client record — a visual of which articles build authority on a
 * topic and how they interlink to internal/service pages.
 */

interface TopicPost {
  id: string | number;
  title: string;
  slug: string;
  status: string;
  category: string;
  internalLinks: string[];
}

interface TopicGroup {
  topic: string;
  posts: TopicPost[];
  /** Distinct internal-link targets across all posts in this topic. */
  linkedPages: string[];
}

/** Extract internal markdown links: [text](/path) — relative paths only. */
function extractInternalLinks(markdown: string | null | undefined): string[] {
  if (!markdown) return [];
  const found = new Set<string>();
  const re = /\[[^\]]*\]\((\/[^)\s]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    found.add(m[1]);
  }
  return [...found].sort();
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((t) => t.trim());
  }
  return [];
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clientId = new URL(request.url).searchParams.get("clientId");
    if (!clientId) {
      return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    }

    const result = await payload.find({
      collection: "blog-posts",
      where: { client: { equals: clientId } },
      sort: "-publishedDate",
      limit: 500,
      depth: 0,
      overrideAccess: true,
    });

    // Group posts by each of their tags. A post with no tags falls into "Untagged".
    const groups = new Map<string, TopicPost[]>();
    for (const doc of result.docs) {
      const d = doc as unknown as {
        id: string | number;
        title?: string;
        slug?: string;
        status?: string;
        category?: string;
        tags?: unknown;
        markdownContent?: string;
      };
      const post: TopicPost = {
        id: d.id,
        title: d.title || "Untitled",
        slug: d.slug || "",
        status: d.status || "draft",
        category: d.category || "",
        internalLinks: extractInternalLinks(d.markdownContent),
      };
      const tags = parseTags(d.tags);
      const topics = tags.length > 0 ? tags : ["Untagged"];
      for (const topic of topics) {
        const existing = groups.get(topic);
        if (existing) existing.push(post);
        else groups.set(topic, [post]);
      }
    }

    const topics: TopicGroup[] = [...groups.entries()]
      .map(([topic, posts]) => {
        const linkedPages = new Set<string>();
        for (const p of posts) for (const l of p.internalLinks) linkedPages.add(l);
        return { topic, posts, linkedPages: [...linkedPages].sort() };
      })
      // Most-developed topics first; Untagged always last.
      .sort((a, b) => {
        if (a.topic === "Untagged") return 1;
        if (b.topic === "Untagged") return -1;
        return b.posts.length - a.posts.length || a.topic.localeCompare(b.topic);
      });

    return NextResponse.json({ ok: true, totalPosts: result.docs.length, topics });
  } catch (err) {
    console.error("[blog-posts/topic-map] error:", err);
    return NextResponse.json({ error: "Failed to build topic map" }, { status: 500 });
  }
}
