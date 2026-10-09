/**
 * /partners/google-ads-proposal/aussie-fluid-power
 * Google Ads Proposal: Aussie Fluid Power (AFP).
 * Structure mirrors the Swanson Industries proposal exactly.
 */
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import '@/app/(frontend)/proposals/[slug]/v2/report-v2.css'
import '@/app/(frontend)/partners/google-ads-proposal/aussie-fluid-power/afp.css'
import { DeckStage } from '@/components/v2/DeckStage'
import RocketScroll from '@/components/RocketScroll'
import { SlideSnap } from './SlideSnap'

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

export default function AussieFluidPowerProposal() {
  return (
    <div className={`proposal-v2 afp ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <DeckStage>
        <SlideSnap />
        <RocketScroll>

          {/* ── SLIDE 01 · COVER ─────────────────────────────────── */}
          <div className="afp-slot is-dark">
          <section className="slide dark cover" data-label="01 Cover">
            <div className="starfield" aria-hidden="true" />
            <div className="orbit-deco" style={{ width: 1400, height: 1400, right: -500, top: -400 }} />
            <div className="orbit-deco" style={{ width: 900, height: 900, right: -200, top: -100, borderColor: 'rgba(0,102,255,0.12)' }} />
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
                <span className="pill" style={{ color: 'var(--purple-soft)', borderColor: 'var(--purple)', fontSize: 26 }}>Google Ads Proposal</span>
                <span className="meta-tag" style={{ color: 'rgba(255,255,255,0.45)' }}>Aussie Fluid Power · Perth &amp; Melbourne</span>
                <span className="meta-tag" style={{ color: 'rgba(255,255,255,0.45)' }}>October 2026</span>
              </div>
              <div className="h1" style={{ fontSize: 121 }}>
                Search volume with higher commercial intent.<br /><em style={{ color: 'var(--purple-soft)' }}>Zero paid presence.</em>
              </div>
              <div className="deck-for" style={{ fontSize: 35 }}>
                Own high-intent hydraulic, process &amp; construction search Australia-wide, starting in Perth &amp; Melbourne. Lead measurement from day one.
              </div>
            </div>
            <div />
          </section>
          </div>

          {/* ── SLIDE 02 · SEARCH VOLUME ─────────────────────────── */}
          <div className="afp-slot">
          <section className="slide" data-label="02 Search Volume">
            <div className="brand-tag"><span className="dot"></span> 02 · Search Volume</div>
            <div className="slide-head">
              <div className="h-left">
                <div className="h-eyebrow">02 · Search Volume</div>
                <h1 className="h-title">Search volume &amp; opportunity</h1>
              </div>
              <div className="h-meta">Search volume · generic search only, no brand terms</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '0.7fr 1.5fr', gap: 48, alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="stat-tile" style={{ padding: '18px 26px', gap: 6 }}>
                  <div className="lbl" style={{ fontSize: 22 }}>Total addressable search volume</div>
                  <div className="val purple" style={{ fontSize: 56, lineHeight: 1 }}>~14,700</div>
                  <div className="desc" style={{ fontSize: 21 }}>Service, product &amp; specialist terms/mo · Australia</div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div className="stat-tile" style={{ padding: '14px 18px', gap: 6, flex: 1 }}>
                    <div className="lbl" style={{ fontSize: 18 }}>Perth + Melbourne search volume</div>
                    <div className="val purple" style={{ fontSize: 34, lineHeight: 1 }}>~4,800/mo</div>
                  </div>
                  <div className="stat-tile" style={{ padding: '14px 18px', gap: 6, flex: 1 }}>
                    <div className="lbl" style={{ fontSize: 18 }}>Avg. CPC</div>
                    <div className="val purple" style={{ fontSize: 34, lineHeight: 1 }}>$2-8</div>
                  </div>
                </div>
                <p className="body" style={{ fontSize: 22, maxWidth: 600, margin: 0, lineHeight: 1.35 }}>
                  <strong style={{ color: 'var(--ink)' }}>Proven in-account:</strong> sister brand Berendsen converts this exact market at <strong style={{ color: 'var(--ink)' }}>$55-90 per tracked enquiry</strong>, yet loses 25-53% of search impressions to budget.
                </p>
                <p className="body" style={{ fontSize: 22, maxWidth: 600, margin: 0, lineHeight: 1.35 }}>
                  <strong style={{ color: 'var(--ink)' }}>The opportunity:</strong> many of these generic search terms do not surface Aussie Fluid Power, so we are leaving a lot of potential leads on the table. Take Perth and Melbourne only: around 4,800 searches a month for leads AFP would not reach unless paid ads were used.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="eyebrow" style={{ color: 'var(--purple-deep)', marginBottom: 2 }}>Volume by category</div>
                {[
                  { cat: 'Hydraulic repair & service', sub: '"hydraulic repairs", "hydraulic hose repair near me", "hydraulic cylinder repair"', vol: '1,970', nat: '5,490', share: '37%', color: '#0066FF' },
                  { cat: 'Products & components', sub: '"hydraulic cylinders", "hydraulic pumps", "hydraulic fittings"', vol: '1,720', nat: '7,090', share: '48%', color: '#0052CC' },
                  { cat: 'Specialist, process & hydrogen', sub: '"hydrostatic testing", "chemical dosing systems", "hydrogen generation"', vol: '640', nat: '1,560', share: '11%', color: '#4d94ff' },
                  { cat: 'City-modified terms', sub: '"hydraulics perth", "hydraulic cylinder repair perth", "hydraulics melbourne"', vol: '460', nat: '550', share: '4%', color: '#228cc8' },
                ].map((row, i) => (
                  <div key={i} className="card" style={{ padding: '12px 22px', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div className="num-tag" style={{ fontSize: 24, color: 'var(--ink)' }}>{row.cat}</div>
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, color: 'var(--ink-mute)', marginTop: 2 }}>{row.sub}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, color: row.color, fontWeight: 600 }}>Perth+Melb: {row.vol}/mo</div>
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, color: '#6b7280', fontWeight: 600 }}>National: {row.nat}/mo</div>
                      </div>
                    </div>
                    <div style={{ height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
                      <div style={{ width: row.share, height: '100%', background: row.color, borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
                <div className="small" style={{ marginTop: 2 }}>
                  AFP runs zero Google Ads today. In the same auctions WesTrac and Pirtek run ~200 ads each, Motion ~99, ENZED ~47.
                </div>
              </div>
            </div>
            <div className="slide-foot" />
          </section>
          </div>

          {/* ── SLIDE 03 · KEYWORD LANDSCAPE ─────────────────────── */}
          <div className="afp-slot">
          <section className="slide" data-label="03 Keyword Landscape" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="brand-tag"><span className="dot"></span> 03 · Keyword Landscape</div>
            <div className="slide-head">
              <div className="h-left">
                <div className="h-eyebrow">03 · Keyword Landscape</div>
                <h1 className="h-title">Keyword landscape</h1>
              </div>
              <div className="h-meta">Google Keyword Planner estimates · AUD</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minHeight: 0 }}>
              <div className="eyebrow" style={{ color: 'var(--purple-deep)', marginBottom: 6 }}>
                TOP 20 KEYWORDS BY SEARCH VOLUME
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, flex: 1, minHeight: 0, gridAutoRows: 'minmax(0, 1fr)', overflow: 'hidden' }}>
                {[
                  { term: 'hydraulic hose repair near me', vol: '1,600', cpc: '$2-7', geo: 'National' },
                  { term: 'hydraulic hose repair', vol: '1,300', cpc: '$2-7', geo: 'Melbourne 880' },
                  { term: 'hydraulic cylinders', vol: '1,300', cpc: '$1-6', geo: 'National' },
                  { term: 'hydraulic pumps', vol: '1,300', cpc: '$1-5', geo: 'National' },
                  { term: 'hydraulic fittings', vol: '1,000', cpc: '$0.75-3.55', geo: 'National' },
                  { term: 'hydraulic power pack', vol: '720', cpc: '$0.90-3.65', geo: 'National' },
                  { term: 'hydraulic motors', vol: '720', cpc: '$0.80-3.30', geo: 'National' },
                  { term: 'hydraulic repair near me', vol: '590', cpc: '$2-6', geo: 'National' },
                  { term: 'hydraulic hose fittings', vol: '590', cpc: '$0.85-3.85', geo: 'National' },
                  { term: 'hydrostatic testing', vol: '480', cpc: '$0.90-11.60', geo: 'National' },
                  { term: 'hydraulic repairs', vol: '390', cpc: '$2.50-8.95', geo: 'National' },
                  { term: 'hydraulic cylinder repair', vol: '390', cpc: '$2-9.25', geo: 'National' },
                  { term: 'hydraulic components', vol: '320', cpc: '$2.20-6.75', geo: 'National' },
                  { term: 'hydraulic service', vol: '260', cpc: '$2.20-7.40', geo: 'National' },
                  { term: 'hydraulic valves', vol: '260', cpc: '$1-4.55', geo: 'National' },
                  { term: 'hydraulic ram repair', vol: '210', cpc: '$1.90-6.40', geo: 'National' },
                  { term: 'hydraulic pump repair', vol: '210', cpc: '$2.15-5.70', geo: 'National' },
                  { term: 'hydraulic shop', vol: '210', cpc: '$1.71-5.64', geo: 'National' },
                  { term: 'hydraulic power unit', vol: '210', cpc: '$1.28-5.59', geo: 'National' },
                  { term: 'hydrogen generation', vol: '210', cpc: '$0.89-6.76', geo: 'National' },
                ].map((kw, j) => (
                  <div key={j} className="card" style={{ padding: '8px 14px', gap: 2, overflow: 'hidden', display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                      <div className="h" style={{ fontSize: 20, lineHeight: 1.2 }}>{kw.term}</div>
                      <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, color: 'var(--ink-mute)' }}>{kw.geo}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, color: 'var(--ink-mute)' }}>{kw.vol}/mo</span>
                      <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, color: 'var(--gold)', fontWeight: 600 }}>Avg CPC {kw.cpc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="small" style={{ marginTop: 4 }}>
              CPC ranges are Keyword Planner top-of-page bid estimates. The sister account&apos;s <em>real</em> CPCs on these categories run $2-8 across ~23,500 clicks in 12 months. City + service terms like &quot;hydraulic repairs perth&quot; settle at $5-7. Volumes shown are non-brand, commercial-intent searches only.
            </p>
            <div className="slide-foot" />
          </section>
          </div>

          {/* ── SLIDE 04 · COMPETITORS ───────────────────────────── */}
          <div className="afp-slot">
          <section className="slide" data-label="04 Competitors" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="brand-tag"><span className="dot"></span> 04 · Competitors</div>
            <div className="slide-head">
              <div className="h-left">
                <div className="h-eyebrow">04 · Competitors</div>
                <h1 className="h-title">The competitors running ads get the traffic</h1>
              </div>
            </div>
            {(() => {
              const cols = '1fr 110px 150px 160px'
              const Head = ({ first }: { first: string }) => (
                <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                  <div className="lbl" style={{ fontSize: 14 }}>{first}</div>
                  <div className="lbl" style={{ fontSize: 14, textAlign: 'right' }}>Ads running</div>
                  <div className="lbl" style={{ fontSize: 14, textAlign: 'right' }}>Brand searches/mo</div>
                  <div className="lbl" style={{ fontSize: 14, textAlign: 'right' }}>Est. visits/mo</div>
                </div>
              )
              type Row = { name: string; scope: string; ads: string; brand: string; visits: string; you?: boolean }
              const Rows = ({ rows }: { rows: Row[] }) => (
                <>
                  {rows.map((r, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '9px 0', borderBottom: i < rows.length - 1 ? '1px solid var(--line)' : 'none', alignItems: 'center', background: r.you ? 'rgba(0,102,255,0.05)' : 'transparent', margin: r.you ? '0 -22px' : 0, paddingLeft: r.you ? 22 : 0, paddingRight: r.you ? 22 : 0 }}>
                      <div>
                        <div className="num-tag" style={{ fontSize: 21, color: r.you ? 'var(--purple-deep)' : 'var(--ink)' }}>{r.name}</div>
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, color: 'var(--ink-mute)' }}>{r.scope}</div>
                      </div>
                      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: r.ads === 'None' ? 17 : 21, fontWeight: r.ads === 'None' ? 400 : 600, color: r.ads === 'None' ? 'var(--ink-mute)' : '#b45309', textAlign: 'right' }}>{r.ads}</div>
                      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 19, color: 'var(--ink-2)', textAlign: 'right' }}>{r.brand}</div>
                      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 21, fontWeight: 600, color: 'var(--purple-deep)', textAlign: 'right' }}>{r.visits}</div>
                    </div>
                  ))}
                </>
              )
              const bidding: Row[] = [
                { name: 'WesTrac', scope: 'Cat dealer · WA & NSW', ads: 'Yes', brand: '6,600', visits: '26,000' },
                { name: 'Pirtek', scope: 'Hose & fittings franchise · national', ads: 'Yes', brand: '9,900', visits: '17,800' },
                { name: 'Motion Australia', scope: 'Industrial distributor · national', ads: 'Yes', brand: '1,600', visits: '15,700' },
                { name: 'ENZED', scope: 'Hose franchise · national', ads: 'Yes', brand: '3,600', visits: '8,000' },
                { name: 'AT Hydraulics', scope: 'Cylinder repair · Perth', ads: 'Yes', brand: '480', visits: '2,300' },
              ]
              const notBidding: Row[] = [
                { name: 'Aussie Fluid Power', scope: 'You · Perth & Melbourne', ads: 'None', brand: '590', visits: '490', you: true },
                { name: 'Pressure Dynamics', scope: 'Service & engineered builds · Perth', ads: 'None', brand: '480', visits: '530' },
                { name: 'Hydraulic Energy', scope: 'Similar scope · Perth', ads: 'None', brand: '260', visits: '280' },
                { name: 'HWC Hydraulics', scope: 'Similar scope · Perth', ads: 'None', brand: '140', visits: '60' },
                { name: 'Hytube', scope: 'Piping installation · Perth', ads: 'None', brand: '110', visits: '10' },
              ]
              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'start', flex: 1, minHeight: 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="eyebrow" style={{ color: 'var(--purple-deep)', marginBottom: 2 }}>Running Google Ads</div>
                    <div className="card" style={{ padding: '6px 22px 10px', gap: 0 }}>
                      <Head first="Advertiser" />
                      <Rows rows={bidding} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="eyebrow" style={{ color: 'var(--purple-deep)', marginBottom: 2 }}>Not running Google Ads</div>
                    <div className="card" style={{ padding: '6px 22px 10px', gap: 0 }}>
                      <Head first="Competitor" />
                      <Rows rows={notBidding} />
                    </div>
                    <div className="card" style={{ padding: '14px 22px', gap: 4, background: 'rgba(0,102,255,0.05)', border: '1px solid rgba(0,102,255,0.12)' }}>
                      <div className="eyebrow" style={{ color: 'var(--purple-deep)', fontSize: 15 }}>The gap</div>
                      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, color: 'var(--ink)', lineHeight: 1.4 }}>
                        AFP gets about 490 search visits a month. Every business running ads gets 2,300 to 26,000. Nobody in the specialist group clears 600. More traffic means more leads, and that gap is open because none of them are bidding.
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}
            <p className="small" style={{ marginTop: 8, fontSize: 16 }}>
              <strong style={{ color: 'var(--ink)' }}>How to read this:</strong> Brand searches/mo is how many times people Google the company name each month (Google Keyword Planner, Australia, 12-month average). Est. visits/mo is the estimated monthly traffic the website gets from Google search.
            </p>
            <div className="slide-foot" />
          </section>
          </div>

          {/* ── SLIDE 05 · GOOGLE ADS BUDGET ─────────────────────── */}
          <div className="afp-slot">
          <section className="slide" data-label="05 Google Ads Budget">
            <div className="brand-tag"><span className="dot"></span> 05 · Google Ads Budget</div>
            <div className="slide-head">
              <div className="h-left">
                <div className="h-eyebrow">05 · Google Ads Budget</div>
                <h1 className="h-title">Monthly Budget Recommendations</h1>
              </div>
              <div className="h-meta" style={{ whiteSpace: 'nowrap' }}>Search · Perth &amp; Melbourne → Australia-wide</div>
            </div>
            <p className="pull" style={{ fontSize: 24, lineHeight: 1.25, maxWidth: 1700, marginBottom: 14 }}>
              <strong style={{ color: 'var(--ink)' }}>The goal:</strong>{' '}win Perth &amp; Melbourne&apos;s high-intent hydraulic, process and engineering searches first, prove the cost per enquiry, then scale Australia-wide.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, marginBottom: 42 }}>
              {[
                {
                  phase: 'PHASE 01',
                  name: 'Perth + Melbourne Focus',
                  budget: '$3,000',
                  duration: 'Months 1-6 · from go-live',
                  goal: 'Establish AFP in its home markets: high-intent service, repair and product searches in Perth & Melbourne.',
                  targets: [
                    'Service & repair, high-intent terms · 55%',
                    'Products, specialist & process lines · 35%',
                    'Near-me & city-modified terms · 10%',
                    'Exact + phrase match, negatives sculpted weekly',
                    'Est. 20-25 tracked enquiries/mo · target CPA $120-150',
                  ],
                  color: '#0066FF',
                },
                {
                  phase: 'PHASE 02 · OPTIONAL',
                  name: 'Australia-Wide Scale',
                  budget: '$5,500',
                  duration: 'Optional · month 4 onwards',
                  goal: 'Optional: increase the budget only if Phase 1 is seeing really good performance and we want to open up. Then scale the proven structure across Australia: generic repair & service (5,490 searches/mo), product demand and specialist lines.',
                  targets: [
                    'All generic service & repair terms',
                    'Full product & component coverage',
                    'Specialist, process & hydrogen lines',
                    'Est. 42-55 tracked enquiries/mo · target CPA $100-130',
                    'Bid strategy moves to tCPA after 30+ conversions',
                  ],
                  color: '#0052CC',
                },
              ].map((tier, i) => (
                <div key={i} className="card" style={{ padding: '14px 22px', gap: 6, borderTop: `4px solid ${tier.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div className="num-tag" style={{ color: tier.color }}>{tier.phase}</div>
                      <div className="h" style={{ fontSize: 26, lineHeight: 1.2 }}>{tier.name}</div>
                      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 19, color: 'var(--ink-mute)', marginTop: 4 }}>{tier.duration}</div>
                    </div>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 36, fontWeight: 700, color: tier.color, lineHeight: 1, textAlign: 'right', flexShrink: 0 }}>{tier.budget}</div>
                  </div>
                  <div className="b" style={{ fontSize: 18, marginTop: 4 }}>{tier.goal}</div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {tier.targets.map((kw, j) => (
                      <li key={j} style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, color: 'var(--ink-2)', lineHeight: 1.3 }}>{kw}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {/* Budget Ceiling Analysis */}
            <div style={{ marginTop: 8 }}>
              <div className="eyebrow" style={{ color: 'var(--purple-deep)', marginBottom: 6 }}>
                Budget Ceiling Analysis
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16 }}>
                {/* Left: segment ceilings */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { label: 'Hydraulic service & repair', vol: '5,490/mo · CPC ~$4.40', ceiling: '$24,200', color: '#0066FF', share: '46%' },
                    { label: 'Products & components', vol: '7,090/mo · CPC ~$2.80', ceiling: '$19,800', color: '#0052CC', share: '38%' },
                    { label: 'Specialist, process & hydrogen', vol: '1,560/mo · CPC ~$3.50', ceiling: '$5,500', color: '#4d94ff', share: '10%' },
                    { label: 'City-modified terms', vol: '550/mo · CPC ~$5.00', ceiling: '$2,750', color: '#228cc8', share: '5%' },
                  ].map((row, i) => (
                    <div key={i} className="card" style={{ padding: '8px 18px', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
                          {row.label} <span style={{ fontWeight: 400, color: 'var(--ink-mute)' }}>· {row.vol}</span>
                        </div>
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 19, fontWeight: 700, color: row.color, flexShrink: 0 }}>{row.ceiling}</div>
                      </div>
                      <div style={{ height: 4, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: row.share, height: '100%', background: row.color, borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
                </div>
                {/* Right: ceiling summary secondary note */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: 8 }}>
                  <div className="card" style={{ padding: '12px 20px', gap: 4, textAlign: 'center' }}>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, color: 'var(--ink-mute)' }}>Monthly budget · Phase 01</div>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 30, fontWeight: 700, color: '#0066FF', lineHeight: 1 }}>$3,000</div>
                  </div>
                  <div className="card" style={{ padding: '12px 20px', gap: 4, textAlign: 'center', background: 'rgba(0,102,255,0.04)', border: '1px solid rgba(0,102,255,0.1)' }}>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, color: 'var(--ink-mute)' }}>Potential to spend: full keyword capture</div>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700, color: '#0052CC', lineHeight: 1 }}>~$52,000/mo</div>
                  </div>
                  <div className="card" style={{ padding: '12px 20px', gap: 4, textAlign: 'center' }}>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, color: 'var(--ink-mute)' }}>Sister-account benchmark · cost per tracked enquiry</div>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700, color: '#228cc8', lineHeight: 1 }}>$55-90</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="slide-foot" />
          </section>
          </div>

          {/* ── SLIDE 06 · RECOMMENDATION ──────────────────────── */}
          <div className="afp-slot">
          <section className="slide" data-label="06 Recommendation">
            <div className="brand-tag"><span className="dot"></span> 06 · Recommendation</div>
            <div className="slide-head">
              <div className="h-left">
                <div className="h-eyebrow">06 · Recommendation</div>
                <h1 className="h-title">Own the home market first</h1>
              </div>
              <div className="h-meta">Perth + Melbourne first · then Australia-wide</div>
            </div>
            <div className="card" style={{ padding: '22px 28px', gap: 10, background: 'rgba(0,102,255,0.05)', border: '1px solid rgba(0,102,255,0.12)', marginBottom: 20 }}>
              <div className="eyebrow" style={{ color: 'var(--purple-deep)' }}>Group overlap</div>
              <div className="b" style={{ fontSize: 27, lineHeight: 1.35 }}>
                AFP shares service categories with Berendsen and Custom Fluid Power, and the sister accounts already bid on very close terms. Managing this between states, and excluding them so they don&apos;t compete with each other and don&apos;t drive bids up, is a really important aspect to consider.
              </div>
              <div className="small" style={{ marginTop: 0 }}>
                Campaigns launch with cross-account negative keyword lists and per-entity brand terms so the group never bids against itself; a group-level paid search strategy is the natural follow-up session.
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, marginBottom: 16 }}>
              {[
                {
                  step: 'STEP 01',
                  name: 'Perth + Melbourne first',
                  goal: 'Really own this market before extending. Around 4,800 non-brand searches a month sit in Perth and Melbourne, and focused local campaigns can make AFP the default call.',
                  targets: [
                    'Dedicated Perth + Melbourne campaigns and landing pages',
                    'Own the high-intent service, repair and product terms locally',
                    'Prove cost per enquiry before expanding further',
                  ],
                  color: '#0066FF',
                },
                {
                  step: 'STEP 02',
                  name: 'Then extend Australia-wide',
                  goal: 'Scale the proven structure and economics to the rest of Australia, in step with the wider group.',
                  targets: [
                    'Same structure, same economics, more geography',
                    'Conscious of Berendsen and Custom Fluid Power bidding on very close terms',
                    'State-based exclusions so group brands never bid against each other',
                  ],
                  color: '#0052CC',
                },
              ].map((tier, i) => (
                <div key={i} className="card" style={{ padding: '18px 22px', gap: 8, borderTop: `4px solid ${tier.color}` }}>
                  <div className="num-tag" style={{ color: tier.color }}>{tier.step}</div>
                  <div className="h" style={{ fontSize: 26, lineHeight: 1.2 }}>{tier.name}</div>
                  <div className="b" style={{ fontSize: 18, marginTop: 4 }}>{tier.goal}</div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {tier.targets.map((kw, j) => (
                      <li key={j} style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, color: 'var(--ink-2)', lineHeight: 1.3 }}>{kw}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="card" style={{ padding: '16px 20px' }}>
              <div className="b" style={{ fontSize: 19, lineHeight: 1.4 }}>
                <strong style={{ color: 'var(--ink)' }}>The goal:</strong>{' '}each one owns its budget and doesn&apos;t compete with the others, while still maximizing its market space.
              </div>
            </div>
            <div className="slide-foot" />
          </section>
          </div>

          {/* ── SLIDE 07 · FLIGHT PLAN ───────────────────────────── */}
          <div className="afp-slot">
          <section className="slide" data-label="07 Flight Plan">
            <div className="brand-tag"><span className="dot"></span> 07 · Flight Plan</div>
            <div className="slide-head">
              <div className="h-left">
                <div className="h-eyebrow">07 · Flight Plan</div>
                <h1 className="h-title">Roadmap</h1>
              </div>
              <div className="h-meta">TBC</div>
            </div>
            <div className="roadmap" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              {[
                { week: 'WEEK 01', step: 'Agreement + Onboard', body: 'Agreement signed. New AFP Google Ads account created under our management. WordPress + analytics access granted. Kick-off with Questas.' },
                { week: 'WEEK 02', step: 'Tracking First', body: 'Leads currently land untracked in the sales inbox, so measurement comes first: call tracking, form & email-click tracking, GA4 key events, Google Ads conversion actions.' },
                { week: 'WEEK 03', step: 'Strategy + Sign-off', body: 'Campaign structure, keyword set aligned to your search tracker, negative keyword lists, and brand guardrails agreed with Berendsen & Custom Fluid Power to prevent group overlap.' },
                { week: 'WEEK 04', step: 'Build + Go Live', body: 'Service, product & specialist campaigns go live in Perth + Melbourne. Budget: $3,000/month. Landing pages checked with CRO audit.' },
                { week: 'WEEK 05+', step: 'Optimise + Review', body: 'Optimise the campaign to a point where we can consider increasing the budget from month four onwards. Search-term sculpting against your tracker, tCPA after 30+ conversions, HubSpot offline conversion import the moment the migration lands.' },
              ].map((cell, i) => (
                <div key={i} className="road-cell">
                  <div className="week">{cell.week}</div>
                  <div className="step">{cell.step}</div>
                  <div className="desc">{cell.body}</div>
                </div>
              ))}
            </div>
            <p className="small" style={{ marginTop: 48 }}>
              <strong style={{ color: 'var(--ink)' }}>Measurement:</strong> until the HubSpot migration (3rd on the roadmap), leads are quantified through tracked calls, form submissions and email enquiries. Then HubSpot qualified/closed status is imported back into Google Ads as offline conversions, so bidding optimises to real jobs won, not just clicks.
            </p>
            <div className="slide-foot" />
          </section>
          </div>

        </RocketScroll>
      </DeckStage>
    </div>
  )
}
