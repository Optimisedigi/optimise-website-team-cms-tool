/**
 * PIN-gate UI PREVIEW — NOT WIRED TO ANYTHING.
 *
 * A throwaway visual mock of the Google Ads dashboard PIN screen, restyled to
 * match the proposal v2 "cosmic" theme (Space Grotesk + JetBrains Mono, deep
 * navy #07091a, electric-blue accents). This route exists purely so the team
 * can eyeball a redesign before we touch the real gate in
 * `../[slug]/DashboardClient.tsx`. The PIN inputs here do nothing — there is no
 * verify call, no auth, no data fetch.
 *
 * View at: /google-dashboard/preview
 */

import { Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import PinGateLogo from '@/components/PinGateLogo'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export default function GoogleDashboardPinPreview(): React.JSX.Element {
  const sg = "'Space Grotesk', system-ui, sans-serif"
  const mono = "'JetBrains Mono', ui-monospace, monospace"

  return (
    <div
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        position: 'relative',
        overflow: 'hidden',
        // Deep cosmic gradient lifted from the proposal v2 cover slide.
        background:
          'radial-gradient(1200px 700px at 50% 18%, #11162e 0%, #0b1226 45%, #07091a 100%)',
      }}
    >
      {/* Starfield — subtle layered radial dots, purely decorative. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage: [
            'radial-gradient(1.5px 1.5px at 12% 22%, rgba(255,255,255,0.55), transparent)',
            'radial-gradient(1.5px 1.5px at 78% 14%, rgba(255,255,255,0.45), transparent)',
            'radial-gradient(1px 1px at 33% 68%, rgba(255,255,255,0.4), transparent)',
            'radial-gradient(1px 1px at 64% 82%, rgba(255,255,255,0.35), transparent)',
            'radial-gradient(2px 2px at 88% 56%, rgba(153,192,255,0.5), transparent)',
            'radial-gradient(1.5px 1.5px at 22% 88%, rgba(255,255,255,0.3), transparent)',
            'radial-gradient(1px 1px at 50% 38%, rgba(255,255,255,0.3), transparent)',
          ].join(','),
        }}
      />

      {/* Preview ribbon so nobody mistakes this for the live gate. */}
      <div
        style={{
          position: 'fixed',
          top: 16,
          left: 16,
          fontFamily: mono,
          fontSize: 11,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: '#99c0ff',
          border: '1px solid rgba(153,192,255,0.35)',
          borderRadius: 999,
          padding: '5px 12px',
          background: 'rgba(11,18,38,0.6)',
        }}
      >
        UI Preview · not live
      </div>

      <div style={{ position: 'relative', textAlign: 'center', marginBottom: 44 }}>
        {/* Eyebrow — purple, uppercase, letterspaced (proposal v2 .eyebrow). */}
        <div
          style={{
            fontFamily: sg,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: '#4d94ff',
            marginBottom: 18,
          }}
        >
          Google Ads Dashboard
        </div>

        {/* Client name — Space Grotesk display, tight tracking. */}
        <h1
          style={{
            fontFamily: sg,
            fontSize: 52,
            fontWeight: 600,
            lineHeight: 1.0,
            letterSpacing: '-0.02em',
            color: '#ffffff',
            margin: 0,
          }}
        >
          Malcolm Thompson Pumps
        </h1>
      </div>

      {/* PIN inputs — cosmic surfaces with a blue focus ring. Static preview
          only; sample digits shown in plain numerals (not masked). */}
      <div style={{ position: 'relative', display: 'flex', gap: 18 }}>
        {['4', '2', '8', ''].map((digit, i) => (
          <div
            key={i}
            /* The next real cell to fill is the first empty one. */
            style={{
              width: 76,
              height: 92,
              borderRadius: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: sg,
              fontSize: 34,
              fontWeight: 600,
              color: '#ffffff',
              background:
                'linear-gradient(180deg, rgba(17,22,46,0.9) 0%, rgba(11,18,38,0.9) 100%)',
              // The first empty cell is "focused" to show the accent treatment.
              border:
                i === 3
                  ? '2px solid #4d94ff'
                  : '1px solid rgba(153,192,255,0.18)',
              boxShadow:
                i === 3
                  ? '0 0 0 4px rgba(0,102,255,0.18), 0 8px 24px rgba(0,0,0,0.35)'
                  : '0 8px 24px rgba(0,0,0,0.25)',
            }}
          >
            {digit}
          </div>
        ))}
      </div>

      {/* Helper text — JetBrains Mono, muted, matches deck .h-meta vibe. */}
      <p
        style={{
          position: 'relative',
          fontFamily: mono,
          fontSize: 13,
          letterSpacing: '0.02em',
          color: '#8b90ad',
          marginTop: 30,
        }}
      >
        Enter your 4-digit PIN access code to view the dashboard
      </p>

      <PinGateLogo />
    </div>
  )
}
