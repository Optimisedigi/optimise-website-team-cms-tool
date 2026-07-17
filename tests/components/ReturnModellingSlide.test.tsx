import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReturnModellingSlide } from '@/components/v2/ReturnModellingSlide'

describe('ReturnModellingSlide', () => {
  it('multiplies annual return by the annual purchase frequency', () => {
    render(
      <ReturnModellingSlide
        businessName="Cipher Health"
        leadConversionRate={3}
        leadToSaleConversionRate={100}
        averageOrderValue={350}
        annualPurchaseFrequency={2}
        overrideMonthlyVisits={1800}
        trafficModel={{ yourMonthlyVisits: 0, competitors: [] }}
      />,
    )

    expect(screen.getByText('$453,600')).toBeInTheDocument()
  })
})
