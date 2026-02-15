/**
 * Website screenshot capture using Google PageSpeed Insights API.
 * Requires GOOGLE_PAGESPEED_API_KEY env var. Works on serverless (no Puppeteer/Chrome needed).
 * Returns a base64-encoded JPEG screenshot or null on failure.
 */
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

  for (const variant of urlVariants) {
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(variant)}&category=performance&strategy=desktop${keyParam}`

    // Retry up to 2 times with a 45-second timeout
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(apiUrl, { signal: AbortSignal.timeout(45000) })
        if (!res.ok) {
          console.error(`[screenshots] PageSpeed API returned ${res.status} for ${variant} (attempt ${attempt + 1})`)
          continue
        }

        const data = await res.json()
        const screenshot = data?.lighthouseResult?.audits?.['final-screenshot']?.details?.data
        if (!screenshot || typeof screenshot !== 'string') {
          console.error(`[screenshots] No screenshot in PageSpeed response for ${variant}`)
          continue
        }

        // PageSpeed returns "data:image/jpeg;base64,..." — strip the prefix to return raw base64
        const base64 = screenshot.replace(/^data:image\/\w+;base64,/, '')
        return base64
      } catch (err) {
        console.error(`[screenshots] Failed to capture ${variant} (attempt ${attempt + 1}):`, err)
      }
    }
  }

  return null
}
