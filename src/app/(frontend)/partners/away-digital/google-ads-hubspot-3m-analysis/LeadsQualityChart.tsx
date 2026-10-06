'use client'

import { useState, type ReactNode } from 'react'
import { LEADS_BY_MONTH } from './data'

type Mode = 'total' | 'breakdown' | 'q' | 'l' | 'p' | 'x' | 'u' | 'n'
type Field = 'quality' | 'lowbiz' | 'oneoff' | 'wrong' | 'personal' | 'notdetail'

type Category = {
  readonly key: Exclude<Mode, 'total' | 'breakdown'>
  readonly field: Field
  readonly label: string
  readonly color: string
  readonly text: string
}

const CATEGORIES: readonly Category[] = [
  { key: 'q', field: 'quality', label: 'Quality', color: '#0d9488', text: '#ffffff' },
  { key: 'l', field: 'lowbiz', label: 'Real business, little detail', color: '#9b8ac7', text: '#ffffff' },
  { key: 'p', field: 'oneoff', label: 'One-off or short-term project', color: '#f59e0b', text: '#3b2a00' },
  { key: 'x', field: 'wrong', label: 'Wrong service or spam', color: '#ef4444', text: '#ffffff' },
  { key: 'u', field: 'personal', label: 'Personal email, no message', color: '#f2a29a', text: '#5c120c' },
  { key: 'n', field: 'notdetail', label: 'Not enough detail', color: '#98a2b3', text: '#ffffff' },
]

const TOTAL_COLOR = '#0d9488'

function num(value: string): number {
  return parseInt(value, 10) || 0
}

function SeriesSwatch({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: color }} />
}

function LegendButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
        active ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
      }`}
    >
      {children}
    </button>
  )
}

export default function LeadsQualityChart() {
  const [mode, setMode] = useState<Mode>('total')

  const scale = Math.max(...LEADS_BY_MONTH.map((m) => num(m.total)), 1)

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/70">
      <div className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">
        Leads by quality, by month
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <LegendButton active={mode === 'total'} onClick={() => setMode('total')}>
          <SeriesSwatch color={TOTAL_COLOR} />
          Total
        </LegendButton>
        <LegendButton active={mode === 'breakdown'} onClick={() => setMode('breakdown')}>
          <span
            className="inline-block h-2.5 w-2.5 rounded-[2px]"
            style={{
              background: `linear-gradient(90deg, ${CATEGORIES.map((c) => `${c.color} ${(CATEGORIES.indexOf(c) * 100) / CATEGORIES.length}%`).join(', ')}, ${CATEGORIES[CATEGORIES.length - 1]?.color ?? '#98a2b3'} 100%)`,
            }}
          />
          Breakdown
        </LegendButton>
        {CATEGORIES.map((c) => (
          <LegendButton key={c.key} active={mode === c.key} onClick={() => setMode(c.key)}>
            <SeriesSwatch color={c.color} />
            {c.label}
          </LegendButton>
        ))}
      </div>

      <div className="min-w-[640px] overflow-x-auto">
        <div className="mb-2 grid grid-cols-[44px_1fr_68px_80px_80px_56px_60px] items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <span />
          <span />
          <span className="text-right">Ads spend</span>
          <span className="text-right">Cost / lead</span>
          <span className="text-right">Cost / quality</span>
          <span className="text-right">Clients</span>
          <span className="text-right">Client rate</span>
        </div>

        {LEADS_BY_MONTH.map((m) => {
          const total = num(m.total)
          return (
            <div
              key={m.label}
              className="grid grid-cols-[44px_1fr_68px_80px_80px_56px_60px] items-center gap-2 py-[3px] text-xs"
            >
              <span className="text-slate-500">{m.label}</span>
              <div className="flex h-[22px] overflow-hidden rounded-md bg-slate-100">
                {mode === 'total' ? (
                  <div
                    className="flex items-center justify-center text-[11px] font-bold"
                    style={{ width: `${(total / scale) * 100}%`, background: TOTAL_COLOR, color: '#fff' }}
                  >
                    {total}
                  </div>
                ) : mode === 'breakdown' ? (
                  CATEGORIES.map((c) => {
                    const n = num(m[c.field])
                    if (n === 0) return null
                    return (
                      <div
                        key={c.key}
                        className="flex items-center justify-center text-[11px] font-bold"
                        style={{ width: `${(n / scale) * 100}%`, background: c.color, color: c.text }}
                      >
                        {n}
                      </div>
                    )
                  })
                ) : (
                  (() => {
                    const c = CATEGORIES.find((x) => x.key === mode)
                    if (!c) return null
                    const n = num(m[c.field])
                    return (
                      <div
                        className="flex items-center justify-center text-[11px] font-bold"
                        style={{ width: `${(n / scale) * 100}%`, background: c.color, color: c.text }}
                      >
                        {n}
                      </div>
                    )
                  })()
                )}
              </div>
              <span className="text-right tabular-nums text-slate-700">{m.spend}</span>
              <span className="text-right tabular-nums text-slate-700">{m.costTotal}</span>
              <span className="text-right tabular-nums text-slate-700">{m.costQuality}</span>
              <span className="text-right tabular-nums font-semibold text-slate-950">
                {num(m.clients) === 0 ? '-' : m.clients}
              </span>
              <span className="text-right tabular-nums text-emerald-700">
                {num(m.clients) === 0 ? '-' : `${m.clientRate}%`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
