import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as nextHeaders } from "next/headers";
import config from "@/payload.config";
import {
  buildTopicAuthorityGraph,
  normalizeInternalUrl,
  type GraphPostInput,
  type GraphSuggestionInput,
} from "@/lib/topic-authority-graph";

const POST_LIMIT = 500;
const SUGGESTION_LIMIT = 1000;

function validClientId(value: string | null): value is string {
  return Boolean(value && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const clientId = new URL(request.url).searchParams.get("clientId");
    if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    if (!validClientId(clientId)) return NextResponse.json({ error: "clientId is invalid" }, { status: 400 });

    let client: Record<string, unknown>;
    try {
      client = await payload.findByID({
        collection: "clients",
        id: clientId,
        depth: 0,
        overrideAccess: false,
        user,
        select: { blogCategories: true, blogTags: true, websiteUrl: true },
      }) as unknown as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const postsResult = await payload.find({
      collection: "blog-posts",
      where: { client: { equals: clientId } },
      sort: "-publishedDate",
      limit: POST_LIMIT,
      depth: 0,
      overrideAccess: false,
      user,
      select: { title: true, slug: true, status: true, category: true, tags: true, markdownContent: true, client: true },
    });

    const websiteUrl = typeof client.websiteUrl === "string" ? client.websiteUrl : undefined;
    const origins = websiteUrl ? [websiteUrl] : [];
    const clientPaths = new Set(
      postsResult.docs.flatMap((post) => {
        const slug = typeof post.slug === "string" ? post.slug : "";
        const path = normalizeInternalUrl(`/blog/${slug}`, origins);
        return path ? [path] : [];
      }),
    );

    const suggestionsResult = clientPaths.size
      ? await payload.find({
          collection: "internal-link-suggestions",
          limit: SUGGESTION_LIMIT,
          depth: 0,
          overrideAccess: false,
          user,
          where: { status: { in: ["pending", "approved"] } },
          select: { sourceUrl: true, targetUrl: true, confidenceScore: true, status: true, clusterRelation: true, clusterName: true },
        })
      : { docs: [], hasNextPage: false };

    // Suggestions have no client field, so only sources matching this client's loaded posts may enter the graph.
    const suggestions = suggestionsResult.docs.filter((suggestion) => {
      const source = typeof suggestion.sourceUrl === "string" ? normalizeInternalUrl(suggestion.sourceUrl, origins) : null;
      return Boolean(source && clientPaths.has(source));
    }) as unknown as GraphSuggestionInput[];

    const graph = buildTopicAuthorityGraph({
      configuredCategories: typeof client.blogCategories === "string" ? client.blogCategories : null,
      configuredTags: typeof client.blogTags === "string" ? client.blogTags : null,
      posts: postsResult.docs as unknown as GraphPostInput[],
      suggestions,
      siteOrigins: origins,
      maxNodes: 700,
      maxEdges: 1500,
    });
    graph.summary.truncated ||= postsResult.hasNextPage || Boolean(suggestionsResult.hasNextPage);

    return NextResponse.json({ ok: true, graph });
  } catch (error) {
    console.error("[blog-posts/topic-map] failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Failed to build topic map" }, { status: 500 });
  }
}
