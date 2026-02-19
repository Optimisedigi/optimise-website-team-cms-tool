# CMS Blog Integration Guide

Connect any client website to the Optimise Digital CMS for blog post delivery.

---

## Quick Start (3 steps)

### 1. Copy the integration file

Copy `scripts/cms-blog-integration.ts` into your client project's `lib/` directory:

```bash
cp scripts/cms-blog-integration.ts /path/to/client-website/lib/cms-blog-integration.ts
```

### 2. Set environment variables

Add to your client website's `.env.local` (development) and Vercel env vars (production):

```env
# Development
CMS_API_URL=http://localhost:3001
CMS_CLIENT_ID=<client ID>

# Production (set in Vercel dashboard or CLI)
CMS_API_URL=https://cms.optimisedigital.online
CMS_CLIENT_ID=<client ID>
```

**Finding the Client ID:** Open the CMS admin → Clients → click the client → the ID is in the URL:
`/admin/collections/clients/<ID>`

### 3. Use in your pages

```tsx
// app/blog/page.tsx — Blog listing
import { getCMSPosts } from '@/lib/cms-blog-integration';

export default async function BlogPage() {
  const posts = await getCMSPosts();

  return (
    <div>
      <h1>Blog</h1>
      {posts.map(post => (
        <a key={post.slug} href={`/blog/${post.slug}`}>
          {post.image && <img src={post.image} alt={post.imageAlt} />}
          <h2>{post.title}</h2>
          <p>{post.excerpt}</p>
          <span>{post.author} · {post.date} · {post.readTime}</span>
        </a>
      ))}
    </div>
  );
}
```

```tsx
// app/blog/[slug]/page.tsx — Single blog post
import { getCMSPostBySlug, getCMSPosts, markdownToHtml } from '@/lib/cms-blog-integration';
import { notFound } from 'next/navigation';

export async function generateStaticParams() {
  const posts = await getCMSPosts();
  return posts.map(post => ({ slug: post.slug }));
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getCMSPostBySlug(slug);
  if (!post) notFound();

  const html = markdownToHtml(post.content);

  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.author} · {post.date} · {post.readTime}</p>
      {post.image && <img src={post.image} alt={post.imageAlt} />}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
```

---

## How It Works

```
┌─────────────────────┐        ┌──────────────────────────┐
│   Client Website    │  GET   │   CMS (Payload)          │
│                     │───────▶│                          │
│  lib/cms-blog-      │        │  /api/blog-posts         │
│  integration.ts     │◀───────│  ?_status=published      │
│                     │  JSON  │  &client=<CLIENT_ID>     │
└─────────────────────┘        └──────────────────────────┘
```

1. Content team publishes a blog post in the CMS admin (cms.optimisedigital.online)
2. They set `_status` to "Published" using the Publish button
3. Client website fetches published posts via the REST API on each page load
4. Posts are rendered using the client website's own design/layout

**Key points:**
- Posts are fetched at request time (`cache: "no-store"`) so changes appear immediately
- Each client only sees their own posts (filtered by `CMS_CLIENT_ID`)
- If the CMS is unreachable, the function returns an empty array (graceful fallback)
- Local markdown files can coexist — see the Optimise Digital website for an example of merging both sources

---

## Available Functions

| Function | Description |
|---|---|
| `getCMSPosts()` | Fetch all published posts for this client, sorted newest-first |
| `getCMSPostBySlug(slug)` | Fetch a single post by its URL slug |
| `getCMSTags()` | Get all unique tags across published posts |
| `markdownToHtml(md)` | Convert markdown content to HTML |

---

## BlogPost Type

```typescript
interface BlogPost {
  slug: string;      // URL-friendly identifier
  title: string;     // Post title (H1)
  date: string;      // Published date (YYYY-MM-DD)
  author: string;    // Author name
  excerpt: string;   // Short summary (max 160 chars)
  content: string;   // Full post content (markdown)
  readTime: string;  // e.g. "5 min read"
  image?: string;    // Featured image URL (hosted on CMS)
  imageAlt?: string; // Image alt text
  tags?: string[];   // Category tags
}
```

---

## Adding a New Client Website

1. **Create the client in the CMS:**
   - Go to CMS admin → Clients → Create New
   - Fill in name, website URL, slug
   - Note the client ID from the URL

2. **Copy the integration file** into the new project's `lib/` directory

3. **Set environment variables** (see step 2 above)

4. **Build blog pages** using the functions — see the code examples above

5. **Deploy** — set `CMS_API_URL` and `CMS_CLIENT_ID` in your hosting platform's env vars

---

## Merging CMS Posts with Local Markdown

If the client website also has local markdown blog posts (in `content/blog/`), you can merge both sources:

```typescript
import { getCMSPosts, BlogPost } from '@/lib/cms-blog-integration';
import { getLocalPosts } from './local-blog'; // your local markdown loader

export async function getAllPosts(): Promise<BlogPost[]> {
  const localPosts = getLocalPosts();
  const cmsPosts = await getCMSPosts();

  // Local posts take priority for duplicate slugs
  const localSlugs = new Set(localPosts.map(p => p.slug));
  const dedupedCMS = cmsPosts.filter(p => !localSlugs.has(p.slug));

  return [...localPosts, ...dedupedCMS]
    .sort((a, b) => (a.date > b.date ? -1 : 1));
}
```

---

## Vercel Environment Variables (CLI)

```bash
# Set production CMS URL
echo "https://cms.optimisedigital.online" | vercel env add CMS_API_URL production

# Set client ID
echo "<CLIENT_ID>" | vercel env add CMS_CLIENT_ID production

# Redeploy to pick up new env vars
vercel --prod
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| No posts appearing | Check `CMS_API_URL` and `CMS_CLIENT_ID` are set correctly |
| Posts visible in CMS but not on site | Make sure you clicked **Publish** (not just set status dropdown) |
| 403 / "not allowed" error | The blog-posts collection needs `access: { read: () => true }` |
| Images not loading | Check that the CMS domain is in your `next.config.ts` images domains |
| Timeout errors | CMS may be cold-starting — the 5s timeout will retry on next request |

### Image Domain Config

If blog post images aren't loading, add the CMS domain to your Next.js config:

```typescript
// next.config.ts
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cms.optimisedigital.online',
      },
      {
        // Vercel Blob storage (where media files are stored)
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
    ],
  },
};
```
