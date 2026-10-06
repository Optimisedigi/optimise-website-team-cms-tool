import { Children, isValidElement, type ReactNode } from 'react'
import '../google-ads-audit/away-digital.css'
import AuditPasswordGate from '@/components/AuditPasswordGate'
import { AWAY_DIGITAL_SLUG } from '@/lib/away-digital'
import DeckScrollEffects from '../google-ads-audit/DeckScrollEffects'
import Starfield from '../google-ads-audit/Starfield'
import DownloadPdfButton from './DownloadPdfButton'
import {
  CLIENTS_WON,
  CLIENTS_WON_BRAND_NOTE,
  LEAD_GRADES,
  LEAD_INSIGHTS,
  LEADS_BY_MONTH,
  LEAD_GROUPS,
  LANDING_PAGES_TOTAL,
  LANDING_PAGE_PREVIEWS,
} from './data'
import type { Lead, LeadGradeKey } from './data'

const GRADE_TONE: Record<LeadGradeKey, { pill: string; bar: string }> = {
  strong: { pill: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-500' },
  lowbiz: { pill: 'bg-violet-100 text-violet-800', bar: 'bg-violet-500' },
  mixed: { pill: 'bg-amber-100 text-amber-800', bar: 'bg-amber-500' },
  weak: { pill: 'bg-rose-100 text-rose-800', bar: 'bg-rose-500' },
  poorlite: { pill: 'bg-rose-50 text-rose-600', bar: 'bg-rose-300' },
  neutral: { pill: 'bg-slate-100 text-slate-600', bar: 'bg-slate-400' },
}

function gradeCount(label: string): number {
  return parseInt(label, 10) || 0
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-blue-500 font-semibold text-sm uppercase tracking-widest mb-2">{children}</p>
}

function SlideTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-[30px] md:text-[42px] font-bold tracking-tight text-slate-950 mb-3">{children}</h2>
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="text-sm md:text-base text-slate-600 leading-relaxed max-w-4xl mb-6">{children}</p>
}

function Section({
  id,
  label,
  number,
  children,
}: {
  id: string
  label: string
  number: string
  children: ReactNode
}) {
  const slideContent = Children.toArray(children)
  const header: ReactNode[] = []
  let bodyStart = 0

  for (const child of slideContent) {
    if (isValidElement(child) && (child.type === Eyebrow || child.type === SlideTitle || child.type === Lead)) {
      header.push(child)
      bodyStart += 1
      continue
    }
    break
  }

  const body = slideContent.slice(bodyStart)

  return (
    <section id={id} data-label={label} className="relative min-h-screen flex flex-col bg-white">
      <div className="flex-1 flex flex-col justify-center px-6 py-10 max-w-6xl mx-auto w-full">
        <div className="mb-6">{header}</div>
        <div>{body}</div>
      </div>
      <div
        className="absolute bottom-3 right-[56px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
        aria-hidden="true"
      >
        {number}
      </div>
    </section>
  )
}

function LeadTable({ leads }: { leads: readonly Lead[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 text-left uppercase tracking-wider text-slate-500">
            <th className="px-2 py-1.5">Date</th>
            <th className="px-2 py-1.5">Person</th>
            <th className="px-2 py-1.5">Search keyword</th>
            <th className="px-2 py-1.5">What they asked</th>
            <th className="px-2 py-1.5">Quality</th>
            <th className="px-2 py-1.5">Meeting</th>
            <th className="px-2 py-1.5">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l, i) => (
            <tr key={`${l.name}-${i}`} className="border-t border-slate-100 align-top">
              <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">{l.date}</td>
              <td className="px-2 py-1.5">
                <div className="font-semibold text-slate-800">{l.name}</div>
                {l.company ? <div className="text-slate-500">{l.company}</div> : null}
              </td>
              <td className="px-2 py-1.5 text-slate-600">{l.keyword}</td>
              <td className="px-2 py-1.5 text-slate-600 max-w-[260px]">{l.asked}</td>
              <td className="px-2 py-1.5">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${GRADE_TONE[l.gradeKey].pill}`}
                  title={l.grade}
                >
                  {l.grade}
                </span>
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">{l.meeting}</td>
              <td className="px-2 py-1.5 text-slate-600">{l.outcome}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function AwayDigitalHubspotAnalysisPage() {
  const gradeTotal = LEAD_GRADES.reduce((sum, g) => sum + gradeCount(g.count), 0)

  return (
    <AuditPasswordGate
      // `<clientSlug>/<deckSlug>`, resolved against the client record by
      // /api/audit-auth — so it tracks the client slug (away-digital-teams),
      // not this URL path. This deck has its own presentation entry so it is
      // tracked and linked separately from the Google Ads audit deck.
      auditSlug={`${AWAY_DIGITAL_SLUG}/google-ads-hubspot-3m-analysis`}
      businessName="Away Digital Teams"
      featureLabel="Google Ads + HubSpot 3-Month Analysis"
    >
      <div className="fixed top-0 left-0 right-0 h-1 bg-slate-200 z-50">
        <div id="progress-bar" className="h-full bg-blue-600 transition-all" style={{ width: '0%' }} />
      </div>

      {/* Deck is column-reverse: the cover sits at the bottom of the document
          and DeckScrollEffects scrolls to it on load. "Next slide" moves upward.
          Content slides are appended AFTER the cover, in reading order. */}
      <main className="flex flex-col-reverse">
        <section id="cover" data-label="Cover" className="cover-v2 relative min-h-screen flex flex-col">
          <Starfield id="cover-starfield" />
          <div className="orbit-deco" style={{ width: '1100px', height: '1100px', right: '-380px', top: '-300px' }} />
          <div
            className="orbit-deco"
            style={{ width: '720px', height: '720px', right: '-160px', top: '-80px', borderColor: 'rgba(77,148,255,0.1)' }}
          />
          <div className="relative z-10 px-8 md:px-12 pt-10 w-full flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="cover-dot" aria-hidden="true" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/optimise-digital-logo-white.webp" alt="Optimise Digital" className="w-auto h-[22.8px] md:h-[30.4px]" />
            </div>
            <DownloadPdfButton />
          </div>
          <div className="relative z-10 flex-1 flex flex-col justify-center px-8 md:px-12 pb-12 w-full -mt-[20px]">
            <div className="flex flex-col items-start gap-5 text-left max-w-4xl">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="cover-pill">Google Ads + HubSpot Analysis</span>
                <span className="cover-meta">Paid-search leads &amp; clients</span>
              </div>
              <h1 className="cover-h1 text-4xl md:text-6xl">Away Digital Teams</h1>
            </div>
          </div>
        </section>

        <Section id="clients-won" label="Clients won" number="2 / 5">
          <Eyebrow>Clients won</Eyebrow>
          <SlideTitle>Paid search is winning clients faster — and for less.</SlideTitle>
          <Lead>
            13 new clients from paid search in 15 months. Since June they cost 59% less and arrive 39% sooner.
          </Lead>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CLIENTS_WON.map((row, i) => (
              <div
                key={row.label}
                className={`rounded-3xl border p-6 ${
                  i === 1 ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="text-xs font-black uppercase tracking-widest text-slate-500">{row.label}</div>
                <div className="mt-4 grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">Clients</div>
                    <div className="text-2xl font-black text-slate-950">{row.clients}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">Spend / client</div>
                    <div className="text-2xl font-black text-slate-950">{row.spend}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">New client every</div>
                    <div className="text-2xl font-black text-slate-950">{row.cadence}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-600">{CLIENTS_WON_BRAND_NOTE}</p>
          <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">
              Show the clients and how this is measured
            </summary>
            <div className="mt-4 space-y-3">
              {CLIENTS_WON.map((row) => (
                <div key={row.label}>
                  <div className="text-xs font-black uppercase tracking-widest text-slate-500">{row.label}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-700">
                    {row.names.map((n) => (
                      <span key={n} className="rounded-full bg-slate-100 px-2.5 py-1">
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-xs text-slate-500">
                Spend per client is Google Ads spend in the period divided by its clients. Past clients took a median
                of 87 days from first enquiry to sign, so the most recent figures are likely to improve.
              </p>
            </div>
          </details>
        </Section>

        <Section id="hubspot-leads" label="HubSpot leads" number="3 / 5">
          <Eyebrow>Paid-search leads in HubSpot</Eyebrow>
          <SlideTitle>Most enquiries aren&apos;t a fit — but the good ones are real businesses.</SlideTitle>
          <Lead>
            Every HubSpot contact that first arrived through paid search, graded on what they asked for. {gradeTotal}{' '}
            enquiries graded across 15 months.
          </Lead>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/70">
            <div className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">
              Lead quality breakdown
            </div>
            <div className="flex h-16 overflow-hidden rounded-2xl bg-slate-100 shadow-inner">
              {LEAD_GRADES.map((g) => {
                const n = gradeCount(g.count)
                return (
                  <div
                    key={g.key}
                    className={`${GRADE_TONE[g.key].bar} flex items-center justify-center text-[11px] font-bold text-white`}
                    style={{ width: `${(n / gradeTotal) * 100}%` }}
                    title={`${g.label}: ${g.count}`}
                  >
                    {n}
                  </div>
                )
              })}
            </div>
            <div className="mt-4 space-y-2.5">
              {LEAD_GRADES.map((g) => (
                <div key={g.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span
                    className={`inline-block shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${GRADE_TONE[g.key].pill}`}
                  >
                    {g.label}
                  </span>
                  <span className="text-sm font-bold text-slate-800">{g.count}</span>
                  <span className="text-sm text-slate-600">{g.desc}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">What the leads tell us</h3>
            <ul className="space-y-2.5">
              {LEAD_INSIGHTS.map((it) => (
                <li key={it.bold} className="flex gap-2.5 text-sm leading-snug text-slate-600">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                  <span>
                    <strong className="text-slate-800">{it.bold}</strong> {it.rest}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section id="leads-by-month" label="Leads by month" number="4 / 5">
          <Eyebrow>Every paid-search lead, by month</Eyebrow>
          <SlideTitle>Every lead, month by month.</SlideTitle>
          <Lead>
            The monthly trend is below. Expand to open every enquiry, month by month — including the leads that were
            brand searches or arrived another way.
          </Lead>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-left uppercase tracking-wider text-slate-500">
                  <th className="px-2 py-2">Month</th>
                  <th className="px-2 py-2 text-right">Leads</th>
                  <th className="px-2 py-2 text-right">Quality</th>
                  <th className="px-2 py-2 text-right">Real biz</th>
                  <th className="px-2 py-2 text-right">One-off</th>
                  <th className="px-2 py-2 text-right">Wrong</th>
                  <th className="px-2 py-2 text-right">Personal</th>
                  <th className="px-2 py-2 text-right">Spend</th>
                  <th className="px-2 py-2 text-right">Cost / lead</th>
                  <th className="px-2 py-2 text-right">Cost / quality</th>
                  <th className="px-2 py-2 text-right">Clients</th>
                  <th className="px-2 py-2 text-right">Client rate</th>
                </tr>
              </thead>
              <tbody>
                {LEADS_BY_MONTH.map((m) => (
                  <tr key={m.label} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 whitespace-nowrap font-semibold text-slate-800">{m.label}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{m.total}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700">{m.quality}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-violet-700">{m.lowbiz}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-amber-700">{m.oneoff}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-rose-700">{m.wrong}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-rose-500">{m.personal}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{m.spend}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{m.costTotal}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{m.costQuality}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-950">{m.clients}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{m.clientRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">
              Show every lead ({LEAD_GROUPS.reduce((sum, g) => sum + g.leads.length, 0)}) — month by month
            </summary>
            <div className="mt-4 space-y-3">
              {LEAD_GROUPS.map((group) => (
                <details key={group.label} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                    {group.label}{' '}
                    <span className="font-normal text-slate-500">— {group.summary}</span>
                  </summary>
                  <div className="mt-3">
                    <LeadTable leads={group.leads} />
                  </div>
                </details>
              ))}
            </div>
          </details>
        </Section>
        <Section id="landing-pages" label="Landing pages" number="5 / 5">
          <Eyebrow>hire.awaydigitalteams.com</Eyebrow>
          <SlideTitle>Landing pages created.</SlideTitle>
          <Lead>
            One page per role and service on the hire subdomain — each built to match its ad group and
            turn the click into a lead.
          </Lead>
          <div className="flex items-center gap-5 rounded-3xl border border-slate-200 bg-white p-6">
            <div className="text-6xl font-black tabular-nums text-slate-950">{LANDING_PAGES_TOTAL}</div>
            <div>
              <div className="text-sm font-semibold text-slate-800">targeted landing pages</div>
              <div className="text-xs text-slate-500">live on hire.awaydigitalteams.com</div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {LANDING_PAGE_PREVIEWS.map((p) => (
              <div key={p.slug} className="flex flex-col items-center gap-2">
                <div className="w-full max-w-[210px] rounded-[26px] border-[6px] border-slate-900 bg-slate-900 shadow-xl">
                  <div className="h-[420px] overflow-hidden rounded-[18px] bg-white">
                    <iframe
                      src={p.url}
                      title={p.title}
                      sandbox="allow-scripts allow-forms"
                      loading="lazy"
                      className="h-full w-full border-0"
                    />
                  </div>
                </div>
                <div className="text-center text-xs font-semibold text-slate-800">{p.label}</div>
              </div>
            ))}
          </div>
        </Section>
      </main>

      <div
        id="rocket-fixed"
        className="rocket-fixed"
        role="button"
        tabIndex={0}
        aria-label="Go to next slide"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/optimise-digital-rocket.png"
          alt=""
          width={48}
          height={82}
          className="rocket-img"
        />
        <div className="rocket-flame" aria-hidden="true" />
      </div>
      <div className="flame-trail" aria-hidden="true" />
      <button
        type="button"
        id="flame-trail-hit"
        className="flame-trail-hit"
        aria-label="Go to next slide"
      />
      <button type="button" id="rocket-hint" className="rocket-hint" aria-hidden="true">
        <span className="rocket-hint-text">Click here to take off</span>
        <span className="rocket-hint-arrow">→</span>
      </button>

      <DeckScrollEffects />
    </AuditPasswordGate>
  )
}
