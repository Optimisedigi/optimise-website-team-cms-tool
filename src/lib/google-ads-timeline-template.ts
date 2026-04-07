/**
 * Shared Google Ads 90-Day Onboarding template definition.
 * Used by both the beforeChange hook (auto-populate on create) and
 * the load-google-ads-template API route (Template Manager "Load" button).
 */

export type TimelinePhaseItem = {
  id: string
  itemName: string
  itemOrder: number
  itemDescription: string
  estimatedHours: number | null
  requiresApproval: boolean
  itemStatus: string
  approvalStatus: string
  internalNotes: string
}

export type TimelinePhase = {
  id: string
  phaseName: string
  phaseOrder: number
  weekRange: string
  phaseDescription: string
  items: TimelinePhaseItem[]
}

export function buildGoogleAdsTimelinePhases(): TimelinePhase[] {
  const uid = () =>
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

  return [
    {
      id: uid(),
      phaseName: 'Quick Wins',
      phaseOrder: 1,
      weekRange: 'Weeks 1–2',
      phaseDescription:
        'Immediate optimisations to stop wasted spend and fix broken tracking before scaling.',
      items: [
        { id: uid(), itemName: 'Remove contact page view conversion action', itemOrder: 1, itemDescription: '', estimatedHours: 1, requiresApproval: false, itemStatus: 'not_started', approvalStatus: 'not_needed', internalNotes: '' },
        { id: uid(), itemName: 'Fix form tracking', itemOrder: 2, itemDescription: '', estimatedHours: 2, requiresApproval: false, itemStatus: 'not_started', approvalStatus: 'not_needed', internalNotes: '' },
        { id: uid(), itemName: 'Add phone call duration filter', itemOrder: 3, itemDescription: '', estimatedHours: 1, requiresApproval: false, itemStatus: 'not_started', approvalStatus: 'not_needed', internalNotes: '' },
        { id: uid(), itemName: 'Add themed negative keyword lists to stop wasted spend', itemOrder: 4, itemDescription: '', estimatedHours: 2, requiresApproval: false, itemStatus: 'not_started', approvalStatus: 'not_needed', internalNotes: '' },
        { id: uid(), itemName: 'Fix geo targeting, pause irrelevant keywords', itemOrder: 5, itemDescription: '', estimatedHours: 2, requiresApproval: true, itemStatus: 'not_started', approvalStatus: 'pending_approval', internalNotes: '' },
        { id: uid(), itemName: 'Submit geo-targeting changes for your approval', itemOrder: 6, itemDescription: '', estimatedHours: 1, requiresApproval: true, itemStatus: 'not_started', approvalStatus: 'pending_approval', internalNotes: '' },
      ],
    },
    {
      id: uid(),
      phaseName: 'Campaign Analysis + Structure Proposal',
      phaseOrder: 2,
      weekRange: 'Weeks 1–3',
      phaseDescription:
        'Deep-dive into current performance and build a proposal for a cleaner account structure.',
      items: [
        { id: uid(), itemName: 'Analyse landing pages and map out keyword themes', itemOrder: 1, itemDescription: '', estimatedHours: 5, requiresApproval: false, itemStatus: 'not_started', approvalStatus: 'not_needed', internalNotes: '' },
        { id: uid(), itemName: 'Propose new campaign structure', itemOrder: 2, itemDescription: '', estimatedHours: 3, requiresApproval: true, itemStatus: 'not_started', approvalStatus: 'pending_approval', internalNotes: '' },
        { id: uid(), itemName: 'Advise on brand-specific landing pages (topline)', itemOrder: 3, itemDescription: '', estimatedHours: 1, requiresApproval: false, itemStatus: 'not_started', approvalStatus: 'not_needed', internalNotes: '' },
      ],
    },
    {
      id: uid(),
      phaseName: 'Campaign Build + Ad Copy',
      phaseOrder: 3,
      weekRange: 'Weeks 3–4',
      phaseDescription:
        'Build out the new structure with tightly themed ad groups and compelling ad creative.',
      items: [
        { id: uid(), itemName: 'Build out campaigns, ad groups, keywords, audiences, extensions', itemOrder: 1, itemDescription: '', estimatedHours: 8, requiresApproval: false, itemStatus: 'not_started', approvalStatus: 'not_needed', internalNotes: '' },
        { id: uid(), itemName: 'Create dedicated brand ads with brand messaging', itemOrder: 2, itemDescription: '', estimatedHours: 2, requiresApproval: false, itemStatus: 'not_started', approvalStatus: 'not_needed', internalNotes: '' },
        { id: uid(), itemName: 'Share ad copy drafts for your review', itemOrder: 3, itemDescription: '', estimatedHours: 2, requiresApproval: true, itemStatus: 'not_started', approvalStatus: 'pending_approval', internalNotes: '' },
        { id: uid(), itemName: 'Negative keyword list deep dive', itemOrder: 4, itemDescription: '', estimatedHours: 2, requiresApproval: false, itemStatus: 'not_started', approvalStatus: 'not_needed', internalNotes: '' },
        { id: uid(), itemName: 'Go live with new structure', itemOrder: 5, itemDescription: '', estimatedHours: 3, requiresApproval: true, itemStatus: 'not_started', approvalStatus: 'pending_approval', internalNotes: '' },
      ],
    },
    {
      id: uid(),
      phaseName: 'Launch + Monitor',
      phaseOrder: 4,
      weekRange: 'Weeks 4–5',
      phaseDescription:
        'Keep a close eye on early performance and iterate on ad copy as data comes in.',
      items: [
        { id: uid(), itemName: 'Daily monitoring for the first couple of weeks', itemOrder: 1, itemDescription: '', estimatedHours: 3, requiresApproval: false, itemStatus: 'not_started', approvalStatus: 'not_needed', internalNotes: '' },
        { id: uid(), itemName: 'Ongoing ad copy optimisation', itemOrder: 2, itemDescription: '', estimatedHours: 2, requiresApproval: false, itemStatus: 'not_started', approvalStatus: 'not_needed', internalNotes: '' },
        { id: uid(), itemName: 'Approve ad copy before launch', itemOrder: 3, itemDescription: '', estimatedHours: 1, requiresApproval: true, itemStatus: 'not_started', approvalStatus: 'pending_approval', internalNotes: '' },
        { id: uid(), itemName: 'Monthly dashboard shared', itemOrder: 4, itemDescription: '', estimatedHours: 0.5, requiresApproval: false, itemStatus: 'not_started', approvalStatus: 'not_needed', internalNotes: '' },
      ],
    },
    {
      id: uid(),
      phaseName: 'Ongoing Optimisations',
      phaseOrder: 5,
      weekRange: 'Beyond Week 5',
      phaseDescription:
        'Continuous improvements to scale performance profitably over the long term.',
      items: [
        { id: uid(), itemName: 'Ongoing account optimisations', itemOrder: 1, itemDescription: '', estimatedHours: 3, requiresApproval: false, itemStatus: 'not_started', approvalStatus: 'not_needed', internalNotes: '' },
        { id: uid(), itemName: 'Ad copy A/B tests', itemOrder: 2, itemDescription: '', estimatedHours: 2, requiresApproval: false, itemStatus: 'not_started', approvalStatus: 'not_needed', internalNotes: '' },
        { id: uid(), itemName: 'Testing placements', itemOrder: 3, itemDescription: '', estimatedHours: 2, requiresApproval: false, itemStatus: 'not_started', approvalStatus: 'not_needed', internalNotes: '' },
        { id: uid(), itemName: 'Advise on brand-specific landing pages (in-depth)', itemOrder: 4, itemDescription: '', estimatedHours: 2, requiresApproval: false, itemStatus: 'not_started', approvalStatus: 'not_needed', internalNotes: '' },
        { id: uid(), itemName: 'Dashboard refinements', itemOrder: 5, itemDescription: '', estimatedHours: 1, requiresApproval: false, itemStatus: 'not_started', approvalStatus: 'not_needed', internalNotes: '' },
        { id: uid(), itemName: 'Generic to GA4 deep dives for scale', itemOrder: 6, itemDescription: '', estimatedHours: 1, requiresApproval: false, itemStatus: 'not_started', approvalStatus: 'not_needed', internalNotes: '' },
        { id: uid(), itemName: 'Organic vs paid search analysis', itemOrder: 7, itemDescription: '', estimatedHours: 1, requiresApproval: false, itemStatus: 'not_started', approvalStatus: 'not_needed', internalNotes: '' },
      ],
    },
  ]
}
