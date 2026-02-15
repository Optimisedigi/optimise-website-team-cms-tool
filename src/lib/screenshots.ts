/**
 * Website screenshot capture using Google PageSpeed Insights API.
 * Requires GOOGLE_PAGESPEED_API_KEY env var. Works on serverless (no Puppeteer/Chrome needed).
 * Returns a base64-encoded JPEG screenshot or null on failure.
 */
export async function captureWebsiteScreenshot(url: string): Promise<string | null> {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY || ''
  const keyParam = apiKey ? `&key=${apiKey}` : ''

  const fullUrl = url.startsWith('http') ? url : `https://${url}`
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(fullUrl)}&category=performance&strategy=desktop${keyParam}`

  // Retry up to 2 times with a 45-second timeout (matching growth-tools approach)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(45000) })
      if (!res.ok) {
        console.error(`[screenshots] PageSpeed API returned ${res.status} for ${url} (attempt ${attempt + 1})`)
        continue
      }

      const data = await res.json()
      const screenshot = data?.lighthouseResult?.audits?.['final-screenshot']?.details?.data
      if (!screenshot || typeof screenshot !== 'string') {
        console.error(`[screenshots] No screenshot in PageSpeed response for ${url}`)
        continue
      }

      // PageSpeed returns "data:image/jpeg;base64,..." — strip the prefix to return raw base64
      const base64 = screenshot.replace(/^data:image\/\w+;base64,/, '')
      return base64
    } catch (err) {
      console.error(`[screenshots] Failed to capture ${url} (attempt ${attempt + 1}):`, err)
    }
  }

  return null
}
