'use client'

import { useField } from '@payloadcms/ui'
import { useMemo } from 'react'

type SlideOption = {
  label: string
  value: string
}

const SLIDE_OPTIONS: SlideOption[] = [
  { label: 'Page 01 — Cover', value: '01 Cover' },
  { label: 'Page 02 — What This Covers', value: '02 What This Covers' },
  { label: 'Page 03 — Chapter One: Our Flight Philosophy', value: '03 Section 01' },
  { label: 'Page 04 — The Approach', value: '04 Philosophy' },
  { label: 'Page 05 — Fix the Ship Before Lighting the Engines', value: '04b Order of Operations' },
  { label: 'Page 06 — Chapter Two: Mission Brief', value: '05 Section 02' },
  { label: 'Page 07 — Business & Market', value: '06 Mission Brief' },
  { label: 'Page 08 — Chapter Three: Pre-flight Check', value: '08 Section 03' },
  { label: 'Page 09 — Competitor Analysis', value: '09 Competitor Analysis' },
  { label: 'Page 10 — Keyword Landscape', value: '10 Keywords' },
  { label: 'Page 11 — Chapter Four: Diagnosing the Ship', value: '11 Section 04' },
  { label: 'Page 12 — SEO Health', value: '14 SEO Health' },
  { label: 'Page 13 — CRO Health', value: '15 CRO Health' },
  { label: 'Page 14 — Chapter Five: Building the Ship', value: '13 Section 05' },
  { label: 'Page 15 — The Foundation Comes First', value: '13a Building the Ship' },
  { label: 'Page 16 — Chapter Six: Fueling the Ship', value: '13b Section 06' },
  { label: 'Page 17 — Organic Propulsion', value: '17 Organic Propulsion' },
  { label: 'Page 18 — Paid Activation', value: '18 Paid Activation' },
  { label: 'Page 19 — Chapter Seven: Mission Control', value: '16 Section 07' },
  { label: 'Page 20 — Return Modelling', value: '20 Return Modelling' },
  { label: 'Page 21 — Chapter Eight: Mission Priorities', value: '19 Section 08' },
  { label: 'Page 22 — Mission Priorities', value: '12 Priorities' },
  { label: 'Page 23 — Chapter Nine: Flight Plan', value: '21 Section 09' },
  { label: 'Page 24 — Roadmap', value: '22 Roadmap' },
  { label: 'Page 25 — Chapter Ten: Mission Resources', value: '23 Section 10' },
  { label: 'Page 26 — Commercial Model', value: '24 Commercial' },
  { label: 'Page 27 — Closing', value: '27 Closing' },
]

const LEGACY_VALUE_TO_ID: Record<string, string> = {
  '1': '01',
  '2': '02',
  '3': '04',
  '4': '04b',
  '5': '06',
  '6': '10',
  '7': '09',
  '8': '15',
  '9': '15',
  '10': '14',
  '11': '14',
  '12': '14',
  '13': '17',
  '14': '18',
  '15': '20',
  '16': '22',
  '17': '24',
  '18': '24',
  '19': '27',
}

function normaliseSlideId(value: string): string {
  const raw = value.trim().toLowerCase()
  if (!raw) return ''
  const firstToken = raw.split(/\s+/)[0] ?? raw
  if (LEGACY_VALUE_TO_ID[firstToken]) return LEGACY_VALUE_TO_ID[firstToken]
  if (/^\d+$/.test(firstToken)) return firstToken.padStart(2, '0')
  const numericPrefix = firstToken.match(/^0?(\d+)([a-z])$/)
  if (numericPrefix) return `${numericPrefix[1].padStart(2, '0')}${numericPrefix[2]}`
  return firstToken
}

export default function ProposalSlideRemovalPicker(props: { path?: string }) {
  const path = props.path || 'visibleSlides'
  const { value, setValue } = useField<string[] | string | null>({ path })

  const selectedValues = useMemo(() => {
    if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
    if (typeof value === 'string' && value.startsWith('[')) {
      try {
        const parsed = JSON.parse(value) as unknown
        if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string')
      } catch {
        return []
      }
    }
    return []
  }, [value])

  const selectedIds = useMemo(
    () => new Set(selectedValues.map(normaliseSlideId).filter(Boolean)),
    [selectedValues],
  )

  const toggle = (option: SlideOption, checked: boolean) => {
    const optionId = normaliseSlideId(option.value)
    const withoutThisSlide = selectedValues.filter((item) => normaliseSlideId(item) !== optionId)
    setValue(checked ? [...withoutThisSlide, option.value] : withoutThisSlide)
  }

  const clearAll = () => setValue([])

  return (
    <div
      style={{
        marginBottom: 24,
        padding: '14px 16px',
        border: '1px solid #d7dce3',
        borderRadius: 8,
        background: '#fff',
      }}
    >
      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1f2937' }}>
            Remove proposal pages
          </label>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: '#4b5563' }}>
            Tick a page to remove it from the proposal deck. Leave all unticked to show every page.
          </p>
        </div>
        {selectedValues.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            style={{
              alignSelf: 'flex-start',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              background: '#f8fafc',
              color: '#334155',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              padding: '5px 8px',
              whiteSpace: 'nowrap',
            }}
          >
            Show all
          </button>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gap: 6,
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        }}
      >
        {SLIDE_OPTIONS.map((option) => {
          const checked = selectedIds.has(normaliseSlideId(option.value))
          return (
            <label
              key={option.value}
              style={{
                alignItems: 'center',
                background: checked ? '#fff7ed' : '#f8fafc',
                border: `1px solid ${checked ? '#fb923c' : '#e2e8f0'}`,
                borderRadius: 7,
                color: '#1f2937',
                cursor: 'pointer',
                display: 'flex',
                fontSize: 12,
                gap: 8,
                lineHeight: 1.25,
                minHeight: 34,
                padding: '7px 9px',
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => toggle(option, event.target.checked)}
                style={{ margin: 0 }}
              />
              <span>{option.label}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
