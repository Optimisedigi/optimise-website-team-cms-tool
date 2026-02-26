/**
 * Website screenshot capture — tiered approach:
 *   1. Scrapling service (Railway, anti-bot) → Vercel Blob storage
 *   2. Google PageSpeed Insights API (free fallback, returns base64)
 *
 * Legacy tiers (still exported for backward compat):
 *   3. Growth-tools Puppeteer endpoint
 *   4. ScreenshotOne API (paid)
 */

import { captureScreenshotViaScrapling } from './scrapling-service'
import { uploadScreenshotToBlob } from './blob-upload'

export interface ScreenshotOptions {
  /** CSS selector to click before capturing (e.g. age-gate "Enter site" button) */
  clickSelector?: string;
  /** Custom JS to execute before capturing (runs after click if both set) */
  scripts?: string;
}

/**
 * Primary: Google PageSpeed Insights API.
 * Extracts the "final-screenshot" audit from Lighthouse results.
 * Free, no API key required (but rate-limited without one).
 */
export async function captureWebsiteScreenshot(url: string): Promise<string | null> {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY || ''
  const keyParam = apiKey ? `&key=${apiKey}` : ''

  const fullUrl = url.startsWith('http') ? url : `https://${url}`
  const urlVariants = [fullUrl]
  try {
    const parsed = new URL(fullUrl)
    if (parsed.hostname.startsWith('www.')) {
      urlVariants.push(fullUrl.replace('://www.', '://'))
    } else {
      urlVariants.push(fullUrl.replace('://', '://www.'))
    }
  } catch {
    // Invalid URL — just try the original
  }

  for (const strategy of ['desktop', 'mobile'] as const) {
    for (const variant of urlVariants) {
      const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(variant)}&category=performance&strategy=${strategy}${keyParam}`

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(apiUrl, { signal: AbortSignal.timeout(45000) })
          if (!res.ok) {
            console.error(`[screenshots] PageSpeed API returned ${res.status} for ${variant} strategy=${strategy} (attempt ${attempt + 1})`)
            continue
          }

          const data = await res.json()
          const screenshot = data?.lighthouseResult?.audits?.['final-screenshot']?.details?.data
          if (!screenshot || typeof screenshot !== 'string') {
            console.error(`[screenshots] No screenshot in PageSpeed response for ${variant} strategy=${strategy}`)
            continue
          }

          return screenshot.replace(/^data:image\/\w+;base64,/, '')
        } catch (err) {
          console.error(`[screenshots] PageSpeed failed for ${variant} strategy=${strategy} (attempt ${attempt + 1}):`, err)
        }
      }
    }
  }

  return null
}

/**
 * Fallback: growth-tools Puppeteer endpoint.
 * Requires GROWTH_TOOLS_URL and INTERNAL_API_KEY env vars.
 */
export async function captureScreenshotViaGrowthTools(url: string, opts?: ScreenshotOptions): Promise<string | null> {
  const growthToolsUrl = process.env.GROWTH_TOOLS_URL
  const apiKey = process.env.INTERNAL_API_KEY
  if (!growthToolsUrl || !apiKey) return null

  const fullUrl = url.startsWith('http') ? url : `https://${url}`
  const params = new URLSearchParams({ url: fullUrl })
  if (opts?.clickSelector) params.set('click', opts.clickSelector)
  if (opts?.scripts) params.set('scripts', opts.scripts)

  try {
    const res = await fetch(
      `${growthToolsUrl}/api/screenshot?${params}`,
      {
        headers: { 'x-internal-key': apiKey },
        signal: AbortSignal.timeout(30000),
      },
    )
    if (!res.ok) {
      console.error(`[screenshots] Growth-tools returned ${res.status} for ${fullUrl}`)
      return null
    }

    const data = await res.json()
    const screenshot = data?.screenshot
    if (!screenshot || typeof screenshot !== 'string') {
      console.error(`[screenshots] No screenshot in growth-tools response for ${fullUrl}`)
      return null
    }

    return screenshot.replace(/^data:image\/\w+;base64,/, '')
  } catch (err) {
    console.error(`[screenshots] Growth-tools failed for ${fullUrl}:`, err)
    return null
  }
}

/**
 * Last-resort: ScreenshotOne API (paid).
 * Only called as a backfill for screenshots that failed with PageSpeed + Puppeteer.
 * Requires SCREENSHOTONE_ACCESS_KEY env var.
 */
export async function captureScreenshotViaScreenshotOne(url: string, opts?: ScreenshotOptions): Promise<string | null> {
  const accessKey = process.env.SCREENSHOTONE_ACCESS_KEY
  if (!accessKey) {
    console.error('[screenshots] SCREENSHOTONE_ACCESS_KEY not set — skipping paid backfill')
    return null
  }

  const fullUrl = url.startsWith('http') ? url : `https://${url}`

  const params = new URLSearchParams({
    access_key: accessKey,
    url: fullUrl,
    viewport_width: '1280',
    viewport_height: '900',
    format: 'png',
    block_ads: 'true',
    block_cookie_banners: 'true',
    block_chats: 'true',
    delay: '3',
    timeout: '30',
    image_quality: '80',
  })

  // ScreenshotOne native click + scripts support (e.g. dismiss age gates)
  if (opts?.clickSelector) params.set('click', opts.clickSelector)
  if (opts?.scripts) params.set('scripts', opts.scripts)

  try {
    const res = await fetch(`https://api.screenshotone.com/take?${params}`, {
      signal: AbortSignal.timeout(45000),
    })

    if (!res.ok) {
      console.error(`[screenshots] ScreenshotOne returned ${res.status} for ${fullUrl}`)
      return null
    }

    const buffer = await res.arrayBuffer()
    if (buffer.byteLength < 100) {
      console.error('[screenshots] ScreenshotOne returned suspiciously small response')
      return null
    }

    return Buffer.from(buffer).toString('base64')
  } catch (err) {
    console.error(`[screenshots] ScreenshotOne failed for ${fullUrl}:`, err)
    return null
  }
}

/**
 * Orchestrator: try Scrapling service (→ Blob URL), fall back to PageSpeed (→ base64).
 * Returns a Blob URL string, a base64 string, or null.
 */
export async function captureAndUploadScreenshot(
  url: string,
  opts?: ScreenshotOptions,
): Promise<string | null> {
  // Tier 1: Scrapling service → Vercel Blob
  const buffer = await captureScreenshotViaScrapling(url, {
    clickSelector: opts?.clickSelector,
  })
  if (buffer) {
    const blobUrl = await uploadScreenshotToBlob(buffer, url)
    if (blobUrl) return blobUrl
    // Blob upload failed — fall through to base64 fallback but convert this buffer
    console.error('[screenshots] Blob upload failed, returning base64 from Scrapling buffer')
    return buffer.toString('base64')
  }

  // Tier 2: PageSpeed (free, returns base64)
  const base64 = await captureWebsiteScreenshot(url)
  return base64
}
