import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

function generatedGoogleAdsScript() {
  const componentSource = readFileSync(
    resolve(process.cwd(), 'src/components/NegativeKeywordListInfo.tsx'),
    'utf8',
  )
  const match = componentSource.match(/const GOOGLE_ADS_SCRIPT = `([\s\S]*?)`\n\nfunction slugify/)

  if (!match) throw new Error('Could not extract GOOGLE_ADS_SCRIPT')
  return match[1]
}

describe('negative keyword Google Ads script', () => {
  it('logs creation errors, skips the failed list, and continues with later lists', () => {
    const script = generatedGoogleAdsScript()
    const logs: string[] = []
    const getErrors = vi.fn(() => ['Shared negative keyword list limit reached'])
    const addNegativeKeywords = vi.fn()
    const existingList = {
      negativeKeywords: () => ({ get: () => ({ hasNext: () => false }) }),
      addNegativeKeywords,
    }

    const AdsApp = {
      currentAccount: () => ({ getCustomerId: () => '342-535-3766' }),
      negativeKeywordLists: () => ({
        withCondition: (condition: string) => ({
          get: () => ({
            hasNext: () => condition.includes('Later list'),
            next: () => existingList,
          }),
        }),
      }),
      newNegativeKeywordListBuilder: () => ({
        withName: () => ({
          build: () => ({ getResult: () => null, getErrors }),
        }),
      }),
      campaigns: () => ({ get: () => ({ hasNext: () => false }) }),
    }
    const UrlFetchApp = {
      fetch: () => ({
        getContentText: () =>
          JSON.stringify({
            ok: true,
            clientName: 'Away Digital Teams',
            lists: [
              { name: 'Failed list', keywords: [{ keyword: 'failed term', matchType: 'exact' }] },
              { name: 'Later list', keywords: [{ keyword: 'later term', matchType: 'exact' }] },
            ],
          }),
      }),
    }
    const Logger = { log: (message: string) => logs.push(message) }

    const main = new Function('AdsApp', 'UrlFetchApp', 'Logger', `${script}\nreturn main;`)(
      AdsApp,
      UrlFetchApp,
      Logger,
    )
    main()

    expect(getErrors).toHaveBeenCalledOnce()
    expect(logs).toContain(
      'ERROR: Failed to create list "Failed list": Shared negative keyword list limit reached',
    )
    expect(addNegativeKeywords).toHaveBeenCalledOnce()
    expect(addNegativeKeywords).toHaveBeenCalledWith(['[later term]'])
    expect(logs).toContain('Synced 1 keywords to list: Later list (0 broad, 0 phrase, 1 exact)')
  })

  it('attaches lists to matching shopping campaigns, not just search campaigns', () => {
    const script = generatedGoogleAdsScript()
    const logs: string[] = []
    const attached: string[] = []
    const negList = {
      negativeKeywords: () => ({ get: () => ({ hasNext: () => false }) }),
      addNegativeKeywords: vi.fn(),
    }
    const selectorOf = (names: string[]) => () => ({
      withCondition: () => ({
        get: () => {
          let i = 0
          return {
            hasNext: () => i < names.length,
            next: () => {
              const name = names[i++]!
              return {
                getName: () => name,
                addNegativeKeywordList: () => attached.push(name),
              }
            },
          }
        },
      }),
    })

    const AdsApp = {
      currentAccount: () => ({ getCustomerId: () => '342-535-3766' }),
      negativeKeywordLists: () => ({
        withCondition: () => ({ get: () => ({ hasNext: () => true, next: () => negList }) }),
      }),
      campaigns: selectorOf(['brand_search']),
      shoppingCampaigns: selectorOf(['shopping_sydney_product', 'shopping_roselands_product']),
    }
    const UrlFetchApp = {
      fetch: () => ({
        getContentText: () =>
          JSON.stringify({
            ok: true,
            lists: [
              {
                name: '[OD] Shopping Product',
                campaignRegex: 'shopping',
                keywords: [{ keyword: 'free', matchType: 'exact' }],
              },
            ],
          }),
      }),
    }
    const Logger = { log: (message: string) => logs.push(message) }

    new Function('AdsApp', 'UrlFetchApp', 'Logger', `${script}\nreturn main;`)(
      AdsApp,
      UrlFetchApp,
      Logger,
    )()

    expect(attached).toEqual(['shopping_sydney_product', 'shopping_roselands_product'])
    expect(logs).toContain('Assigned list "[OD] Shopping Product" to 2 campaign(s)')
  })
})
