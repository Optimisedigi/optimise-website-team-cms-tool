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

