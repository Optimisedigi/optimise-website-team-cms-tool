import { act, fireEvent, render, screen } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type FieldState = { value?: unknown; rows?: unknown[] }
const formFields: Record<string, FieldState> = {}
const setValues: Record<string, ReturnType<typeof vi.fn>> = {}
const dispatchFields = vi.fn()
const addFieldRow = vi.fn()
const removeFieldRow = vi.fn()
const moveFieldRow = vi.fn()

vi.mock('@payloadcms/ui', () => ({
  useField: ({ path }: { path: string }) => {
    const setValue = setValues[path] || (setValues[path] = vi.fn())
    return {
      value: formFields[path]?.value,
      setValue,
      showError: path === 'clientPulse.neglectCriticalDays',
      errorMessage: 'Must be at least 0',
      path,
    }
  },
  useAllFormFields: () => [formFields, dispatchFields],
  useFormFields: <T,>(selector: (ctx: [Record<string, FieldState>]) => T): T => selector([formFields]),
  useForm: () => ({ addFieldRow, removeFieldRow, moveFieldRow }),
}))

import PulsePriorityField from '@/components/client-business/PulsePriorityField'
import ServicesTrackedField from '@/components/client-business/ServicesTrackedField'
import DashboardMetricsField from '@/components/client-business/DashboardMetricsField'
import AnalyticsMetricsNoteField from '@/components/client-business/AnalyticsMetricsNoteField'
import NeglectDaysField from '@/components/client-business/NeglectDaysField'
import WeCanQuitStatsField, { WeCanQuitSyncedLabel } from '@/components/client-business/WeCanQuitStatsField'
import ApiKeyField from '@/components/client-business/ApiKeyField'
import RetainerHistoryField from '@/components/client-business/RetainerHistoryField'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = any
const as = (C: React.ComponentType<AnyProps>, props: Record<string, unknown>): React.ReactElement => <C {...props} />

const priorityField = {
  name: 'priority',
  type: 'select',
  options: [
    { label: 'Watch', value: 'watch' },
    { label: 'Normal', value: 'normal' },
    { label: 'High', value: 'high' },
    { label: 'Critical', value: 'critical' },
  ],
}

beforeEach(() => {
  for (const k of Object.keys(formFields)) delete formFields[k]
  for (const k of Object.keys(setValues)) delete setValues[k]
  vi.clearAllMocks()
})
afterEach(() => vi.useRealTimers())

describe('PulsePriorityField', () => {
  it('renders a radiogroup and supports click + arrow keys', () => {
    formFields['clientPulse.priority'] = { value: 'normal' }
    render(as(PulsePriorityField, { path: 'clientPulse.priority', field: priorityField }))
    expect(screen.getByRole('radiogroup', { name: 'Priority' })).toBeTruthy()
    const normal = screen.getByRole('radio', { name: 'Normal' })
    expect(normal.getAttribute('aria-checked')).toBe('true')
    expect(normal.tabIndex).toBe(0)
    expect(screen.getByRole('radio', { name: 'Watch' }).tabIndex).toBe(-1)
    fireEvent.keyDown(normal, { key: 'ArrowRight' })
    expect(setValues['clientPulse.priority']).toHaveBeenLastCalledWith('high')
    fireEvent.keyDown(normal, { key: 'ArrowLeft' })
    expect(setValues['clientPulse.priority']).toHaveBeenLastCalledWith('watch')
    fireEvent.keyDown(normal, { key: 'End' })
    expect(setValues['clientPulse.priority']).toHaveBeenLastCalledWith('critical')
    fireEvent.click(screen.getByRole('radio', { name: 'Critical' }))
    expect(setValues['clientPulse.priority']).toHaveBeenLastCalledWith('critical')
  })

  it('does not change when readOnly', () => {
    formFields['clientPulse.priority'] = { value: 'normal' }
    render(as(PulsePriorityField, { path: 'clientPulse.priority', field: priorityField, readOnly: true }))
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Normal' }), { key: 'ArrowRight' })
    expect(setValues['clientPulse.priority']).not.toHaveBeenCalled()
  })
})

describe('ServicesTrackedField', () => {
  const field = {
    name: 'servicesTracked',
    options: [
      { label: 'SEO', value: 'organic' },
      { label: 'Paid Search', value: 'paid_search' },
      { label: 'Content', value: 'content' },
    ],
  }
  it('toggles chips in option order', () => {
    formFields['clientPulse.servicesTracked'] = { value: ['content'] }
    render(as(ServicesTrackedField, { path: 'clientPulse.servicesTracked', field }))
    const seo = screen.getByRole('button', { name: 'SEO' })
    expect(seo.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Content' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(seo)
    expect(setValues['clientPulse.servicesTracked']).toHaveBeenLastCalledWith(['organic', 'content'])
    fireEvent.click(screen.getByRole('button', { name: 'Content' }))
    expect(setValues['clientPulse.servicesTracked']).toHaveBeenLastCalledWith([])
  })
})

describe('DashboardMetricsField', () => {
  const field = {
    name: 'dashboardMetrics',
    fields: [
      {
        name: 'metric',
        type: 'select',
        options: [
          { label: 'Google Ads spend', value: 'google_ads_spend' },
          { label: 'GA4 sessions', value: 'ga4_sessions' },
        ],
      },
      { name: 'label', type: 'text' },
      { name: 'enabled', type: 'checkbox' },
    ],
  }
  const path = 'clientPulse.dashboardMetrics'
  const setup = (): void => {
    formFields[path] = { rows: [{}, {}] }
    formFields[`${path}.0.metric`] = { value: 'google_ads_spend' }
    formFields[`${path}.0.label`] = { value: 'Spend' }
    formFields[`${path}.0.enabled`] = { value: true }
    formFields[`${path}.1.metric`] = { value: 'ga4_sessions' }
    formFields[`${path}.1.label`] = { value: '' }
    formFields[`${path}.1.enabled`] = { value: false }
    render(as(DashboardMetricsField, { path, schemaPath: 'clients.clientPulse.dashboardMetrics', field }))
  }

  it('renders rows and handles add/move/remove/toggle/edit', () => {
    setup()
    expect(screen.getByText(/first three enabled rows show on the Pulse card/)).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getAllByPlaceholderText('Optional label')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Move GA4 sessions up' }))
    expect(moveFieldRow).toHaveBeenCalledWith({ moveFromIndex: 1, moveToIndex: 0, path })
    expect((screen.getByRole('button', { name: 'Move Google Ads spend up' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Remove Google Ads spend' }))
    expect(removeFieldRow).toHaveBeenCalledWith({ path, rowIndex: 0 })

    fireEvent.click(screen.getByRole('button', { name: '+ Add metric' }))
    expect(addFieldRow).toHaveBeenCalledWith({ path, schemaPath: 'clients.clientPulse.dashboardMetrics', rowIndex: 2 })

    const sw = screen.getByRole('switch', { name: 'Show GA4 sessions on the Pulse card' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(sw)
    expect(dispatchFields).toHaveBeenCalledWith({ type: 'UPDATE', path: `${path}.1.enabled`, value: true })

    fireEvent.change(screen.getByRole('combobox', { name: 'Metric 1' }), { target: { value: 'ga4_sessions' } })
    expect(dispatchFields).toHaveBeenCalledWith({ type: 'UPDATE', path: `${path}.0.metric`, value: 'ga4_sessions' })
  })
})

describe('AnalyticsMetricsNoteField', () => {
  const field = {
    options: [
      { label: 'Traffic', value: 'traffic' },
      { label: 'Cost per acquisition', value: 'cpa' },
    ],
  }
  it('renders the legacy line', () => {
    formFields['clientPulse.analyticsMetrics'] = { value: ['traffic', 'cpa'] }
    render(as(AnalyticsMetricsNoteField, { path: 'clientPulse.analyticsMetrics', field }))
    expect(
      screen.getByText('Legacy metric selection: Traffic, Cost per acquisition. Used only until card metrics are set.'),
    ).toBeTruthy()
  })
  it('renders nothing when empty', () => {
    formFields['clientPulse.analyticsMetrics'] = { value: [] }
    const { container } = render(as(AnalyticsMetricsNoteField, { path: 'clientPulse.analyticsMetrics', field }))
    expect(container.innerHTML).toBe('')
  })
})

describe('NeglectDaysField', () => {
  it('renders days suffix, sets numbers and shows errors', () => {
    formFields['clientPulse.neglectCriticalDays'] = { value: 30 }
    render(as(NeglectDaysField, { path: 'clientPulse.neglectCriticalDays', field: { name: 'neglectCriticalDays' } }))
    const input = screen.getByLabelText('Neglect critical') as HTMLInputElement
    expect(input.value).toBe('30')
    expect(screen.getByText('days')).toBeTruthy()
    fireEvent.change(input, { target: { value: '45' } })
    expect(setValues['clientPulse.neglectCriticalDays']).toHaveBeenLastCalledWith(45)
    expect(screen.getByRole('alert').textContent).toBe('Must be at least 0')
  })
})

describe('WeCanQuit', () => {
  it('renders stats with and without targets', () => {
    formFields.wcqAssessmentsCompleted = { value: 212 }
    formFields.wcqPrescriptionCount = { value: 148 }
    formFields.wcqAssessmentTarget = { value: 500 }
    formFields.wcqPrescriptionTarget = { value: null }
    const { container } = render(<WeCanQuitStatsField />)
    expect(screen.getByText('Assessments (paid + completed)')).toBeTruthy()
    const values = container.querySelectorAll('.od-biz-stat__value')
    expect(values[0].textContent).toBe('212 / 500')
    expect(values[1].textContent).toBe('148')
  })
  it('formats the synced label in Sydney time', () => {
    formFields.wcqMetricsLastSyncedAt = { value: '2026-10-02T23:12:00.000Z' }
    render(<WeCanQuitSyncedLabel />)
    expect(screen.getByText('Last synced 3 Oct, 9:12 am')).toBeTruthy()
  })
  it('shows not synced yet', () => {
    render(<WeCanQuitSyncedLabel />)
    expect(screen.getByText('Not synced yet')).toBeTruthy()
  })
})

describe('ApiKeyField', () => {
  it('copies and shows feedback for 1.5s', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    formFields.apiKey = { value: 'key_abc' }
    render(as(ApiKeyField, { path: 'apiKey' }))
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.readOnly).toBe(true)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy API key' }))
    })
    expect(writeText).toHaveBeenCalledWith('key_abc')
    expect(screen.getByRole('button', { name: 'API key copied' }).textContent).toBe('Copied')
    expect(screen.getByText('API key copied to clipboard')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.getByRole('button', { name: 'Copy API key' }).textContent).toBe('Copy')
  })
  it('handles clipboard failure', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    })
    formFields.apiKey = { value: 'key_abc' }
    render(as(ApiKeyField, { path: 'apiKey' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy API key' }))
    })
    expect(screen.getByText(/copy it manually/)).toBeTruthy()
  })
})

describe('RetainerHistoryField', () => {
  it('formats rows', () => {
    formFields.retainerHistory = { rows: [{}] }
    formFields['retainerHistory.0.amount'] = { value: 2500 }
    formFields['retainerHistory.0.previousAmount'] = { value: 1800 }
    formFields['retainerHistory.0.effectiveDate'] = { value: '2026-04-14T02:00:00.000Z' }
    formFields['retainerHistory.0.changedBy'] = { value: 'Peter' }
    render(as(RetainerHistoryField, { path: 'retainerHistory' }))
    expect(screen.getByText('$1,800 → $2,500')).toBeTruthy()
    expect(screen.getByText('14 Apr 2026')).toBeTruthy()
    expect(screen.getByText('Peter')).toBeTruthy()
  })
  it('shows empty state', () => {
    render(as(RetainerHistoryField, { path: 'retainerHistory' }))
    expect(screen.getByText('No retainer changes recorded yet.')).toBeTruthy()
  })
})
