import { describe, expect, it } from "vitest";
import type { Client } from "@/payload-types";
import { projectPublicBlogAuthors } from "@/lib/public-blog-authors";

describe("projectPublicBlogAuthors", () => {
  it("returns only the public author profile contract", () => {
    const authors: NonNullable<Client["authors"]> = [
      {
        id: "author-row-id",
        name: "Tracey Markham NP",
        jobTitle: "Nurse Practitioner",
        blurb: "A public biography.",
        image: {
          id: 123,
          alt: "Tracey Markham",
          url: "/api/media/file/tracey-markham-np.webp",
          width: 800,
          height: 800,
          updatedAt: "2026-07-24T00:00:00.000Z",
          createdAt: "2026-07-24T00:00:00.000Z",
        },
        expertiseTags: [{ tag: "AHPRA Registered", id: "private-row-id" }],
        socialLinks: [
          {
            platform: "linkedin",
            url: "https://www.linkedin.com/in/example",
            id: "private-social-row-id",
          },
        ],
      },
    ];

    expect(projectPublicBlogAuthors(authors)).toEqual([
      {
        id: "author-row-id",
        name: "Tracey Markham NP",
        jobTitle: "Nurse Practitioner",
        blurb: "A public biography.",
        image: {
          url: "/api/media/file/tracey-markham-np.webp",
          alt: "Tracey Markham",
          width: 800,
          height: 800,
        },
        expertiseTags: [{ tag: "AHPRA Registered" }],
        socialLinks: [
          { platform: "linkedin", url: "https://www.linkedin.com/in/example" },
        ],
      },
    ]);
  });

  it("normalises missing optional profile details", () => {
    expect(
      projectPublicBlogAuthors([
        {
          name: "Guest Author",
          image: 123,
        },
      ]),
    ).toEqual([
      {
        name: "Guest Author",
        jobTitle: null,
        blurb: null,
        image: null,
        expertiseTags: [],
        socialLinks: [],
      },
    ]);
  });
});
