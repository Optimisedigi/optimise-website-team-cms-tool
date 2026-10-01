/** Upper bound on buttons under one reply. */
export const MAX_CLIENT_LINKS = 40

/** CMS admin collections AdminMate may link a record in. */
const ADMIN_COLLECTIONS = [
  'clients',
  'contracts',
  'client-proposals',
  'client-discovery-briefings',
  'seo-audits',
  'seo-audit-proposals',
  'cro-audits',
  'google-ads-audits',
  'competitor-analyses',
  'site-health-reports',
  'tag-setup-audits',
  'gsc-indexing-audits',
  'seo-migration-checks',
].join('|')

/**
 * One URL-encoded path segment (see encodeURIComponent): never `/`, `\` or `:`,
 * and never a bare `.` or `..`, so a link cannot step out of its folder.
 */
const SEG = '(?!\\.{1,2}(?:/|$))[A-Za-z0-9._~%-]+'

/** Same-origin CMS pages AdminMate may render as clickable links; anything else is dropped. */
const SAFE_PATH = new RegExp(
  '^/(?:' +
    [
      `admin/collections/(?:${ADMIN_COLLECTIONS})/\\d+`,
      'api/contracts/\\d+/(?:preview-pdf|download-pdf)',
      `client/${SEG}/hub`,
      `client/${SEG}/discovery/\\d{3,}`,
      `client-proposal/${SEG}/discovery/\\d{3,}`,
      `proposals/${SEG}`,
      `audits/${SEG}`,
      `seo-audit-proposals/${SEG}/v2`,
      `reports/${SEG}`,
      `negative-keyword-build/${SEG}`,
      `partners/${SEG}/${SEG}/?`,
    ].join('|') +
    ')$',
)

/** Absolute https URL with a plain host (no credentials, spaces or backslashes). */
const SAFE_HTTPS = /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:[/?#][^\s\\]*)?$/

/**
 * A link AdminMate may show. `external` links are URLs an admin saved on the
 * client record (hub links, legacy deck URLs); they must be https and are
 * labelled as external in the chat. All other links must be allow-listed CMS pages.
 */
export interface ClientLink {
  label: string
  href: string
  external?: true
}

/** Hub path for any stored slug; encoding keeps unusual slugs inside one path segment. */
export function clientHubHref(slug: string): string {
  return `/client/${encodeURIComponent(slug)}/hub`
}

export function isSafeClientLinkHref(href: unknown): href is string {
  return typeof href === 'string' && SAFE_PATH.test(href)
}

export function isSafeExternalHref(href: unknown): href is string {
  return typeof href === 'string' && SAFE_HTTPS.test(href)
}

/** Validates an untrusted link object; returns a clean copy or null. */
export function toSafeClientLink(value: unknown): ClientLink | null {
  if (!value || typeof value !== 'object') return null
  const { label, href, external } = value as { label?: unknown; href?: unknown; external?: unknown }
  if (typeof label !== 'string' || !label.trim()) return null
  const clean = label.trim().slice(0, 160)
  if (isSafeClientLinkHref(href)) return { label: clean, href }
  if (external === true && isSafeExternalHref(href)) return { label: clean, href, external: true }
  return null
}
