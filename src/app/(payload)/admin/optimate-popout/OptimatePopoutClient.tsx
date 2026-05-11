'use client'

import OptiMateMultiChat, {
  type OptiMateChatTarget,
} from '@/components/OptiMateMultiChat'

interface Props {
  targets: OptiMateChatTarget[]
}

/**
 * Client-side wrapper for the standalone Optimate window. Renders the
 * multi-chat full-window with light chrome (header strip + close button)
 * but no admin sidebar.
 */
export default function OptimatePopoutClient({ targets }: Props) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--theme-input-bg, #fff)',
        color: 'var(--theme-text, #1f2937)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header strip */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          borderBottom: '1px solid var(--theme-border-color, #e5e7eb)',
          background: '#111',
          color: '#fff',
        }}
      >
        <img
          src="/optimate-icon.png"
          alt=""
          width={24}
          height={24}
          style={{ borderRadius: '50%', display: 'block' }}
        />
        <div style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>
          OptiMate
          <span
            style={{
              opacity: 0.7,
              fontWeight: 400,
              marginLeft: 6,
              fontSize: 11,
            }}
          >
            ·{' '}
            {targets.length === 1
              ? (targets[0].businessName ?? targets[0].customerId)
              : `${targets.length} accounts`}
          </span>
        </div>
        <button
          type="button"
          onClick={() => window.close()}
          title="Close window"
          style={{
            background: 'transparent',
            color: '#fff',
            border: 'none',
            fontSize: 18,
            lineHeight: 1,
            cursor: 'pointer',
            padding: '0 4px',
          }}
        >
          ×
        </button>
      </div>

      {/* Chat body. flex:1 + minHeight:0 lets OptiMateMultiChat manage its
       *  own scrolling. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <OptiMateMultiChat targets={targets} />
      </div>
    </div>
  )
}
