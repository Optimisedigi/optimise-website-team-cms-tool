/** Blog post Sources column (2026-10-16). Additive only. Shared by the Payload migration and /api/migrate. */
export const BLOG_POST_SOURCES_SCHEMA: readonly [string, string][] = [
  ['blog_posts.sources', 'ALTER TABLE `blog_posts` ADD `sources` text'],
  ['_blog_posts_v.version_sources', 'ALTER TABLE `_blog_posts_v` ADD `version_sources` text'],
]
