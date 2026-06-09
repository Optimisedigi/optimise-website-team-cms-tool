import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KpiRow } from '@/components/dashboards/googleads/KpiRow'
import type { GoogleAdsDashboardKpis } from '@/lib/dashboard-types'

const baseKpis: GoogleAdsDashboardKpis = {
  spend: 5500,
  clicks: 1666,
  avgCpc: 3.32,
  conversions: 35,
  cpa: 158,
  prevSpend: 5000,
  prevClicks: 1500,
  prevAvgCpc: 3.1,
  prevConversions: 20,
  prevCpa: 250,
  yoySpend: 4000,
  yoyClicks: 1800,
  yoyAvgCpc: 2.2,
  yoyConversions: 17.5,
  yoyCpa: 229,
  conversionsByAction: {
    'Phone Call Click': 34,
    'Form Submission': 1,
  },
}

describe('KpiRow conversion action chip', () => {
  it('shows every selected conversion action, including selected actions with zero conversions', () => {
    render(
      <KpiRow
        kpis={baseKpis}
        compareMode="year"
        selectedConversionActions={['Phone Call Click', 'Form Submission', 'Email Click']}
      />,
    )

    const chip = screen.getByText('By action (3)').closest('div')
    expect(chip).toBeTruthy()

    expect(within(chip as HTMLElement).getByText('Phone Call Click')).toBeInTheDocument()
    expect(within(chip as HTMLElement).getByText('Form Submission')).toBeInTheDocument()
    expect(within(chip as HTMLElement).getByText('Email Click')).toBeInTheDocument()

    const emailClickLabel = within(chip as HTMLElement).getByText('Email Click')
    const emailClickRow = emailClickLabel.parentElement
    expect(emailClickRow).toBeTruthy()
    expect(within(emailClickRow as HTMLElement).getByText('0')).toBeInTheDocument()
  })

  it('uses CMS dashboard labels and aggregates actions with the same label', () => {
    render(
      <KpiRow
        kpis={baseKpis}
        compareMode="year"
        selectedConversionActions={['Phone Call Click', 'Form Submission']}
        conversionActionLabels={{
          'Phone Call Click': 'Phone Calls',
          'Form Submission': 'Leads',
        }}
      />,
    )

    const chip = screen.getByText('By action (2)').closest('div')
    expect(chip).toBeTruthy()
    expect(within(chip as HTMLElement).getByText('Phone Calls')).toBeInTheDocument()
    expect(within(chip as HTMLElement).getByText('Leads')).toBeInTheDocument()
    expect(within(chip as HTMLElement).queryByText('Phone Call Click')).not.toBeInTheDocument()
    expect(within(chip as HTMLElement).queryByText('Form Submission')).not.toBeInTheDocument()
  })
})
