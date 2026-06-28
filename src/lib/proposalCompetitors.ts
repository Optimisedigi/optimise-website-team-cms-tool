export interface ProposalKeywordInput {
  text: string
  monthlySearchVolume: number
}

export function extractProposalKeywords(campaignProposal: any): ProposalKeywordInput[] {
  const keywordMap = new Map<string, ProposalKeywordInput>()
  const campaigns = Array.isArray(campaignProposal?.proposedCampaigns)
    ? campaignProposal.proposedCampaigns
    : []

  for (const campaign of campaigns) {
    const adGroups = Array.isArray(campaign?.adGroups) ? campaign.adGroups : []
    for (const adGroup of adGroups) {
      const topKeywords = Array.isArray(adGroup?.topKeywords) ? adGroup.topKeywords : []
      for (const keyword of topKeywords) {
        const text = typeof keyword?.text === 'string' ? keyword.text.trim() : ''
        const monthlySearchVolume = Number(keyword?.volume ?? keyword?.monthlySearchVolume ?? 0)
        if (!text || !Number.isFinite(monthlySearchVolume) || monthlySearchVolume < 0) continue

        const key = text.toLowerCase()
        const existing = keywordMap.get(key)
        if (!existing || monthlySearchVolume > existing.monthlySearchVolume) {
          keywordMap.set(key, { text, monthlySearchVolume })
        }
      }
    }
  }

  return Array.from(keywordMap.values()).sort((a, b) => b.monthlySearchVolume - a.monthlySearchVolume)
}

export function extractManualCompetitorDomains(manualCompetitors: any): string[] {
  if (!Array.isArray(manualCompetitors)) return []

  return manualCompetitors
    .map((competitor) => typeof competitor?.domain === 'string' ? competitor.domain.trim() : '')
    .filter(Boolean)
}
