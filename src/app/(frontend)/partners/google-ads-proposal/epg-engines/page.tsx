/**
 * /partners/google-ads-proposal/epg-engines
 * Google Ads Proposal — EPG Engines Rebrand (Kohler → Rehlko).
 * Structure mirrors the Swanson Industries proposal exactly.
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
    <div className={`proposal-v2 ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
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
              <div className="h1" style={{ fontSize: 121 }}>
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
                  <div className="val purple" style={{ fontSize: 48, lineHeight: 1 }}>$6-14</div>
                </div>
                <p className="body" style={{ fontSize: 27, maxWidth: 600, margin: 0, lineHeight: 1.45 }}>
                  <strong style={{ color: 'var(--ink)' }}>Critical window:</strong> Kohler carries strong brand recognition. The rebrand creates a finite opportunity to capture this high-intent traffic before competitors move in.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="eyebrow" style={{ color: 'var(--purple-deep)', marginBottom: 6 }}>Volume by category</div>
                {[
                  { cat: 'Kohler branded terms', sub: '"kohler engines", "kohler engine parts", "kohler diesel engine"', vol: '~600-900', nat: '~2,500', share: '58%', color: '#f97316' },
                  { cat: 'Rehlko branded terms (growing)', sub: '"rehlko engines", "rehlko Australia", "rehlko diesel engine"', vol: '~50-150', nat: '~200', share: '22%', color: '#ea580c' },
                  { cat: 'Non-branded engine terms', sub: '"diesel engine distributor", "industrial engine supplier", "petrol engine wholesale"', vol: '~200-400', nat: '~1,800', share: '20%', color: '#fb923c' },
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
              <div className="eyebrow" style={{ color: 'var(--purple-deep)', marginBottom: 6 }}>
                TOP 20 KEYWORDS BY SEARCH VOLUME
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { term: 'kohler engines', vol: '140-260', cpc: '$6-12', geo: 'Australia', intent: 'High' },
                  { term: 'kohler engine', vol: '90-170', cpc: '$6-10', geo: 'Australia', intent: 'High' },
                  { term: 'kohler diesel engine', vol: '70-140', cpc: '$8-14', geo: 'Australia', intent: 'High' },
                  { term: 'kohler petrol engine', vol: '60-120', cpc: '$5-10', geo: 'Australia', intent: 'High' },
                  { term: 'kohler engine parts', vol: '90-170', cpc: '$8-14', geo: 'Australia', intent: 'Very High' },
                  { term: 'kohler engine Australia', vol: '40-90', cpc: '$7-12', geo: 'Australia', intent: 'High' },
                  { term: 'kohler engines distributor', vol: '20-50', cpc: '$10-18', geo: 'Australia', intent: 'High' },
                  { term: 'rehlko engines', vol: '20-60', cpc: '$5-10', geo: 'Australia', intent: 'High' },
                  { term: 'rehlko Australia', vol: '20-50', cpc: '$4-8', geo: 'Australia', intent: 'Medium' },
                  { term: 'rehlko diesel engine', vol: '20-50', cpc: '$6-10', geo: 'Australia', intent: 'High' },
                  { term: 'rehlko engine parts', vol: '10-30', cpc: '$7-12', geo: 'Australia', intent: 'Very High' },
                  { term: 'rehlko petrol engine', vol: '10-30', cpc: '$5-9', geo: 'Australia', intent: 'High' },
                  { term: 'diesel engine distributor', vol: '40-80', cpc: '$8-14', geo: 'Australia', intent: 'High' },
                  { term: 'industrial engine supplier', vol: '30-70', cpc: '$10-18', geo: 'Australia', intent: 'High' },
                  { term: 'petrol engine wholesale', vol: '20-50', cpc: '$6-10', geo: 'Australia', intent: 'Medium' },
                  { term: 'diesel engine wholesale', vol: '20-40', cpc: '$8-14', geo: 'Australia', intent: 'High' },
                  { term: 'lombardini diesel engine', vol: '20-40', cpc: '$6-12', geo: 'Australia', intent: 'High' },
                  { term: 'stationary diesel engine', vol: '20-40', cpc: '$8-14', geo: 'Australia', intent: 'Medium' },
                  { term: 'horizontal shaft engine', vol: '30-60', cpc: '$5-9', geo: 'Australia', intent: 'High' },
                  { term: 'engine distributor Australia', vol: '20-40', cpc: '$8-14', geo: 'Australia', intent: 'High' },
                ].map((kw, j) => (
                  <div key={j} className="card" style={{ padding: '14px 18px', gap: 6 }}>
                    <div className="h" style={{ fontSize: 22, lineHeight: 1.2 }}>{kw.term}</div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 4 }}>
                      <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, color: 'var(--ink-mute)' }}>{kw.vol}/mo</span>
                      <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, color: 'var(--gold)', fontWeight: 600 }}>Avg CPC {kw.cpc}</span>
                      <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, color: 'var(--ink-mute)' }}>{kw.geo}</span>
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
                <h1 className="h-title">Monthly Budget Recommendations</h1>
              </div>
              <div className="h-meta">Search + Display · Australia-wide</div>
            </div>
            <p className="pull" style={{ fontSize: 28, lineHeight: 1.25, maxWidth: 1700, marginBottom: 24 }}>
              <strong style={{ color: 'var(--ink)' }}>The goal:</strong> Capture every Kohler-branded search mid-purchase. Build Rehlko brand awareness simultaneously so EPG is top-of-mind as the transition completes.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 24 }}>
              {[
                {
                  phase: 'PHASE 01',
                  name: 'Search Campaign',
                  budget: '$3,200',
                  duration: 'June 2026 onwards',
                  goal: 'Capture high-intent branded traffic — both Kohler (transition) and Rehlko (new brand). Target dealers, equipment manufacturers, and maintenance businesses actively searching for engine suppliers.',
                  targets: [
                    'Kohler Branded · 45% of budget',
                    'Rehlko Branded · 25% of budget',
                    'Non-Branded Engine Terms · 30% of budget',
                    'Exact + phrase match keywords',
                    'NSW, VIC, QLD, WA primary targeting',
                  ],
                  color: '#f97316',
                },
                {
                  phase: 'PHASE 02',
                  name: 'Display Campaign',
                  budget: '$800',
                  duration: 'June 2026 onwards',
                  goal: 'Brand awareness and remarketing. Reach decision-makers who have visited the site or interacted with EPG content. Support the search campaign through display retargeting.',
                  targets: [
                    'Remarketing · 50% of budget',
                    'Brand Awareness · 50% of budget',
                    'Trade, agriculture & industrial audiences',
                    'Targeting NSW, VIC, QLD, WA',
                    '1M+ impressions/month',
                  ],
                  color: '#7c3aed',
                },
                {
                  phase: 'PHASE 03',
                  name: 'Scale + Pivot',
                  budget: '$8,000+',
                  duration: 'Month 3+',
                  goal: 'Scale to $8,000+/month if Phase 01 CPA < $80. By Month 06, pivot budget from Kohler Branded to Rehlko Branded as Rehlko volume grows and Kohler volume fades.',
                  targets: [
                    'Rehlko Branded expansion',
                    'Kohler Branded wind-down',
                    'Remarketing audience growth',
                    'National coverage',
                    'Performance max trial',
                  ],
                  color: '#22c55e',
                },
              ].map((tier, i) => (
                <div key={i} className="card" style={{ padding: '24px 28px', gap: 10, borderTop: `4px solid ${tier.color}` }}>
                  <div className="num-tag" style={{ color: tier.color }}>{tier.phase}</div>
                  <div className="h" style={{ fontSize: 28, lineHeight: 1.2 }}>{tier.name}</div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 36, fontWeight: 700, color: tier.color, lineHeight: 1 }}>{tier.budget}</div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, color: 'var(--ink-mute)' }}>{tier.duration}</div>
                  <div className="b" style={{ fontSize: 21, marginTop: 6 }}>{tier.goal}</div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {tier.targets.map((kw, j) => (
                      <li key={j} style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 19, color: 'var(--ink-2)', lineHeight: 1.3 }}>{kw}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {/* Budget Ceiling Analysis — mirrors Swanson's disclaimer note position */}
            <div style={{ marginTop: 8 }}>
              <div className="eyebrow" style={{ color: 'var(--purple-deep)', marginBottom: 14 }}>
                Budget Ceiling Analysis
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 20 }}>
                {/* Left: segment ceilings */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'Kohler Branded Terms', vol: '~2,000/mo', cpc: '$8.50 avg', ceiling: '$17,000', color: '#f97316', share: '53%' },
                    { label: 'Rehlko Branded Terms', vol: '~250/mo', cpc: '$6.00 avg', ceiling: '$1,500', color: '#ea580c', share: '5%' },
                    { label: 'Non-Branded Engine Terms', vol: '~1,400/mo', cpc: '$8.50 avg', ceiling: '$11,900', color: '#fb923c', share: '37%' },
                    { label: 'Display Remarketing', vol: 'Impressions-based', cpc: '$0.40 CPM', ceiling: '$1,500', color: '#7c3aed', share: '5%' },
                  ].map((row, i) => (
                    <div key={i} className="card" style={{ padding: '14px 20px', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 600, color: 'var(--ink)' }}>{row.label}</div>
                          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, color: 'var(--ink-mute)', marginTop: 2 }}>{row.vol} · CPC {row.cpc}</div>
                        </div>
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700, color: row.color, flexShrink: 0 }}>{row.ceiling}</div>
                      </div>
                      <div style={{ height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden', marginTop: 6 }}>
                        <div style={{ width: row.share, height: '100%', background: row.color, borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
                </div>
                {/* Right: ceiling summary + scale roadmap */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="card" style={{ padding: '22px 24px', gap: 8, textAlign: 'center', background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.15)' }}>
                    <div className="num-tag" style={{ fontSize: 20, color: 'var(--ink-mute)' }}>Total Monthly Budget Ceiling</div>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 52, fontWeight: 700, color: '#f97316', lineHeight: 1 }}>$31,900</div>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, color: 'var(--ink-mute)' }}>Full keyword capture — all segments</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="num-tag" style={{ fontSize: 18, color: 'var(--ink-mute)', marginBottom: 2 }}>Scale roadmap</div>
                    {[
                      { phase: 'Phase 01 · Now', budget: '$4,000/mo', color: '#f97316' },
                      { phase: 'Phase 02 · Month 3+', budget: '$8,000/mo', color: '#ea580c' },
                      { phase: 'Phase 03 · Month 6+', budget: '$16,000/mo', color: '#22c55e' },
                      { phase: 'Phase 04 · Full ceiling', budget: '$31,900/mo', color: '#7c3aed' },
                    ].map((s, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 3 ? '1px solid var(--line)' : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, color: 'var(--ink)' }}>{s.phase}</span>
                        </div>
                        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700, color: s.color }}>{s.budget}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, color: 'var(--ink-mute)' }}>$4k proposed</span>
                    <div style={{ flex: 1, height: 12, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: '12.5%', height: '100%', background: '#7c3aed', borderRadius: 4 }} />
                    </div>
                    <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, color: 'var(--ink-mute)' }}>$31.9k ceiling</span>
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
            <div className="roadmap" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              {[
                { week: 'WEEK 01', step: 'Create Account + Onboard', body: 'Optimise Digital sends agreement. EPG signs and grants Google Ads account access. Onboard: collect site credentials, map existing sales process, identify top enquiry types (dealers, manufacturers, maintenance), and confirm Rehlko product range details.' },
                { week: 'WEEK 02', step: 'CRO Audit + Access Setup', body: 'Full site access granted. CRO audit of engine and generator landing pages with recommendations. Setup GA4, configure Google Ads conversion tracking (enquiry forms, dealer locator, phone calls), and site-wide analytics.' },
                { week: 'WEEK 03', step: 'Proposal + Strategy', body: 'Present full campaign proposal, ad group structure, and keyword strategy for EPG sign-off. Finalise negative keyword list. Confirm budget split between Search and Display. Refine ad copy themes: transition urgency + new brand energy.' },
                { week: 'WEEK 04', step: 'Campaign Build + Go Live', body: 'Targeting go live: 1 June 2026. Build 3 search ad groups (Kohler Branded, Rehlko Branded, Non-Branded). Write 3 ad copy variants per group. Configure location targeting: NSW, VIC, QLD, WA. Launch display remarketing. Budget: $4,000/month.' },
                { week: 'WEEK 05+', step: 'Optimise + Scale', body: 'Optimise landing pages, ad copy, and keyword targeting based on first 4 weeks of data. Scale spend to $8,000+/month if CPA < $80. Report monthly on branded capture rate vs. competitors.' },
              ].map((cell, i) => (
                <div key={i} className="road-cell">
                  <div className="week">{cell.week}</div>
                  <div className="step">{cell.step}</div>
                  <div className="desc">{cell.body}</div>
                </div>
              ))}
            </div>
            <p className="small" style={{ marginTop: 48 }}>
              The rebrand window is finite. As Rehlko awareness grows, Kohler-branded search volume will decline. Capturing Kohler traffic now — before competitors notice the transition — is the single biggest opportunity in this campaign.
            </p>
            <div className="slide-foot" />
          </section>

        </RocketScroll>
      </DeckStage>
    </div>
  )
}
