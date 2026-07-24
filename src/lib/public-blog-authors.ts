import type { Client, Media } from "@/payload-types";

export interface PublicBlogAuthor {
  id?: string;
  name: string;
  jobTitle: string | null;
  blurb: string | null;
  image: {
    url: string;
    alt: string;
    width: number | null;
    height: number | null;
  } | null;
  expertiseTags: { tag: string }[];
  socialLinks: {
    platform: "website" | "linkedin" | "twitter" | "facebook" | "instagram" | "youtube";
    url: string;
  }[];
}

type ClientAuthor = NonNullable<Client["authors"]>[number];

function publicImage(image: ClientAuthor["image"]): PublicBlogAuthor["image"] {
  if (!image || typeof image !== "object") return null;

  const media = image as Media;
  if (!media.url) return null;

  return {
    url: media.url,
    alt: media.alt || "",
    width: media.width ?? null,
    height: media.height ?? null,
  };
}

export function projectPublicBlogAuthors(authors: Client["authors"]): PublicBlogAuthor[] {
  if (!authors) return [];

  return authors.map((author) => ({
    ...(author.id ? { id: author.id } : {}),
    name: author.name,
    jobTitle: author.jobTitle || null,
    blurb: author.blurb || null,
    image: publicImage(author.image),
    expertiseTags: (author.expertiseTags || []).map(({ tag }) => ({ tag })),
    socialLinks: (author.socialLinks || []).map(({ platform, url }) => ({ platform, url })),
  }));
}
