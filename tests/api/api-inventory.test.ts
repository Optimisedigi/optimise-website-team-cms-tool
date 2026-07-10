import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

function readInventoryJson(): any {
  const doc = readFileSync('docs/api-endpoint-inventory.md', 'utf8')
  const match = doc.match(/```json\n([\s\S]*)\n```\s*$/)
  expect(match).not.toBeNull()
  return JSON.parse(match?.[1] ?? '{}')
}

function currentCmsRouteFiles(): string[] {
  return execFileSync('find', ['src/app/(frontend)/api', '-path', '*/route.ts', '-type', 'f'], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .sort()
}

describe('API endpoint inventory', () => {
  it('documents CMS and Growth Tools endpoints for integration-test planning', () => {
    expect(existsSync('docs/api-endpoint-inventory.md')).toBe(true)
    const doc = readFileSync('docs/api-endpoint-inventory.md', 'utf8')

    expect(doc).toContain('CMS route files inventoried: 303')
    expect(doc).toContain('Growth Tools route registrations inventoried: 267')
    expect(doc).toContain('CMS → Growth Tools calls detected: 48')
    expect(doc).toContain('`/api/dashboard`')
    expect(doc).toContain('`/api/proposals/[id]/run-audits`')
    expect(doc).toContain('CMS → Growth Tools calls')
    expect(doc).toContain('Growth Tools endpoints')
  })

  it('fails when the checked-in endpoint inventory drifts from current route files', () => {
    const inventory = readInventoryJson()
    const currentFiles = currentCmsRouteFiles()
    const inventoriedFiles = inventory.cmsRows.map((row: { file: string }) => row.file).sort()

    expect(inventoriedFiles).toEqual(currentFiles)
    expect(inventory.cmsRows).toHaveLength(currentFiles.length)
    expect(inventory.cmsRows.find((row: { route: string; file: string }) => row.route === '/api/dashboard')?.file).toBe(
      'src/app/(frontend)/api/dashboard/route.ts',
    )
    expect(inventory.cmsRows.find((row: { route: string; file: string }) => row.route === '/api/google-ads-audits/[id]/chat')?.file).toBe(
      'src/app/(frontend)/api/google-ads-audits/[id]/chat/route.ts',
    )
  })

  it('maps CMS outbound Growth Tools calls to Growth Tools route registrations', () => {
    const inventory = readInventoryJson()
    expect(inventory.growthToolsCallRows).toEqual(expect.any(Array))
    expect(inventory.growthToolsCallRows.length).toBe(48)

    expect(inventory.growthToolsCallRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cmsRoute: '/api/google-ads-audits/[id]/run-audit',
          method: 'POST',
          path: '/api/google-ads/comprehensive-audit',
          matchedGrowthToolsRoute: '/api/google-ads/comprehensive-audit',
        }),
        expect.objectContaining({
          cmsRoute: '/api/proposals/[id]/run-audits',
          method: 'POST',
          path: '/api/seo-audits',
          matchedGrowthToolsRoute: '/api/seo-audits',
        }),
        expect.objectContaining({
          cmsRoute: '/api/gsc/indexing-helper/sites',
          method: 'GET',
          path: '/api/search-console/sites',
          matchedGrowthToolsRoute: '/api/search-console/sites',
        }),
        expect.objectContaining({
          cmsRoute: '/api/google-ads/change-tracker',
          method: 'GET',
          path: '/api/google-ads/campaign-budgets/get-metrics',
          matchedGrowthToolsRoute: '/api/google-ads/campaign-budgets/get-metrics',
        }),
      ]),
    )
  })

  it('surfaces CMS Growth Tools calls that do not currently match the Growth Tools repo', () => {
    const inventory = readInventoryJson()
    expect(inventory.unmatchedGrowthToolsCalls).toEqual([
      expect.objectContaining({ cmsRoute: '/api/consolidation-candidates/[id]/approve', method: 'POST', path: '/api/google-ads/consolidation-apply' }),
      expect.objectContaining({ cmsRoute: '/api/match-type-violations/cron', method: 'POST', path: '/api/google-ads/consolidation-candidates' }),
      expect.objectContaining({ cmsRoute: '/api/match-type-violations/cron', method: 'POST', path: '/api/google-ads/keywords/list' }),
      expect.objectContaining({ cmsRoute: '/api/proposals/[id]/run-ai-visibility', method: 'POST', path: '/api/ai-visibility/run-once' }),
      expect.objectContaining({ cmsRoute: '/api/proposals/[id]/run-serp-displacement', method: 'POST', path: '/api/serp-displacement/run-once' }),
    ])
  })
})
