/**
 * Optimise Digital CMS — Blog Integration Module
 *
 * Drop this file into any Next.js client website to connect it to
 * the Optimise Digital CMS for blog post delivery.
 *
 * SETUP:
 *   1. Copy this file to your project's `lib/` directory
 *   2. Add two environment variables:
 *        CMS_API_URL=https://cms.optimisedigital.online
 *        CMS_CLIENT_ID=<client ID from the CMS admin>
 *   3. Import and use the functions in your blog pages
 *
 * USAGE EXAMPLES:
 *
 *   // List all published posts
 *   const posts = await getCMSPosts();
 *
 *   // Get a single post by slug
 *   const post = await getCMSPostBySlug('my-post-slug');
 *
 *   // Convert markdown content to HTML
 *   const html = markdownToHtml(post.content);
 *
 * NEXT.JS PAGE EXAMPLE (App Router):
 *
 *   // app/blog/page.tsx
 *   import { getCMSPosts } from '@/lib/cms-blog-integration';
 *
 *   export default async function BlogPage() {
 *     const posts = await getCMSPosts();
 *     return (
 *       <div>
 *         {posts.map(post => (
 *           <a key={post.slug} href={`/blog/${post.slug}`}>
 *             <h2>{post.title}</h2>
 *             <p>{post.excerpt}</p>
 *             {post.image && <img src={post.image} alt={post.imageAlt} />}
 *           </a>
 *         ))}
 *       </div>
 *     );
 *   }
 *
 *   // app/blog/[slug]/page.tsx
 *   import { getCMSPostBySlug, getCMSPosts, markdownToHtml } from '@/lib/cms-blog-integration';
 *   import { notFound } from 'next/navigation';
 *
 *   export async function generateStaticParams() {
 *     const posts = await getCMSPosts();
 *     return posts.map(post => ({ slug: post.slug }));
 *   }
 *
 *   export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
 *     const { slug } = await params;
 *     const post = await getCMSPostBySlug(slug);
 *     if (!post) notFound();
 *     const html = markdownToHtml(post.content);
 *     return (
 *       <article>
 *         <h1>{post.title}</h1>
 *         <p>{post.author} | {post.date} | {post.readTime}</p>
 *         {post.image && <img src={post.image} alt={post.imageAlt} />}
 *         <div dangerouslySetInnerHTML={{ __html: html }} />
 *       </article>
 *     );
 *   }
 */

// ---------------------------------------------------------------------------
// Configuration — reads from environment variables
// ---------------------------------------------------------------------------

const CMS_API_URL = process.env.CMS_API_URL || "";
const CMS_CLIENT_ID = process.env.CMS_CLIENT_ID || "";

/** Timeout for CMS API calls in milliseconds */
const CMS_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  author: string;
  excerpt: string;
  content: string;
  readTime: string;
  image?: string;
  imageAlt?: string;
  tags?: string[];
}

/** Shape of a blog post returned by the Payload CMS REST API */
interface CMSBlogPost {
  slug: string;
  title: string;
  publishedDate: string;
  author: string;
  excerpt: string;
  content: unknown;
  markdownContent?: string;
  featuredImage?: { url: string } | null;
  featuredImageAlt?: string;
  tags?: string[] | { tag: string }[];
  readingTime?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function calculateReadTime(content: string): string {
  const words = content.split(/\s+/).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return `${minutes} min read`;
}

/** Recursively extract plain text from a Lexical editor JSON tree */
function extractTextFromLexical(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  if (typeof n.text === "string") return n.text;
  if (Array.isArray(n.children))
    return n.children.map(extractTextFromLexical).join("");
  if (n.root && typeof n.root === "object")
    return extractTextFromLexical(n.root);
  return "";
}

/** Convert a CMS API response doc into a normalised BlogPost */
function cmsPostToBlogPost(post: CMSBlogPost): BlogPost {
  const content =
    post.markdownContent || extractTextFromLexical(post.content);
  const tags =
    post.tags?.map((t) => (typeof t === "string" ? t : t.tag)) || [];

  return {
    slug: post.slug,
    title: post.title,
    date: post.publishedDate,
    author: post.author,
    excerpt: post.excerpt,
    content,
    readTime: post.readingTime || calculateReadTime(content),
    image: post.featuredImage?.url || undefined,
    imageAlt: post.featuredImageAlt || post.title,
    tags,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch all published blog posts for this client from the CMS.
 * Returns an empty array if the CMS is unreachable or not configured.
 * Posts are sorted newest-first by published date.
 */
export async function getCMSPosts(): Promise<BlogPost[]> {
  if (!CMS_API_URL || !CMS_CLIENT_ID) {
    console.warn(
      "[cms-blog] CMS_API_URL or CMS_CLIENT_ID not set — skipping CMS fetch"
    );
    return [];
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CMS_TIMEOUT_MS);

    const params = new URLSearchParams({
      "where[_status][equals]": "published",
      "where[client][equals]": CMS_CLIENT_ID,
      depth: "1",
      limit: "100",
    });

    const res = await fetch(`${CMS_API_URL}/api/blog-posts?${params}`, {
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!res.ok) return [];

    const json = await res.json();
    const posts: BlogPost[] = (json.docs || []).map(cmsPostToBlogPost);

    return posts.sort((a, b) => (a.date > b.date ? -1 : 1));
  } catch {
    console.warn("[cms-blog] Failed to fetch from CMS — returning empty");
    return [];
  }
}

/**
 * Fetch a single blog post by slug.
 * Returns null if not found or CMS is unreachable.
 */
export async function getCMSPostBySlug(
  slug: string
): Promise<BlogPost | null> {
  if (!CMS_API_URL || !CMS_CLIENT_ID) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CMS_TIMEOUT_MS);

    const params = new URLSearchParams({
      "where[_status][equals]": "published",
      "where[client][equals]": CMS_CLIENT_ID,
      "where[slug][equals]": slug,
      depth: "1",
      limit: "1",
    });

    const res = await fetch(`${CMS_API_URL}/api/blog-posts?${params}`, {
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!res.ok) return null;

    const json = await res.json();
    const doc = json.docs?.[0];
    return doc ? cmsPostToBlogPost(doc) : null;
  } catch {
    return null;
  }
}

/**
 * Get all unique tags across all published posts.
 */
export async function getCMSTags(): Promise<string[]> {
  const posts = await getCMSPosts();
  const tagSet = new Set<string>();
  posts.forEach((p) => p.tags?.forEach((t) => tagSet.add(t)));
  return Array.from(tagSet).sort();
}

// ---------------------------------------------------------------------------
// Markdown → HTML converter
// ---------------------------------------------------------------------------

/**
 * Convert markdown content to HTML.
 * Supports: headings, bold, italic, links, code blocks, tables, lists.
 */
export function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Fenced code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/gim, (_, lang, code) => {
    const cls = lang ? ` class="language-${lang}"` : "";
    return `<pre><code${cls}>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/gim, "<code>$1</code>");

  // Tables
  html = html.replace(
    /(?:^|\n)((?:\|[^\n]+\|\n)+)/gm,
    (_, tableBlock: string) => {
      const rows = tableBlock.trim().split("\n");
      if (rows.length < 2) return _;
      if (!/^\|[\s\-:|]+\|$/.test(rows[1])) return _;

      const parseRow = (row: string) =>
        row.split("|").slice(1, -1).map((c) => c.trim());

      let t = "<table><thead><tr>";
      for (const c of parseRow(rows[0])) t += `<th>${c}</th>`;
      t += "</tr></thead><tbody>";
      for (const row of rows.slice(2)) {
        t += "<tr>";
        for (const c of parseRow(row)) t += `<td>${c}</td>`;
        t += "</tr>";
      }
      t += "</tbody></table>";
      return `<div class="prose-table-wrapper">${t}</div>`;
    }
  );

  // Headings
  html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
  html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
  html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");

  // Bold + italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/gim, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/gim, "<em>$1</em>");

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2">$1</a>');

  // Paragraphs
  html = html.replace(/\n\n/gim, "</p><p>");
  html = html.replace(/\n/gim, "<br>");
  html = `<p>${html}</p>`;

  return html;
}
