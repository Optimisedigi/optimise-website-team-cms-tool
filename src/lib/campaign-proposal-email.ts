type ProposalKeyword = {
  text?: string | null
}

type ProposedAdGroup = {
  name?: string | null
  keywords?: ProposalKeyword[] | null
  totalMonthlyVolume?: number | null
  landingPage?: {
    url?: string | null
    status?: 'exists' | 'needs-improvement' | 'create' | string | null
  } | null
}

type ProposedCampaign = {
  name?: string | null
  adGroups?: ProposedAdGroup[] | null
}

type CampaignProposalEmailData = {
  businessName?: string | null
  location?: string | null
  proposedCampaigns?: ProposedCampaign[] | null
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatNumber(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString('en-AU')
}

function sampleKeywords(adGroup: ProposedAdGroup): string {
  const keywords = Array.isArray(adGroup.keywords) ? adGroup.keywords : []
  return keywords
    .map((keyword) => keyword?.text?.trim())
    .filter((text): text is string => Boolean(text))
    .slice(0, 4)
    .join(', ')
}

function landingPageLabel(status: string | null | undefined): string {
  if (status === 'create') return 'NEW'
  if (status === 'needs-improvement') return 'REVIEW'
  return 'LIVE'
}

export function buildCampaignProposalEmailHtml(proposal: CampaignProposalEmailData): string {
  const campaigns = Array.isArray(proposal.proposedCampaigns) ? proposal.proposedCampaigns : []
  const adGroupCount = campaigns.reduce(
    (sum, campaign) => sum + (campaign.adGroups?.length ?? 0),
    0,
  )
  const country = proposal.location?.trim() || 'Australia'

  const rows = campaigns
    .flatMap((campaign) => {
      const campaignName = escapeHtml(campaign.name || 'Campaign')
      const campaignRow = `
      <tr>
        <td colspan="5" style="background:#eef6ff;border-top:2px solid #bfdbfe;border-bottom:2px solid #bfdbfe;color:#1d4ed8;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;padding:14px 18px;">
          Campaign: ${campaignName}
        </td>
      </tr>`

      const adGroupRows = (campaign.adGroups ?? []).map((adGroup) => {
        const status = adGroup.landingPage?.status
        const badge = landingPageLabel(status)
        return `
        <tr>
          <td style="border-bottom:1px solid #e2e8f0;color:#172033;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.25;padding:12px 18px;vertical-align:top;width:22%;">${escapeHtml(adGroup.name || 'Ad group')}</td>
          <td style="border-bottom:1px solid #e2e8f0;color:#334155;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;line-height:1.25;padding:12px 18px;vertical-align:top;width:13%;">${formatNumber(adGroup.totalMonthlyVolume)}</td>
          <td style="border-bottom:1px solid #e2e8f0;color:#64748b;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.45;padding:12px 18px;vertical-align:top;width:32%;">${escapeHtml(sampleKeywords(adGroup))}</td>
          <td style="border-bottom:1px solid #e2e8f0;color:#172033;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.25;padding:12px 18px;vertical-align:top;width:28%;">${escapeHtml(adGroup.landingPage?.url || '/')}</td>
          <td style="border-bottom:1px solid #e2e8f0;padding:12px 18px;text-align:right;vertical-align:top;width:5%;">
            <span style="background:#d1fae5;border-radius:999px;color:#047857;display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;line-height:1;padding:5px 10px;">${badge}</span>
          </td>
        </tr>`
      })

      return [campaignRow, ...adGroupRows]
    })
    .join('')

  return `<div style="color:#334155;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;max-width:960px;">
    <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">We've analysed your website and identified ${adGroupCount} distinct ad group opportunities across ${campaigns.length} campaigns, each mapped to a dedicated landing page on your site.</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 34px;">The result: tightly themed ad groups with tailored ad copy, visitors landing on exact pages they searched for, and clear performance data to guide budget decisions.</p>

    <h2 style="color:#1d4ed8;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:800;line-height:1.25;margin:0 0 8px;">Recommended Campaign Structure</h2>
    <p style="color:#64748b;font-size:16px;font-weight:600;line-height:1.6;margin:0 0 22px;">${campaigns.length} campaigns, ${adGroupCount} ad groups. Every ad group maps to a dedicated landing page with category-specific keywords and tailored ad copy. Based on actual search volume data for ${escapeHtml(country)}.</p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-spacing:0;width:100%;">
      <thead>
        <tr>
          <th align="left" style="background:#eef6ff;color:#1d4ed8;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:800;letter-spacing:.03em;padding:14px 18px;text-transform:uppercase;width:22%;">Ad Group</th>
          <th align="left" style="background:#eef6ff;color:#1d4ed8;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:800;letter-spacing:.03em;padding:14px 18px;text-transform:uppercase;width:13%;">Monthly<br>Vol.</th>
          <th align="left" style="background:#eef6ff;color:#1d4ed8;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:800;letter-spacing:.03em;padding:14px 18px;text-transform:uppercase;width:32%;">Sample Keywords</th>
          <th align="left" style="background:#eef6ff;color:#1d4ed8;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:800;letter-spacing:.03em;padding:14px 18px;text-transform:uppercase;width:28%;">Landing Page</th>
          <th style="background:#eef6ff;padding:14px 18px;width:5%;"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`
}
