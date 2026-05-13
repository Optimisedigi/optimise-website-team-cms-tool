/**
 * /partners/google-ads-proposal/epg-engines
 * Google Ads Proposal — EPG Engines Rebrand (Kohler → Rehlko).
 */
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import '@/app/(frontend)/proposals/[slug]/v2/report-v2.css'
import '@/app/(frontend)/partners/google-ads-proposal/epg-engines/epg.css'
import { DeckStage } from '@/components/v2/DeckStage'
import RocketScroll from '@/components/RocketScroll'

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

export default function EpgProposal() {
  return (
    <div className={`proposal-v2 epg ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <DeckStage>
        <RocketScroll>

          {/* ── SLIDE 01 · COVER ─────────────────────────────────── */}
          <section className="slide dark cover" data-label="01 Cover">
            <div className="starfield" aria-hidden="true" />
            <div className="orbit-deco" style={{ width: 1400, height: 1400, right: -500, top: -400 }} />
            <div className="orbit-deco" style={{ width: 900, height: 900, right: -200, top: -100, borderColor: 'rgba(249,115,22,0.12)' }} />
            <div className="top">
              <div className="brand-mark">
                <span className="dot" />
                <a href="https://optimisedigital.online" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <img src="/optimise-digital-logo-white.webp" alt="Optimise Digital" style={{ height: 39, width: 'auto' }} />
                </a>
              </div>
            </div>
            <div className="center">
              <div className="eyebrow-line">
                <span className="pill" style={{ color: '#f97316', borderColor: '#f97316', fontSize: 26 }}>Google Ads Proposal</span>
                <span className="meta-tag" style={{ color: 'rgba(255,255,255,0.45)' }}>Rebrand Campaign · Australia · v1.0</span>
                <span className="meta-tag" style={{ color: 'rgba(255,255,255,0.45)' }}>June 2026</span>
              </div>
              <div className="h1" style={{ fontSize: 108 }}>
                Capturing the transition<br />from <em style={{ color: '#f97316' }}>Kohler</em> to<br /><em style={{ color: '#f97316' }}>Rehlko.</em>
              </div>
              <div className="deck-for" style={{ fontSize: 35 }}>
                Own branded search during the rebrand. Build Rehlko awareness<br />nationwide. Launch 1 June 2026.
              </div>
            </div>
            <div />
          </section>

          {/* ── SLIDE 02 · SEARCH VOLUME ─────────────────────────── */}
          <section className="slide" data-label="02 Search Volume">
            <div className="brand-tag"><span className="dot"></span> 02 · Search Volume</div>
            <div className="slide-head">
              <div className="h-left">
                <div className="h-eyebrow">02 · Search Volume</div>
                <h1 className="h-title">Search volume &amp; opportunity</h1>
              </div>
              <div className="h-meta">Branded + Non-branded · Australia-wide</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '0.7fr 1.5fr', gap: 48, alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div className="stat-tile" style={{ padding: '24px 28px', gap: 10 }}>
                  <div className="lbl" style={{ fontSize: 24 }}>Branded search volume</div>
                  <div className="val purple" style={{ fontSize: 64, lineHeight: 1 }}>~900</div>
                  <div className="desc" style={{ fontSize: 24 }}>Kohler + Rehlko combined/mo</div>
                </div>
                <div className="stat-tile" style={{ padding: '24px 28px', gap: 10 }}>
                  <div className="lbl" style={{ fontSize: 22 }}>Avg. CPC</div>
                  <div className="val purple" style={{ fontSize: 48, lineHeight: 1 }}>$4-12</div>
                </div>
                <p className="body" style={{ fontSize: 27, maxWidth: 600, margin: 0, lineHeight: 1.45 }}>
                  <strong style={{ color: 'var(--ink)' }}>Critical window:</strong> Kohler still carries strong brand recognition. The rebrand creates a finite opportunity to capture this high-intent traffic before competitors move in.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="eyebrow" style={{ color: 'var(--purple-deep)', marginBottom: 6 }}>Volume by category</div>
                {[
                  { cat: 'Kohler branded terms', sub: '"kohler engines", "kohler engine parts", "kohler diesel engine"', vol: '600-900', nat: '~2,500', share: '58%', color: '#f97316' },
                  { cat: 'Rehlko branded terms (growing)', sub: '"rehlko engines", "rehlko Australia", "rehlko diesel engine"', vol: '50-150', nat: '~200', share: '22%', color: '#f97316' },
                  { cat: 'Non-branded engine terms', sub: '"petrol engine distributor", "industrial engine supplier", "diesel engine wholesale"', vol: '200-400', nat: '~1,800', share: '20%', color: '#fb923c' },
                ].map((row, i) => (
                  <div key={i} className="card" style={{ padding: '18px 24px', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div className="num-tag" style={{ fontSize: 26, color: 'var(--ink)' }}>{row.cat}</div>
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, color: 'var(--ink-mute)', marginTop: 4 }}>{row.sub}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 24, flexShrink: 0 }}>
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, color: row.color, fontWeight: 600 }}>AU: {row.vol}/mo</div>
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, color: '#6b7280', fontWeight: 600 }}>National: {row.nat}/mo</div>
                      </div>
                    </div>
                    <div style={{ height: 8, background: 'var(--line)', borderRadius: 4, overflow: 'hidden', marginTop: 6 }}>
                      <div style={{ width: row.share, height: '100%', background: row.color, borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="slide-foot" />
          </section>

          {/* ── SLIDE 03 · KEYWORD LANDSCAPE ─────────────────────── */}
          <section className="slide" data-label="03 Keyword Landscape">
            <div className="brand-tag"><span className="dot"></span> 03 · Keyword Landscape</div>
            <div className="slide-head">
              <div className="h-left">
                <div className="h-eyebrow">03 · Keyword Landscape</div>
                <h1 className="h-title">Keyword landscape</h1>
              </div>
              <div className="h-meta">Google Keyword Planner estimates · AUD</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div className="eyebrow" style={{ color: 'var(--purple-deep)', marginBottom: 0 }}>
                  TOP 20 KEYWORDS BY SEARCH VOLUME
                </div>
                <span className="pill" style={{ fontSize: 15, color: '#f97316', borderColor: '#f97316', padding: '4px 12px' }}>Search + Display</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { term: 'kohler engines', vol: '140-260', cpc: '$6-12', intent: 'High', type: 'Kohler Branded' },
                  { term: 'kohler engine', vol: '90-170', cpc: '$6-10', intent: 'High', type: 'Kohler Branded' },
                  { term: 'kohler diesel engine', vol: '70-140', cpc: '$8-14', intent: 'High', type: 'Kohler Branded' },
                  { term: 'kohler petrol engine', vol: '60-120', cpc: '$5-10', intent: 'High', type: 'Kohler Branded' },
                  { term: 'kohler engine parts', vol: '90-170', cpc: '$8-14', intent: 'Very High', type: 'Kohler Branded' },
                  { term: 'kohler engine Australia', vol: '40-90', cpc: '$7-12', intent: 'High', type: 'Kohler Branded' },
                  { term: 'kohler engines distributor', vol: '20-50', cpc: '$10-18', intent: 'High', type: 'Kohler Branded' },
                  { term: 'rehlko engines', vol: '20-60', cpc: '$5-10', intent: 'High', type: 'Rehlko Branded' },
                  { term: 'rehlko Australia', vol: '20-50', cpc: '$4-8', intent: 'Medium', type: 'Rehlko Branded' },
                  { term: 'rehlko diesel engine', vol: '20-50', cpc: '$6-10', intent: 'High', type: 'Rehlko Branded' },
                  { term: 'rehlko engine parts', vol: '10-30', cpc: '$7-12', intent: 'Very High', type: 'Rehlko Branded' },
                  { term: 'rehlko petrol engine', vol: '10-30', cpc: '$5-9', intent: 'High', type: 'Rehlko Branded' },
                  { term: 'diesel engine distributor', vol: '40-80', cpc: '$8-14', intent: 'High', type: 'Non-branded' },
                  { term: 'industrial engine supplier', vol: '30-70', cpc: '$10-18', intent: 'High', type: 'Non-branded' },
                  { term: 'petrol engine wholesale', vol: '20-50', cpc: '$6-10', intent: 'Medium', type: 'Non-branded' },
                  { term: 'diesel engine wholesale', vol: '20-40', cpc: '$8-14', intent: 'High', type: 'Non-branded' },
                  { term: 'lombardini diesel engine', vol: '20-40', cpc: '$6-12', intent: 'High', type: 'Non-branded' },
                  { term: 'stationary diesel engine', vol: '20-40', cpc: '$8-14', intent: 'Medium', type: 'Non-branded' },
                  { term: 'horizontal shaft engine', vol: '30-60', cpc: '$5-9', intent: 'High', type: 'Non-branded' },
                  { term: 'engine distributor Australia', vol: '20-40', cpc: '$8-14', intent: 'High', type: 'Non-branded' },
                ].map((kw, j) => (
                  <div key={j} className="card" style={{ padding: '14px 18px', gap: 6 }}>
                    <div className="h" style={{ fontSize: 21, lineHeight: 1.2 }}>{kw.term}</div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, color: 'var(--ink-mute)' }}>{kw.vol}/mo</span>
                      <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, color: 'var(--gold)', fontWeight: 600 }}>CPC {kw.cpc}</span>
                      <span style={{
                        fontFamily: "'Space Grotesk',sans-serif",
                        fontSize: 14,
                        fontWeight: 600,
                        padding: '2px 7px',
                        borderRadius: 3,
                        background: kw.type === 'Kohler Branded' ? 'rgba(249,115,22,0.12)' : kw.type === 'Rehlko Branded' ? 'rgba(249,115,22,0.08)' : 'rgba(139,92,246,0.08)',
                        color: kw.type === 'Kohler Branded' ? '#c2410c' : kw.type === 'Rehlko Branded' ? '#ea580c' : '#7c3aed',
                      }}>{kw.type}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="small" style={{ marginTop: 16 }}>
              Rehlko is a newly established brand (formerly Kohler Energy, announced September 2024). Search volume is currently low but will grow as awareness builds. Capturing Kohler-branded traffic now is critical — competitors are likely eyeing this market segment.
            </p>
            <div className="slide-foot" />
          </section>

          {/* ── SLIDE 04 · GOOGLE ADS BUDGET ─────────────────────── */}
          <section className="slide" data-label="04 Google Ads Budget">
            <div className="brand-tag"><span className="dot"></span> 04 · Google Ads Budget</div>
            <div className="slide-head">
              <div className="h-left">
                <div className="h-eyebrow">04 · Google Ads Budget</div>
                <h1 className="h-title">Monthly Budget</h1>
              </div>
              <div className="h-meta">Search + Display · Australia-wide</div>
            </div>
            <p className="pull" style={{ fontSize: 28, lineHeight: 1.25, maxWidth: 1700, marginBottom: 24 }}>
              <strong style={{ color: 'var(--ink)' }}>The goal:</strong> Capture every Kohler-branded searcher who is mid-purchase journey. Simultaneously build Rehlko brand awareness so EPG is top-of-mind as the transition completes.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              {[
                {
                  name: 'Search Campaign',
                  budget: '$3,200',
                  duration: 'June 2026 onwards',
                  goal: 'Capture high-intent branded traffic — both Kohler (transition) and Rehlko (new brand). Target dealers, equipment manufacturers, and maintenance businesses actively searching for engine suppliers.',
                  adGroups: [
                    { label: 'Kohler Branded', share: '45%', desc: 'Own the Kohler search volume before competitors claim it', color: '#f97316' },
                    { label: 'Rehlko Branded', share: '25%', desc: 'Build Rehlko awareness from day one, establish ownership', color: '#ea580c' },
                    { label: 'Non-Branded Engine Terms', share: '30%', desc: 'Capture dealers and buyers searching generic engine terms', color: '#fb923c' },
                  ],
                  borderColor: '#f97316',
                },
                {
                  name: 'Display Campaign',
                  budget: '$800',
                  duration: 'June 2026 onwards',
                  goal: 'Brand awareness and remarketing. Reach decision-makers who have visited the site or interacted with EPG content. Support the search campaign through display retargeting.',
                  adGroups: [
                    { label: 'Remarketing', share: '50%', desc: 'Re-engage site visitors and past enquirers', color: '#7c3aed' },
                    { label: 'Brand Awareness', share: '50%', desc: 'Target trade, agriculture, and industrial audiences in NSW, VIC, QLD, WA', color: '#8b5cf6' },
                  ],
                  borderColor: '#7c3aed',
                },
              ].map((tier, i) => (
                <div key={i} className="card" style={{ padding: '28px 32px', gap: 14, borderTop: `4px solid ${tier.borderColor}` }}>
                  <div className="h" style={{ fontSize: 30, lineHeight: 1.2 }}>{tier.name}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 52, fontWeight: 700, color: tier.borderColor, lineHeight: 1 }}>{tier.budget}</div>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, color: 'var(--ink-mute)' }}>{tier.duration}</div>
                  </div>
                  <div className="b" style={{ fontSize: 20, marginTop: 4 }}>{tier.goal}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {tier.adGroups.map((ag, j) => (
                      <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: ag.color, marginTop: 7, flexShrink: 0 }} />
                        <div>
                          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 600, color: 'var(--ink)' }}>{ag.label} <span style={{ color: ag.color }}>({ag.share})</span></div>
                          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, color: 'var(--ink-mute)', marginTop: 2 }}>{ag.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 24 }}>
              {[
                { metric: 'Total Monthly Budget', value: '$4,000', sub: 'Fixed retainer' },
                { metric: 'Target Monthly Clicks', value: '400-700', sub: 'Based on $6-10 avg. CPC' },
                { metric: 'Target CPA', value: '< $80', sub: 'Dealer / trade enquiry' },
              ].map((m, i) => (
                <div key={i} className="card" style={{ padding: '20px 24px', textAlign: 'center', gap: 6 }}>
                  <div className="num-tag" style={{ fontSize: 20, color: 'var(--ink-mute)' }}>{m.metric}</div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 36, fontWeight: 700, color: '#f97316', lineHeight: 1 }}>{m.value}</div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, color: 'var(--ink-mute)' }}>{m.sub}</div>
                </div>
              ))}
            </div>
            {/* ── BUDGET CEILING ANALYSIS ── */}
            <div style={{ marginTop: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div className="eyebrow" style={{ color: 'var(--purple-deep)', marginBottom: 0 }}>Budget Ceiling Analysis</div>
                <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, color: 'var(--ink-mute)', fontStyle: 'italic' }}>Full keyword capture — upper-bound monthly spend</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Left: ceiling breakdown */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    {
                      label: 'Kohler Branded Terms',
                      vol: '~2,000/mo',
                      avgCpc: '$8.50',
                      ceiling: '$17,000',
                      desc: 'Full capture of all Kohler engine searches',
                      color: '#f97316',
                      pct: 58,
                    },
                    {
                      label: 'Rehlko Branded Terms',
                      vol: '~250/mo',
                      avgCpc: '$6.00',
                      ceiling: '$1,500',
                      desc: 'Full capture as Rehlko brand awareness builds',
                      color: '#ea580c',
                      pct: 5,
                    },
                    {
                      label: 'Non-Branded Engine Terms',
                      vol: '~1,400/mo',
                      avgCpc: '$8.50',
                      ceiling: '$11,900',
                      desc: 'Dealers, distributors, industrial engine buyers',
                      color: '#fb923c',
                      pct: 41,
                    },
                    {
                      label: 'Display Remarketing',
                      vol: 'Impressions-based',
                      avgCpc: '$0.40 CPM',
                      ceiling: '$1,500',
                      desc: '1M impressions/month targeting trade & industrial',
                      color: '#7c3aed',
                      pct: 5,
                    },
                  ].map((row, i) => (
                    <div key={i} className="card" style={{ padding: '14px 20px', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 600, color: 'var(--ink)' }}>{row.label}</div>
                          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, color: 'var(--ink-mute)', marginTop: 2 }}>{row.desc}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700, color: row.color }}>{row.ceiling}</div>
                          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, color: 'var(--ink-mute)' }}>{row.vol} · CPC {row.avgCpc}</div>
                        </div>
                      </div>
                      <div style={{ height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${row.pct}%`, height: '100%', background: row.color, borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
                </div>
                {/* Right: ceiling summary */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="card" style={{ padding: '24px 28px', gap: 8, textAlign: 'center', background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.15)' }}>
                    <div className="num-tag" style={{ fontSize: 22, color: 'var(--ink-mute)' }}>Total Monthly Budget Ceiling</div>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 60, fontWeight: 700, color: '#f97316', lineHeight: 1 }}>$31,900</div>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, color: 'var(--ink-mute)' }}>Full keyword capture — all segments</div>
                  </div>
                  <div className="card" style={{ padding: '20px 28px', gap: 10, background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.12)' }}>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 600, color: 'var(--ink)' }}>Proposed budget vs. ceiling</div>
                    <div style={{ height: 20, background: 'var(--line)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                      <div style={{ width: '12.5%', height: '100%', background: '#7c3aed', borderRadius: 4, display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
                        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: '#fff' }}>$4k</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, color: '#7c3aed', fontWeight: 600 }}>$4,000 proposed</span>
                      <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, color: 'var(--ink-mute)' }}>$31,900 ceiling</span>
                    </div>
                  </div>
                  <div className="card" style={{ padding: '20px 28px', gap: 8 }}>
                    <div className="num-tag" style={{ fontSize: 20, color: 'var(--ink-mute)', marginBottom: 6 }}>Scale roadmap</div>
                    {[
                      { phase: 'Phase 01 · Now', budget: '$4,000/mo', note: 'Focus on Kohler Branded — highest volume, lowest competition', color: '#f97316' },
                      { phase: 'Phase 02 · Month 3+', budget: '$8,000/mo', note: 'Add non-branded terms + expand Rehlko as volume grows', color: '#ea580c' },
                      { phase: 'Phase 03 · Month 6+', budget: '$16,000/mo', note: 'Dominate all segments. 100% branded capture + non-branded scale', color: '#22c55e' },
                      { phase: 'Phase 04 · Full ceiling', budget: '$31,900/mo', note: 'Full keyword capture across all categories when unit economics confirmed', color: '#7c3aed' },
                    ].map((s, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: i < 3 ? '1px solid var(--line)' : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, color: 'var(--ink)' }}>{s.phase}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700, color: s.color }}>{s.budget}</div>
                          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, color: 'var(--ink-mute)' }}>{s.note}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="slide-foot" />
          </section>

          {/* ── SLIDE 05 · FLIGHT PLAN ───────────────────────────── */}
          <section className="slide" data-label="05 Flight Plan">
            <div className="brand-tag"><span className="dot"></span> 05 · Flight Plan</div>
            <div className="slide-head">
              <div className="h-left">
                <div className="h-eyebrow">05 · Flight Plan</div>
                <h1 className="h-title">Roadmap</h1>
              </div>
              <div className="h-meta">Ideal go live: 1 June 2026</div>
            </div>
            <div className="roadmap" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {[
                { week: 'WEEK 01', step: 'Create Account + Onboard', body: 'Optimise Digital sends agreement. EPG signs and grants Google Ads account access. Onboard: collect site credentials, map existing sales process, identify top enquiry types (dealers, manufacturers, maintenance), and confirm Rehlko product range details.', color: '#f97316' },
                { week: 'WEEK 02', step: 'CRO Audit + Access Setup', body: 'Full site access granted. CRO audit of engine and generator landing pages with recommendations. Setup GA4, configure Google Ads conversion tracking (enquiry forms, dealer locator usage, phone calls), and site-wide analytics.', color: '#ea580c' },
                { week: 'WEEK 03', step: 'Proposal + Strategy', body: 'Present full campaign proposal, ad group structure, and keyword strategy for EPG sign-off. Finalise negative keyword list. Confirm budget split between Search and Display. Refine ad copy themes: transition urgency + new brand energy.', color: '#f97316' },
                { week: 'WEEK 04', step: 'Campaign Build + Go Live', body: 'Targeting go live: 1 June 2026. Build 3 search ad groups (Kohler Branded, Rehlko Branded, Non-Branded). Write 3 ad copy variants per group. Configure location targeting: NSW, VIC, QLD, WA primary; national secondary. Launch display remarketing audience. Budget: $4,000/month.', color: '#22c55e' },
              ].map((cell, i) => (
                <div key={i} className="road-cell" style={{ borderTop: `3px solid ${cell.color}` }}>
                  <div className="week" style={{ color: cell.color }}>{cell.week}</div>
                  <div className="step">{cell.step}</div>
                  <div className="desc">{cell.body}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
              {[
                { phase: 'ONGOING', step: 'Optimise + Scale', body: 'Scale spend on top-performing keywords. Expand Rehlko-branded keywords as volume grows. A/B test ad copy themes (transition urgency vs. new brand energy). Grow remarketing lists. Report monthly on branded capture rate vs. competitors.', color: '#22c55e' },
                { phase: 'MONTH 03+', step: 'Rehlko-First Pivot', body: 'As Rehlko brand awareness grows and Kohler-branded volume begins to decline, shift budget from Kohler Branded to Rehlko Branded. By Month 06, Rehlko should be the dominant branded term. Monitor competitor activity throughout.', color: '#7c3aed' },
              ].map((cell, i) => (
                <div key={i} className="road-cell" style={{ borderTop: `3px solid ${cell.color}`, gridColumn: i === 0 ? '1' : '2' }}>
                  <div className="week" style={{ color: cell.color }}>{cell.phase}</div>
                  <div className="step">{cell.step}</div>
                  <div className="desc">{cell.body}</div>
                </div>
              ))}
            </div>
            <div className="slide-foot" />
          </section>

        </RocketScroll>
      </DeckStage>
    </div>
  )
}
