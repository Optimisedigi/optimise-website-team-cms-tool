# Public blog authors API

Websites that consume CMS blog posts should resolve each post's `author` value against this endpoint instead of maintaining a separate hard-coded author list.

## Request

```http
GET /api/public/blog-authors/{clientId}
```

Example:

```http
GET https://cms.optimisedigital.online/api/public/blog-authors/5
```

No API key is required. The route intentionally projects only public author-profile fields and never returns the rest of the client record.

## Response

```json
{
  "authors": [
    {
      "id": "author-row-id",
      "name": "Tracey Markham NP",
      "jobTitle": "Nurse Practitioner",
      "blurb": "Public author biography",
      "image": {
        "url": "/api/media/file/tracey-markham-np.webp",
        "alt": "Tracey Markham",
        "width": 800,
        "height": 800
      },
      "expertiseTags": [{ "tag": "AHPRA Registered" }],
      "socialLinks": [
        { "platform": "linkedin", "url": "https://www.linkedin.com/in/example" }
      ]
    }
  ]
}
```

Image URLs beginning with `/` must be resolved against the CMS origin. Match a blog post to a profile using the exact author name. Consumers should cache the response and retain a generic local fallback for unavailable or unmatched profiles.

The endpoint is CDN-cacheable for five minutes and may serve stale data while revalidating. Invalid IDs return `400`, missing clients return `404`, and unexpected failures return `500`.
