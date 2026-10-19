'use client'

export type ReasoningLevel = 'off' | 'low' | 'medium' | 'high'

const ORDER: ReasoningLevel[] = ['off', 'low', 'medium', 'high']
const DOT_COUNT = 5

/** How many of the five dots light up, and in what colour, for each level. */
export const REASONING_DOTS: Record<ReasoningLevel, { lit: number; color: string }> = {
  off: { lit: 0, color: '#8f8f98' },
  low: { lit: 2, color: '#818cf8' },
  medium: { lit: 3, color: '#fbbf24' },
  high: { lit: 5, color: '#f472b6' },
}

export function nextReasoningLevel(current: ReasoningLevel, offAllowed: boolean): ReasoningLevel {
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]
  return next === 'off' && !offAllowed ? 'low' : next
}

interface Props {
  value: ReasoningLevel
  onChange: (next: ReasoningLevel) => void
  disabled?: boolean
  /** False for models that need reasoning on; Off is skipped. */
  offAllowed?: boolean
  title?: string
}

/** Five dots showing how hard the model thinks. Tap to step through the levels. */
export default function OptiMateReasoningDots({ value, onChange, disabled, offAllowed = true, title }: Props) {
  const { lit, color } = REASONING_DOTS[value]
  return (
    <button
      type="button"
      className="om-select om-reasoning"
      data-optimate-select=""
      data-reasoning={value}
      disabled={disabled}
      title={title ?? 'Reasoning for the next request. Tap to change. Off is fastest and cheapest.'}
      aria-label={`Reasoning ${value}. Tap to change.`}
      onClick={() => onChange(nextReasoningLevel(value, offAllowed))}
      style={{ cursor: disabled ? 'not-allowed' : 'pointer', flex: '0 1 auto', width: 'auto' }}
    >
      {Array.from({ length: DOT_COUNT }, (_, i) => (
        <span
          key={i}
          className="om-reasoning-dot"
          aria-hidden="true"
          style={i < lit ? { background: color, boxShadow: `0 0 6px ${color}66` } : undefined}
        />
      ))}
    </button>
  )
}
