import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

const dispatchFields = vi.fn()
const addFieldRow = vi.fn()
const removeFieldRow = vi.fn()

vi.mock('@payloadcms/ui', () => ({
  useAllFormFields: vi.fn(),
  useForm: vi.fn(),
  useFormFields: vi.fn(),
}))

import { useAllFormFields, useForm, useFormFields } from '@payloadcms/ui'

import FirstMonthRetainerField from '../../src/components/FirstMonthRetainerField'
import HistoricalRevenueField from '../../src/components/client-business/HistoricalRevenueField'
import OneOffProjectsField from '../../src/components/client-business/OneOffProjectsField'
import ReferralCommissionsField, {
  commissionAmount,
  commissionSentence,
} from '../../src/components/client-business/ReferralCommissionsField'
import YearlyTargetsField from '../../src/components/client-business/YearlyTargetsField'
import { dateInputToIso, formatMoney } from '../../src/components/client-business/array-field-helpers'

function setFields(values: Record<string, unknown>, errors: Record<string, string> = {}): void {
  const f: Record<string, { value: unknown; valid?: boolean; errorMessage?: string }> = {}
  for (const [k, v] of Object.entries(values)) f[k] = { value: v }
  for (const [k, m] of Object.entries(errors)) f[k] = { ...(f[k] ?? { value: undefined }), valid: false, errorMessage: m }
  ;(useAllFormFields as Mock).mockReturnValue([f, dispatchFields])
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(useForm as Mock).mockReturnValue({ addFieldRow, removeFieldRow })
})

describe('helpers', () => {
  it('formats AUD without cents when whole', () => {
    expect(formatMoney(4850)).toBe('$4,850')
    expect(formatMoney(12.5)).toBe('$12.50')
  })
  it('writes dates as ISO at 12:00 local', () => {
    const iso = dateInputToIso('2026-04-14')!
    const d = new Date(iso)
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 3, 14, 12])
    expect(dateInputToIso('')).toBeNull()
  })
})

describe('OneOffProjectsField', () => {
  const base = {
    'oneOffProjects.0.id': 'a',
    'oneOffProjects.0.projectName': 'Website build',
    'oneOffProjects.0.amount': 3500,
    'oneOffProjects.0.date': new Date(2026, 3, 14, 12).toISOString(),
    'oneOffProjects.0.countTowardsRetainer': true,
    'oneOffProjects.1.id': 'b',
    'oneOffProjects.1.projectName': 'Audit',
    'oneOffProjects.1.amount': 1350,
    'oneOffProjects.1.countTowardsRetainer': false,
  }

  it('renders rows and total', () => {
    setFields(base)
    render(<OneOffProjectsField path="oneOffProjects" schemaPath="oneOffProjects" />)
    expect(screen.getByTestId('oneOffProjects-total').textContent).toBe('$4,850')
    expect(screen.getByRole('button', { name: /Project 1 counts toward retainer/ }).textContent).toBe('Retainer')
    expect(screen.getByRole('button', { name: /Project 2 counts toward one-off/ }).textContent).toBe('One-off')
  })

  it('toggles retainer/one-off and dispatches updates', () => {
    setFields(base)
    render(<OneOffProjectsField path="oneOffProjects" />)
    const pill = screen.getByRole('button', { name: /Project 1 counts toward/ })
    expect(pill.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(pill)
    expect(dispatchFields).toHaveBeenCalledWith({ type: 'UPDATE', path: 'oneOffProjects.0.countTowardsRetainer', value: false })
    fireEvent.change(screen.getByLabelText('Project 2 amount'), { target: { value: '900' } })
    expect(dispatchFields).toHaveBeenCalledWith({ type: 'UPDATE', path: 'oneOffProjects.1.amount', value: 900 })
    fireEvent.change(screen.getByLabelText('Project 2 name'), { target: { value: 'SEO audit' } })
    expect(dispatchFields).toHaveBeenCalledWith({ type: 'UPDATE', path: 'oneOffProjects.1.projectName', value: 'SEO audit' })
  })

  it('adds and removes rows', () => {
    setFields(base)
    render(<OneOffProjectsField path="oneOffProjects" schemaPath="oneOffProjects" />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add project' }))
    expect(addFieldRow).toHaveBeenCalledWith({ path: 'oneOffProjects', schemaPath: 'oneOffProjects', rowIndex: 2 })
    fireEvent.click(screen.getByRole('button', { name: 'Remove project Audit' }))
    expect(removeFieldRow).toHaveBeenCalledWith({ path: 'oneOffProjects', rowIndex: 1 })
  })
})

describe('ReferralCommissionsField', () => {
  it('builds the sentence and monthly amount', () => {
    const c = {
      payeeName: 'Sam',
      frequency: 'monthly',
      commissionType: 'percentage',
      percentage: 8,
      startDate: new Date(2026, 0, 5, 12).toISOString(),
      endDate: null,
    }
    expect(commissionSentence(c)).toBe('Monthly, 8% of retainer · 5 Jan 2026 to ongoing')
    expect(commissionAmount(c, 2500)).toBe(200)
    const fixed = { ...c, commissionType: 'fixed', monthlyAmount: 150, endDate: new Date(2026, 11, 31, 12).toISOString() }
    expect(commissionSentence(fixed)).toBe('Monthly, $150 fixed · 5 Jan 2026 to 31 Dec 2026')
    expect(commissionAmount(fixed, 2500)).toBe(150)
  })

  it('renders card using monthlyRetainer form value and edits with schema conditions', () => {
    setFields(
      {
        monthlyRetainer: 2500,
        'referralCommissions.0.id': 'x',
        'referralCommissions.0.payeeName': 'Jane Partner',
        'referralCommissions.0.payeeContact': 'jane@example.com',
        'referralCommissions.0.frequency': 'monthly',
        'referralCommissions.0.commissionType': 'percentage',
        'referralCommissions.0.percentage': 8,
        'referralCommissions.0.startDate': new Date(2026, 3, 14, 12).toISOString(),
        'referralCommissions.0.notes': 'Intro via BNI',
      },
    )
    render(<ReferralCommissionsField path="referralCommissions" schemaPath="referralCommissions" />)
    expect(screen.getByText('Monthly commissions are deducted from the retainer in all revenue figures.')).toBeTruthy()
    expect(screen.getByText('$200')).toBeTruthy()
    expect(screen.getByText('per month')).toBeTruthy()
    expect(screen.getByText(/· jane@example.com/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Edit commission for Jane Partner' }))
    expect(screen.getByLabelText('Percentage')).toBeTruthy()
    expect(screen.queryByLabelText('Monthly amount')).toBeNull()
    expect(screen.queryByLabelText('One-off amount')).toBeNull()
    expect(screen.getByText('End date is required for monthly commissions.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Commission type'), { target: { value: 'fixed' } })
    expect(dispatchFields).toHaveBeenCalledWith({ type: 'UPDATE', path: 'referralCommissions.0.commissionType', value: 'fixed' })

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Remove commission for Jane Partner' }))
    expect(removeFieldRow).toHaveBeenCalledWith({ path: 'referralCommissions', rowIndex: 0 })
  })

  it('shows one-off fields and server errors; adds rows', () => {
    setFields(
      {
        'referralCommissions.0.id': 'x',
        'referralCommissions.0.payeeName': 'Bob',
        'referralCommissions.0.frequency': 'one_off',
        'referralCommissions.0.oneOffAmount': 500,
        'referralCommissions.0.startDate': new Date(2026, 1, 1, 12).toISOString(),
      },
      { 'referralCommissions.0.payeeContact': 'Server says no' },
    )
    render(<ReferralCommissionsField path="referralCommissions" schemaPath="referralCommissions" />)
    // server error forces the form open
    expect(screen.getByText('Server says no')).toBeTruthy()
    expect(screen.getByLabelText('One-off amount')).toBeTruthy()
    expect(screen.queryByLabelText('End date')).toBeNull()
    expect(screen.queryByLabelText('Commission type')).toBeNull()
    expect(screen.getByText('one-off')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '+ Add commission' }))
    expect(addFieldRow).toHaveBeenCalledWith({ path: 'referralCommissions', schemaPath: 'referralCommissions', rowIndex: 1 })
  })
})

describe('Historical revenue / yearly targets', () => {
  it('totals historical revenue and dispatches updates', () => {
    setFields({
      'historicalRevenueByYear.0.id': 'a',
      'historicalRevenueByYear.0.year': 2023,
      'historicalRevenueByYear.0.amount': 20000,
      'historicalRevenueByYear.1.id': 'b',
      'historicalRevenueByYear.1.year': 2024,
      'historicalRevenueByYear.1.amount': 22400,
    })
    render(<HistoricalRevenueField path="historicalRevenueByYear" schemaPath="historicalRevenueByYear" />)
    expect(screen.getByText('· before the CMS')).toBeTruthy()
    expect(screen.getByTestId('historicalRevenueByYear-total').textContent).toBe('$42,400')
    fireEvent.change(screen.getByLabelText('Historical year 2 amount'), { target: { value: '' } })
    expect(dispatchFields).toHaveBeenCalledWith({ type: 'UPDATE', path: 'historicalRevenueByYear.1.amount', value: null })
    fireEvent.click(screen.getByRole('button', { name: '+ Add year' }))
    expect(addFieldRow).toHaveBeenCalledWith({ path: 'historicalRevenueByYear', schemaPath: 'historicalRevenueByYear', rowIndex: 2 })
  })

  it('yearly targets uses target key, no total, shows array error', () => {
    setFields(
      { 'yearlyTargets.0.id': 'a', 'yearlyTargets.0.year': 2026, 'yearlyTargets.0.target': 100000, yearlyTargets: 1 },
      { yearlyTargets: 'Row 1: Year 2026 appears more than once.' },
    )
    render(<YearlyTargetsField path="yearlyTargets" schemaPath="yearlyTargets" />)
    expect(screen.queryByTestId('yearlyTargets-total')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('appears more than once')
    fireEvent.change(screen.getByLabelText('Target 1 amount'), { target: { value: '120000' } })
    expect(dispatchFields).toHaveBeenCalledWith({ type: 'UPDATE', path: 'yearlyTargets.0.target', value: 120000 })
    fireEvent.click(screen.getByRole('button', { name: 'Remove target 2026' }))
    expect(removeFieldRow).toHaveBeenCalledWith({ path: 'yearlyTargets', rowIndex: 0 })
    expect(within(screen.getByTestId('yearlyTargets-field')).getByRole('button', { name: '+ Add target' })).toBeTruthy()
  })
})

describe('FirstMonthRetainerField', () => {
  function mockForm(values: Record<string, unknown>): void {
    const f: Record<string, { value: unknown }> = {}
    for (const [k, v] of Object.entries(values)) f[k] = { value: v }
    ;(useFormFields as Mock).mockImplementation((sel: (a: [typeof f]) => unknown) => sel([f]))
  }

  it('shows pro-rated amount and date', () => {
    mockForm({ monthlyRetainer: 3000, retainerStartDate: new Date(2026, 3, 16, 12).toISOString() })
    render(<FirstMonthRetainerField />)
    // April has 30 days, 15 billed → $1,500
    expect(screen.getByTestId('first-month-value').textContent).toBe('$1,500')
    expect(screen.getByTestId('first-month-hint').textContent).toBe('Pro-rated from 16 Apr')
    expect(screen.getByText('First month')).toBeTruthy()
  })

  it('shows placeholder when not computable', () => {
    mockForm({ monthlyRetainer: 0 })
    render(<FirstMonthRetainerField />)
    expect(screen.getByTestId('first-month-value').textContent).toBe('—')
    expect(screen.getByTestId('first-month-hint').textContent).toBe('Set a retainer and start date')
  })
})
