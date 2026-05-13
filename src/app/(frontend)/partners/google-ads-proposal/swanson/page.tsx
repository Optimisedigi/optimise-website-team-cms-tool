/**
 * /partners/google-ads-proposal/swanson
 * Standalone Google Ads Proposal for Swanson Industries Australia.
 */
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import '@/app/(frontend)/proposals/[slug]/v2/report-v2.css'
import '@/app/(frontend)/proposals/swanson-industries-v2/swanson.css'
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

export default function SwansonProposal() {
  return (
    <div className={`proposal-v2 ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <DeckStage>
        <RocketScroll>
          {/* SLIDE 01 - COVER */}
        <section className="slide dark cover" data-label="01 Cover">
          <div className="starfield" aria-hidden="true" />
          <div className="orbit-deco" style={{ width: 1400, height: 1400, right: -500, top: -400 }} />
          <div className="orbit-deco" style={{ width: 900, height: 900, right: -200, top: -100, borderColor: 'rgba(77,148,255,0.1)' }} />
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
              <span className="pill" style={{ color: '#0084ff', borderColor: '#0084ff', fontSize: 26 }}>Google Ads Proposal</span>
              <span className="meta-tag" style={{ color: 'rgba(255,255,255,0.45)' }}>Laser Cladding · NSW + QLD · v1.0</span>
              <span className="meta-tag" style={{ color: 'rgba(255,255,255,0.45)' }}>May 2026</span>
            </div>
            <div className="h1" style={{ fontSize: 121 }}>
              Dominating laser<br />cladding for<br /><em style={{ color: '#0084ff' }}>Swanson Industries.</em>
            </div>
            <div className="deck-for" style={{ fontSize: 35 }}>
              100% impression share strategy. First-mover advantage.<br />Dominate the keyword before competitors catch on.
            </div>
          </div>
          <div />
        </section>

        {/* SLIDE 02 - SEARCH VOLUME SUMMARY */}
        <section className="slide" data-label="02 Search Volume">
          <div className="brand-tag"><span className="dot"></span> 02 · Search Volume</div>
          <div className="slide-head">
            <div className="h-left">
              <div className="h-eyebrow">02 · Search Volume</div>
              <h1 className="h-title">Search volume &amp; opportunity</h1>
            </div>
            <div className="h-meta">Total addressable market · NSW + QLD</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '0.7fr 1.5fr', gap: 48, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="stat-tile" style={{ padding: '24px 28px', gap: 10 }}>
                <div className="lbl" style={{ fontSize: 24 }}>NSW & QLD search volume</div>
                <div className="val purple" style={{ fontSize: 64, lineHeight: 1 }}>~1,600</div>
                <div className="desc" style={{ fontSize: 24 }}>National: ~2,950/mo</div>
              </div>
              <div className="stat-tile" style={{ padding: '24px 28px', gap: 10 }}>
                <div className="lbl" style={{ fontSize: 22 }}>Avg. CPC</div>
                <div className="val purple" style={{ fontSize: 48, lineHeight: 1 }}>$18-40</div>
              </div>
              <p className="body" style={{ fontSize: 27, maxWidth: 600, margin: 0, lineHeight: 1.45 }}>
                <strong style={{ color: 'var(--ink)' }}>Good news:</strong> No competitor runs Google Ads for laser cladding. The keyword is wide open. Swanson can own 100% impression share on every term from day one.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="eyebrow" style={{ color: 'var(--purple-deep)', marginBottom: 6 }}>Volume by category</div>
              {[
                { cat: 'Core laser cladding terms', sub: '"laser cladding", "laser cladding service"', vol: '90-245', nat: '~2,000', share: '62%', color: '#0084ff' },
                { cat: 'Regional searches', sub: 'Sydney, Brisbane, Newcastle, QLD', vol: '40-95', nat: '~450', share: '25%', color: '#4d94ff' },
                { cat: 'Application terms', sub: '"hydraulic cylinder laser cladding", "chrome replacement laser", "component repair laser coating"', vol: '40-90', nat: '~500', share: '13%', color: '#4d94ff' },
              ].map((row, i) => (
                <div key={i} className="card" style={{ padding: '18px 24px', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div className="num-tag" style={{ fontSize: 26, color: 'var(--ink)' }}>{row.cat}</div>
                      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, color: 'var(--ink-mute)', marginTop: 4 }}>{row.sub}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 24, flexShrink: 0 }}>
                      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, color: row.color, fontWeight: 600 }}>NSW+QLD: {row.vol}/mo</div>
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

        {/* SLIDE 03 - KEYWORD LANDSCAPE */}
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
                { term: 'laser cladding', vol: '40-80', cpc: '$18-32', geo: 'NSW + QLD', intent: 'High' },
                { term: 'laser cladding Australia', vol: '20-50', cpc: '$22-38', geo: 'National', intent: 'High' },
                { term: 'laser cladding Sydney', vol: '10-30', cpc: '$20-35', geo: 'Sydney', intent: 'High' },
                { term: 'laser cladding Brisbane', vol: '10-20', cpc: '$18-30', geo: 'Brisbane', intent: 'High' },
                { term: 'laser metal cladding', vol: '10-30', cpc: '$20-35', geo: 'NSW + QLD', intent: 'High' },
                { term: 'laser cladding service', vol: '10-30', cpc: '$18-30', geo: 'NSW + QLD', intent: 'High' },
                { term: 'industrial laser cladding', vol: '10-25', cpc: '$25-40', geo: 'National', intent: 'High' },
                { term: 'laser coating service', vol: '10-30', cpc: '$15-28', geo: 'NSW + QLD', intent: 'Medium' },
                { term: 'laser cladding Queensland', vol: '10-25', cpc: '$18-30', geo: 'Queensland', intent: 'High' },
                { term: 'laser cladding Newcastle', vol: '10-20', cpc: '$15-25', geo: 'Newcastle', intent: 'High' },
                { term: 'hydraulic cylinder laser cladding', vol: '10-30', cpc: '$22-38', geo: 'NSW + QLD', intent: 'Very High' },
                { term: 'chrome replacement laser', vol: '10-20', cpc: '$18-32', geo: 'NSW + QLD', intent: 'High' },
                { term: 'shaft laser cladding', vol: '10-20', cpc: '$20-35', geo: 'NSW + QLD', intent: 'High' },
                { term: 'laser cladding Hunter Valley', vol: '10-20', cpc: '$12-22', geo: 'Hunter Valley', intent: 'Medium' },
                { term: 'component repair laser coating', vol: '10-20', cpc: '$18-28', geo: 'NSW + QLD', intent: 'High' },
                { term: 'laser cladding Wollongong', vol: '10-20', cpc: '$12-20', geo: 'Wollongong', intent: 'Medium' },
                { term: 'laser cladding Central Coast', vol: '10-20', cpc: '$12-20', geo: 'Central Coast', intent: 'Medium' },
                { term: 'laser cladding Melbourne', vol: '10-20', cpc: '$18-30', geo: 'Melbourne', intent: 'High' },
                { term: 'laser cladding Perth', vol: '10-20', cpc: '$18-30', geo: 'Perth', intent: 'High' },
                { term: 'laser cladding Adelaide', vol: '10-20', cpc: '$15-25', geo: 'Adelaide', intent: 'High' },
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
          <p className="small" style={{ marginTop: 16 }}>These are the top 20 keywords by search volume - a snapshot of a much larger keyword universe. Many more regional, application, and industry-specific terms also generate enquiries. Full keyword list available on request.</p>
          <div className="slide-foot" />
        </section>

        {/* SLIDE 04 - GOOGLE ADS BUDGET */}
        <section className="slide" data-label="04 Google Ads Budget">
          <div className="brand-tag"><span className="dot"></span> 04 · Google Ads Budget</div>
          <div className="slide-head">
            <div className="h-left">
              <div className="h-eyebrow">04 · Google Ads Budget</div>
              <h1 className="h-title">Monthly Budget Recommendations</h1>
            </div>
            <div className="h-meta">NSW + Queensland · Exact match</div>
          </div>
          <p className="pull" style={{ fontSize: 28, lineHeight: 1.25, maxWidth: 1700, marginBottom: 24 }}>
            <strong style={{ color: 'var(--ink)' }}>The goal:</strong> Own laser cladding in NSW + QLD. Zero competition. Scale from core terms to full coverage as the pilot validates.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 24 }}>
            {[
              { phase: 'PHASE 01', name: 'Validation', budget: '$2,500-3,500', period: '/ month', duration: 'Weeks 1-6', goal: 'Target 60-80% impression share on core keywords. Confirm CPA < $300. Validate click quality and enquiry conversion before scaling spend.', targets: ['"laser cladding" (40-80)', '"hydraulic cylinder laser cladding" (10-30)', '"laser cladding Sydney" (10-30)', '"laser cladding Brisbane" (10-20)', '"laser cladding Newcastle" (10-20)'], color: '#f0b35a' },
              { phase: 'PHASE 02', name: 'Dominance', budget: '$5,000-7,500', period: '/ month', duration: 'Weeks 5-12', goal: '100% impression share on core keywords. Add application keywords (chrome replacement, shaft cladding). Scale confirmed performers. Expand to all regional terms.', targets: ['+ "laser metal cladding" (10-30)', '+ "chrome replacement laser" (10-20)', '+ "laser coating service" (10-30)', '+ "component repair laser coating" (10-20)', '+ "laser cladding Queensland" (10-25)'], color: '#4d94ff' },
              { phase: 'PHASE 03', name: 'Extended Reach', budget: '$8,000-12,000', period: '/ month', duration: 'TBC', goal: 'Targeting opens to nation-wide coverage. Scope to include Victoria, South Australia, Western Australia and New Zealand if enquiry volume from NSW + QLD confirms strong unit economics.', targets: ['"industrial laser cladding" (10-25)', '"bearing journal laser repair" (10-20)', '"hydraulic rod laser cladding" (10-20)', 'Nation-wide coverage if unit economics confirmed', 'Remarketing + Display brand awareness'], color: '#22c55e' },
            ].map((tier, i) => (
              <div key={i} className="card" style={{ padding: '24px 28px', gap: 10, borderTop: `4px solid ${tier.color}` }}>
                <div className="num-tag" style={{ color: tier.color }}>{tier.phase}</div>
                <div className="h" style={{ fontSize: 28, lineHeight: 1.2 }}>{tier.name}</div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 36, fontWeight: 700, color: tier.color, lineHeight: 1 }}>{tier.budget}</div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, color: 'var(--ink-mute)' }}>{tier.period} · {tier.duration}</div>
                <div className="b" style={{ fontSize: 21, marginTop: 6 }}>{tier.goal}</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {tier.targets.map((kw, j) => (
                    <li key={j} style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 19, color: 'var(--ink-2)', lineHeight: 1.3 }}>{kw}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="small" style={{ marginTop: 16, color: 'var(--ink-mute)', fontStyle: 'italic', fontSize: 18 }}>
            Estimates based on Keyword Planner search volumes. Actual performance will vary. Phase 03 timing depends on Phase 01 + 02 results.
          </p>
          <div className="slide-foot" />
        </section>

        {/* SLIDE 05 - FLIGHT PLAN */}
        <section className="slide" data-label="05 Flight Plan">
          <div className="brand-tag"><span className="dot"></span> 05 · Flight Plan</div>
          <div className="slide-head">
            <div className="h-left">
              <div className="h-eyebrow">05 · Flight Plan</div>
              <h1 className="h-title">Roadmap</h1>
            </div>
            <div className="h-meta">Ideal go live: 8 June 2026</div>
          </div>
          <div className="roadmap" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            {[
              { week: 'WEEK 01', step: 'Create Account + Onboard', body: 'Optimise Digital sends agreement. Client signs and grants Google Ads account access. Onboard client: collect site credentials, map existing sales process, identify top-of-funnel enquiry goals and target job types.' },
              { week: 'WEEK 02', step: 'CRO Audit + Access Setup', body: 'Full site access granted. CRO audit of laser cladding landing page with initial recommendations. Setup GA4 account and configure Google Ads conversion tracking. Set up site-wide analytics and event tracking.' },
              { week: 'WEEK 03', step: 'Proposal + Strategy', body: 'Present full campaign proposal, ad group structure, and keyword strategy for client sign-off. Refine targeting and negative keyword list. Confirm Phase 02 scale plan based on first-week performance data.' },
              { week: 'WEEK 04', step: 'Campaign Build + Go Live', body: 'Aiming to go live 8 June 2026. Build 5 ad groups: core, regional, application, industry, and hard chrome replacement. Write 3 ad copy variants per ad group. Configure location bid adjustments. Launch pilot at $2,500-3,500/month.' },
              { week: 'WEEK 05+', step: 'Optimise + Scale', body: 'Optimise landing pages, ad copy, and keyword targeting based on first 4 weeks of data. Scale spend to $5,000-7,500/month if CPA < $300. Target 100% impression share on core keywords.' },
            ].map((cell, i) => (
              <div key={i} className="road-cell">
                <div className="week">{cell.week}</div>
                <div className="step">{cell.step}</div>
                <div className="desc">{cell.body}</div>
              </div>
            ))}
          </div>
          <p className="small" style={{ marginTop: 48 }}>
            The landing page phase is the foundation. A poorly converting page means wasted ad spend - the fix pays for itself in one additional laser cladding job per month.
          </p>
          <div className="slide-foot" />
        </section>
      </RocketScroll>
    </DeckStage>
  </div>
  )
}
