import React, { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RecipientInput } from '@/components/mail/RecipientInput'

const CONTACTS = [
  { email: 'carli@client.com', name: 'Carli Brown' },
  { email: 'cameron@agency.com', name: '' },
]

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return <RecipientInput label="To" value={value} onChange={setValue} contacts={CONTACTS} onWantContacts={vi.fn()} />
}

const type = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value, selectionStart: value.length } })

afterEach(cleanup)

describe('RecipientInput', () => {
  it('shows suggestions with real addresses only after two letters', () => {
    render(<Harness />)
    const input = screen.getByRole('combobox', { name: 'To' })
    fireEvent.focus(input)
    type(input, 'c')
    expect(screen.queryByRole('listbox')).toBeNull()
    type(input, 'ca')
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Carli Browncarli@client.com', 'cameron@agency.com'])
  })

  it('Tab picks the highlighted suggestion and keeps typing in the field', () => {
    render(<Harness />)
    const input = screen.getByRole('combobox', { name: 'To' }) as HTMLInputElement
    fireEvent.focus(input)
    type(input, 'ca')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const tab = fireEvent.keyDown(input, { key: 'Tab' })
    expect(tab).toBe(false) // default prevented: focus stays for the next address
    expect(input.value).toBe('cameron@agency.com, ')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('a click picks a suggestion after earlier addresses', () => {
    render(<Harness initial="jo@x.com, " />)
    const input = screen.getByRole('combobox', { name: 'To' }) as HTMLInputElement
    fireEvent.focus(input)
    type(input, 'jo@x.com, car')
    fireEvent.click(screen.getByRole('option', { name: /carli@client.com/ }))
    expect(input.value).toBe('jo@x.com, carli@client.com, ')
  })

  it('Tab moves on normally when nothing is suggested', () => {
    render(<Harness />)
    const input = screen.getByRole('combobox', { name: 'To' })
    fireEvent.focus(input)
    type(input, 'zz')
    expect(fireEvent.keyDown(input, { key: 'Tab' })).toBe(true)
  })
})
