/**
 * Client library for the Scrapling screenshot service (FastAPI on Railway).
 * Replaces growth-tools Puppeteer + ScreenshotOne fallbacks with a single
 * anti-bot-capable service powered by Scrapling's StealthyFetcher.
 */

const SCRAPLING_SERVICE_URL = process.env.SCRAPLING_SERVICE_URL
const SCRAPLING_SERVICE_KEY = process.env.SCRAPLING_SERVICE_KEY

export interface SocialLinksResult {
  facebook: string | null
  instagram: string | null
  linkedin: string | null
}

export interface MetaAdsResult {
  isRunningAds: boolean
  activeAdCount: number
  adScreenshots: string[] // base64-encoded PNGs
}

export async function captureScreenshotViaScrapling(
  url: string,
  opts?: {
    clickSelector?: string
    waitFor?: string
    timeout?: number
    fullPage?: boolean
  },
): Promise<Buffer | null> {
  if (!SCRAPLING_SERVICE_URL || !SCRAPLING_SERVICE_KEY) {
    console.error('[scrapling] SCRAPLING_SERVICE_URL or SCRAPLING_SERVICE_KEY not set')
    return null
  }

  const fullUrl = url.startsWith('http') ? url : `https://${url}`
  const timeout = opts?.timeout ?? 15

  try {
    const res = await fetch(`${SCRAPLING_SERVICE_URL}/screenshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': SCRAPLING_SERVICE_KEY,
      },
      body: JSON.stringify({
        url: fullUrl,
        click_selector: opts?.clickSelector ?? null,
        wait_for: opts?.waitFor ?? null,
        timeout,
        full_page: opts?.fullPage ?? false,
      }),
      signal: AbortSignal.timeout(timeout * 1000 + 15_000),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(`[scrapling] Service returned ${res.status} for ${fullUrl}: ${detail}`)
      return null
    }

    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.byteLength < 100) {
      console.error('[scrapling] Suspiciously small response for', fullUrl)
      return null
    }

    return buffer
  } catch (err) {
    console.error(`[scrapling] Failed for ${fullUrl}:`, err)
    return null
  }
}

const SOCIAL_LINKS_FALLBACK: SocialLinksResult = { facebook: null, instagram: null, linkedin: null }

export async function extractSocialLinks(
  url: string,
  opts?: { timeout?: number },
): Promise<SocialLinksResult> {
  if (!SCRAPLING_SERVICE_URL || !SCRAPLING_SERVICE_KEY) {
    console.error('[scrapling] SCRAPLING_SERVICE_URL or SCRAPLING_SERVICE_KEY not set')
    return SOCIAL_LINKS_FALLBACK
  }

  const fullUrl = url.startsWith('http') ? url : `https://${url}`
  const timeout = opts?.timeout ?? 15

  try {
    const res = await fetch(`${SCRAPLING_SERVICE_URL}/social-links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': SCRAPLING_SERVICE_KEY,
      },
      body: JSON.stringify({
        url: fullUrl,
        timeout,
      }),
      signal: AbortSignal.timeout(timeout * 1000 + 15_000),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(`[scrapling] Social links returned ${res.status} for "${fullUrl}": ${detail}`)
      return SOCIAL_LINKS_FALLBACK
    }

    const data = await res.json()
    return {
      facebook: data.facebook ?? null,
      instagram: data.instagram ?? null,
      linkedin: data.linkedin ?? null,
    }
  } catch (err) {
    console.error(`[scrapling] Social links failed for "${fullUrl}":`, err)
    return SOCIAL_LINKS_FALLBACK
  }
}

const META_ADS_FALLBACK: MetaAdsResult = { isRunningAds: false, activeAdCount: 0, adScreenshots: [] }

export async function checkMetaAdsViaScrapling(
  searchTerm: string,
  opts?: { country?: string; timeout?: number },
): Promise<MetaAdsResult> {
  if (!SCRAPLING_SERVICE_URL || !SCRAPLING_SERVICE_KEY) {
    console.error('[scrapling] SCRAPLING_SERVICE_URL or SCRAPLING_SERVICE_KEY not set')
    return META_ADS_FALLBACK
  }

  const timeout = opts?.timeout ?? 20

  try {
    const res = await fetch(`${SCRAPLING_SERVICE_URL}/meta-ads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': SCRAPLING_SERVICE_KEY,
      },
      body: JSON.stringify({
        search_term: searchTerm,
        country: opts?.country ?? 'ALL',
        timeout,
      }),
      signal: AbortSignal.timeout(timeout * 1000 + 15_000),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(`[scrapling] Meta ads returned ${res.status} for "${searchTerm}": ${detail}`)
      return META_ADS_FALLBACK
    }

    const data = await res.json()
    return {
      isRunningAds: data.isRunningAds ?? false,
      activeAdCount: data.activeAdCount ?? 0,
      adScreenshots: data.adScreenshots ?? [],
    }
  } catch (err) {
    console.error(`[scrapling] Meta ads failed for "${searchTerm}":`, err)
    return META_ADS_FALLBACK
  }
}
