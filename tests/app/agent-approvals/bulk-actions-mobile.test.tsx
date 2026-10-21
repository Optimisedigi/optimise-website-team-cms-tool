import React from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

import AgentApprovalsBulkActions from '@/app/(payload)/admin/agent-approvals/BulkActions'

const rows = [
  { id: 1, title: 'Pause wasteful keyword', status: 'pending', agentName: 'optimate-google-ads', clientLabel: 'Acme', age: '2h ago', href: '/admin/agent-approvals/1' },
  { id: 2, title: 'Raise budget', status: 'applied', agentName: 'optimate-google-ads', clientLabel: '#7', age: '3d ago', href: '/admin/agent-approvals/2' },
]

describe('Agent approvals phone cards', () => {
  it('renders a card per approval with chips, status and a Review link', () => {
    render(<AgentApprovalsBulkActions rows={rows} />)
    const cards = screen.getAllByTestId('approval-card')
    expect(cards).toHaveLength(2)
    const first = within(cards[0] as HTMLElement)
    expect(first.getByText('Acme')).toBeInTheDocument()
    expect(first.getByText('2h ago')).toBeInTheDocument()
    expect(first.getByText('pending')).toBeInTheDocument()
    expect(first.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/admin/agent-approvals/1')
    // Only pending approvals are selectable.
    expect(within(cards[1] as HTMLElement).queryByRole('checkbox')).toBeNull()
  })

  it('shows the sticky bulk bar only once a card is selected, and tapping the card selects it', () => {
    render(<AgentApprovalsBulkActions rows={rows} />)
    expect(screen.queryByRole('region', { name: 'Selected approvals' })).toBeNull()
    const card = screen.getAllByTestId('approval-card')[0] as HTMLElement
    fireEvent.click(within(card).getByText('Pause wasteful keyword'))
    expect(screen.getByRole('checkbox', { name: 'Select Pause wasteful keyword' })).toBeChecked()
    const bar = screen.getByRole('region', { name: 'Selected approvals' })
    expect(within(bar).getByRole('button', { name: 'Reject selected (1)' })).toBeInTheDocument()
  })
})
