'use client'

import { createContext } from 'react'

/** Active sub-tab of a Business tab section (e.g. Billing → Retainer). */
export type BusinessPanelState = {
  activeId: string | undefined
  /** Prefix shared with the section's tab buttons for aria wiring. */
  idPrefix: string
}

export const BusinessPanelContext = createContext<BusinessPanelState | null>(null)
