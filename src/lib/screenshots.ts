/**
 * Website screenshot capture using Google PageSpeed Insights API.
 * Requires GOOGLE_PAGESPEED_API_KEY env var. Works on serverless (no Puppeteer/Chrome needed).
 * Returns a base64-encoded JPEG screenshot or null on failure.
 */

function extractScreenshot(data: any): string | null {
  const screenshot = data?.lighthouseResult?.audits?.['final-screenshot']?.details?.data
  if (!screenshot || typeof screenshot !== 'string') return null
  // PageSpeed returns "data:image/jpeg;base64,..." — strip the prefix to return raw base64
  return screenshot.replace(/^data:image\/\w+;base64,/, '')
}

export async function captureWebsiteScreenshot(url: string): Promise<string | null> {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY || ''
  const keyParam = apiKey ? `&key=${apiKey}` : ''

  // Try the given URL first, then alternate formats (with/without www)
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

  // Try desktop strategy first, then mobile as fallback (mobile succeeds more often)
  for (const strategy of ['desktop', 'mobile'] as const) {
    for (const variant of urlVariants) {
      const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(variant)}&category=performance&strategy=${strategy}${keyParam}`

      // Retry up to 2 times with a 45-second timeout
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(apiUrl, { signal: AbortSignal.timeout(45000) })
          if (!res.ok) {
            console.error(`[screenshots] PageSpeed API returned ${res.status} for ${variant} strategy=${strategy} (attempt ${attempt + 1})`)
            continue
          }

          const data = await res.json()
          const base64 = extractScreenshot(data)
          if (!base64) {
            console.error(`[screenshots] No screenshot in PageSpeed response for ${variant} strategy=${strategy}`)
            continue
          }

          return base64
        } catch (err) {
          console.error(`[screenshots] Failed to capture ${variant} strategy=${strategy} (attempt ${attempt + 1}):`, err)
        }
      }
    }
  }

  return null
}

/**
 * Fallback screenshot capture via growth-tools Puppeteer endpoint.
 * Requires GROWTH_TOOLS_URL and INTERNAL_API_KEY env vars.
 * Returns a base64-encoded screenshot or null on failure.
 */
export async function captureScreenshotViaGrowthTools(url: string): Promise<string | null> {
  const growthToolsUrl = process.env.GROWTH_TOOLS_URL
  const apiKey = process.env.INTERNAL_API_KEY
  if (!growthToolsUrl || !apiKey) return null

  const fullUrl = url.startsWith('http') ? url : `https://${url}`

  try {
    const res = await fetch(
      `${growthToolsUrl}/api/screenshot?url=${encodeURIComponent(fullUrl)}`,
      {
        headers: { 'x-internal-key': apiKey },
        signal: AbortSignal.timeout(30000),
      },
    )
    if (!res.ok) {
      console.error(`[screenshots] Growth-tools screenshot returned ${res.status} for ${fullUrl}`)
      return null
    }

    const data = await res.json()
    const screenshot = data?.screenshot
    if (!screenshot || typeof screenshot !== 'string') {
      console.error(`[screenshots] No screenshot in growth-tools response for ${fullUrl}`)
      return null
    }

    // Strip data URI prefix if present
    return screenshot.replace(/^data:image\/\w+;base64,/, '')
  } catch (err) {
    console.error(`[screenshots] Growth-tools screenshot failed for ${fullUrl}:`, err)
    return null
  }
}
