import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { getPayload } from "payload";
import config from "../src/payload.config";

const SOURCE_PATH = process.env.WE_CAN_QUIT_ILLEGAL_VAPE_BLOG_SOURCE_PATH;
const SLUG = "illegal-vape-harms-australia";
const META_TITLE =
  "The Health Risks of Illegal Vapes: What Australians Need to Know | We Can Quit";

function readingTime(content: string): string {
  return `${Math.max(1, Math.ceil(content.trim().split(/\s+/).length / 200))} min read`;
}

async function main() {
  if (!SOURCE_PATH) {
    throw new Error(
      "Set WE_CAN_QUIT_ILLEGAL_VAPE_BLOG_SOURCE_PATH to the source markdown file.",
    );
  }

  const source = await fs.readFile(SOURCE_PATH, "utf8");
  const { data, content } = matter(source);
  const imagePath = path.join(
    path.dirname(SOURCE_PATH),
    "../../..",
    "public",
    String(data.image).replace(/^\//, ""),
  );
  const filename = path.basename(imagePath);
  const payload = await getPayload({ config: await config });

  const clientResult = await payload.find({
    collection: "clients",
    where: { name: { equals: "We Can Quit" } },
    limit: 1,
    overrideAccess: true,
  });
  const client = clientResult.docs[0];
  if (!client) throw new Error('Client "We Can Quit" was not found.');

  const existingMedia = await payload.find({
    collection: "media",
    where: { filename: { equals: filename } },
    limit: 1,
    overrideAccess: true,
  });
  const media =
    existingMedia.docs[0] ??
    (await payload.create({
      collection: "media",
      data: { alt: String(data.imageAlt), caption: "" },
      filePath: imagePath,
      overrideAccess: true,
    }));

  const postData = {
    client: client.id,
    clientConfirmed: true,
    title: String(data.title),
    slug: SLUG,
    metaTitle: META_TITLE,
    metaDescription: String(data.excerpt),
    excerpt: String(data.excerpt),
    markdownContent: content,
    readingTime: readingTime(content),
    featuredImage: media.id,
    featuredImageAlt: String(data.imageAlt),
    tags: data.tags,
    author: String(data.author),
    publishedDate: new Date(data.date).toISOString(),
    status: "published" as const,
    _status: "published" as const,
  };

  const existingPost = await payload.find({
    collection: "blog-posts",
    where: { slug: { equals: SLUG } },
    limit: 1,
    overrideAccess: true,
  });

  const post = existingPost.docs[0]
    ? await payload.update({
        collection: "blog-posts",
        id: existingPost.docs[0].id,
        data: postData,
        overrideAccess: true,
      })
    : await payload.create({
        collection: "blog-posts",
        data: postData,
        overrideAccess: true,
      });

  console.log(`${existingPost.docs[0] ? "Updated" : "Created"}: ${post.slug}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
