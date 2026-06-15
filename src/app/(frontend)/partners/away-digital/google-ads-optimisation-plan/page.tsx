import { Children, isValidElement, type ReactNode } from 'react'
import '../google-ads-audit/away-digital.css'
import AuditPasswordGate from '@/components/AuditPasswordGate'
import DeckScrollEffects from '../google-ads-audit/DeckScrollEffects'
import Starfield from '../google-ads-audit/Starfield'
import DownloadPdfButton from './DownloadPdfButton'

type TermRow = { term: string; spend: string; avgCpc?: string }
type MetricRow = { label: string; value: string; tone?: 'blue' | 'green' | 'red' | 'amber' }
type SearchTermSplit = {
  label: string
  percent: string
  count: string
  tone: 'blue' | 'green' | 'red' | 'amber' | 'purple'
  terms: readonly TermRow[]
}
type TimelineRow = {
  workstream: string
  tone: 'red' | 'blue' | 'green' | 'amber' | 'purple' | 'slate' | 'cyan' | 'pink'
  phases: readonly {
    label: string
    start: number
    span: number
  }[]
}

type CampaignCategorySpend = {
  name: string
  spend: string
  spendValue: number
  cpl: string
  color: string
  textColor: string
}

type JobTitleWasteRow = {
  category: string
  name: string
  spend: string
  cpl: string
  is: string
  variant: 'default' | 'rose' | 'muted'
  cplColor?: 'emerald' | 'slate'
  isColor?: 'amber' | 'slate' | 'muted'
}

type MatchTypeSpend = {
  label: string
  spend: string
  spendValue: number
  clicks: string
  conversions: string
  cpl: string
  color: string
  textColor: string
}

const NOT_RELEVANT_TERMS: readonly TermRow[] = [
  { term: 'vertex group', spend: '$232.66', avgCpc: '$232.66' },
  { term: 'shipmonk', spend: '$138.93', avgCpc: '$138.93' },
  { term: 'production hub', spend: '$133.59', avgCpc: '$133.59' },
  { term: 'dottob', spend: '$123.01', avgCpc: '$123.01' },
  { term: 'robots txt', spend: '$116.74', avgCpc: '$116.74' },
  { term: 'sales overdrive', spend: '$114.90', avgCpc: '$114.90' },
  { term: 'google my business partners', spend: '$113.97', avgCpc: '$113.97' },
  { term: 'seo for insurance brokers', spend: '$100.79', avgCpc: '$100.79' },
  { term: 'postiz', spend: '$99.99', avgCpc: '$99.99' },
]

const LOW_RELEVANCY_TERMS: readonly TermRow[] = [
  { term: 'shopify developers', spend: '$193.59', avgCpc: '$64.53' },
  { term: 'web design maintenance package', spend: '$106.46', avgCpc: '$106.46' },
  { term: 'shopify expert', spend: '$118.20', avgCpc: '$59.10' },
  { term: 'online marketing companies', spend: '$111.95', avgCpc: '$111.95' },
  { term: 'software developers melbourne', spend: '$83.95', avgCpc: '$83.95' },
  { term: 'branding outsourcing', spend: '$71.33', avgCpc: '$71.33' },
  { term: 'website maintenance', spend: '$70.60', avgCpc: '$35.30' },
  { term: 'social media management quote', spend: '$70.55', avgCpc: '$70.55' },
  { term: 'website content writers australia', spend: '$69.03', avgCpc: '$69.03' },
  { term: 'graphic design', spend: '$66.41', avgCpc: '$66.41' },
  { term: 'ppc ads marketing', spend: '$62.36', avgCpc: '$62.36' },
  { term: 'social media marketing for small business', spend: '$61.16', avgCpc: '$61.16' },
]

const RELEVANT_TERMS: readonly TermRow[] = [
  { term: 'rpo recruiting', spend: '$188.28', avgCpc: '$188.28' },
  { term: 'project management outsourcing services', spend: '$144.22', avgCpc: '$144.22' },
  { term: 'offshore staffing', spend: '$132.46', avgCpc: '$132.46' },
  { term: 'outsource aggregator', spend: '$86.58', avgCpc: '$28.86' },
  { term: 'outsource website management', spend: '$78.98', avgCpc: '$78.98' },
  { term: 'outsource vietnam', spend: '$73.97', avgCpc: '$73.97' },
  { term: 'ecommerce management services', spend: '$70.44', avgCpc: '$70.44' },
  { term: 'offshore business analyst', spend: '$69.54', avgCpc: '$69.54' },
  { term: 'offshore data analyst', spend: '$69.43', avgCpc: '$69.43' },
]

const COMPETITOR_TERMS: readonly TermRow[] = [
  { term: 'qx global services pvt ltd', spend: '$159.40', avgCpc: '$159.40' },
  { term: 'trustify technology', spend: '$139.97', avgCpc: '$139.97' },
  { term: 'connext global solutions', spend: '$136.68', avgCpc: '$136.68' },
  { term: 'sociallyin', spend: '$126.20', avgCpc: '$126.20' },
  { term: 'saransh inc', spend: '$88.05', avgCpc: '$88.05' },
  { term: 'hello people', spend: '$69.48', avgCpc: '$34.74' },
  { term: 'equivity inc', spend: '$65.61', avgCpc: '$21.87' },
  { term: 'hellopeople', spend: '$53.16', avgCpc: '$53.16' },
  { term: 'procom staffing', spend: '$47.35', avgCpc: '$47.35' },
  { term: 'national msp', spend: '$46.61', avgCpc: '$46.61' },
]

const BRAND_TERMS: readonly TermRow[] = [
  { term: 'away digital teams', spend: '$96.96', avgCpc: '$3.73' },
  { term: 'away digital vietnam', spend: '$83.96', avgCpc: '$10.50' },
  { term: 'away digital team', spend: '$48.21', avgCpc: '$16.07' },
  { term: 'away digital teams vietnam', spend: '$6.47', avgCpc: '$6.47' },
  { term: 'awaydigitalteams', spend: '$5.82', avgCpc: '$2.91' },
]

const SEARCH_TERM_SPLITS: readonly SearchTermSplit[] = [
  { label: 'Not relevant', percent: '52.2%', count: '489 search terms', tone: 'red', terms: NOT_RELEVANT_TERMS },
  { label: 'Low relevancy', percent: '17.2%', count: '119 search terms', tone: 'amber', terms: LOW_RELEVANCY_TERMS },
  { label: 'Relevant', percent: '19.8%', count: '116 search terms', tone: 'green', terms: RELEVANT_TERMS },
  { label: 'Brand / competitor', percent: '10.7%', count: '56 search terms', tone: 'purple', terms: [...COMPETITOR_TERMS, ...BRAND_TERMS] },
]

const HUBSPOT_ROWS = [
  ['Total', '2,656', '804', '30.27%', '53', '2.00%'],
  ['Digital', '1,237', '661', '53.44%', '21', '1.70%'],
  ['Offline', '1,419', '143', '10.08%', '32', '2.25%'],
  ['Google Ads only', '316', '202', '63.92%', '8', '2.53%'],
] as const

const VIETNAM_DEMAND_ROWS = [
  ['Outsourcing', '20', '590'],
  ['Outsourcing companies', '10', '140'],
  ['BPO', '10', '20'],
  ['IT outsourcing', '10', '50'],
  ['Software outsourcing', '20', '10'],
  ['Accounting outsourcing', '10', '90'],
  ['Virtual assistant', '10', '390'],
  ['Offshore staffing', 'Low / n/a', '20'],
] as const

const AU_VIETNAM_MONTHLY_SEARCH_VOLUME = '90'
const AU_PHILIPPINES_MONTHLY_SEARCH_VOLUME = '1,310'

const CAMPAIGN_CATEGORY_SPEND: readonly CampaignCategorySpend[] = [
  { name: 'Marketing/Graphics', spend: '$114K', spendValue: 114, cpl: '$1,413 CPL', color: 'bg-blue-500', textColor: 'text-blue-600' },
  { name: 'Developer/IT', spend: '$113K', spendValue: 113, cpl: '$1,636 CPL', color: 'bg-violet-500', textColor: 'text-violet-700' },
  { name: 'Finance', spend: '$71K', spendValue: 71, cpl: '$2,676 CPL', color: 'bg-amber-500', textColor: 'text-orange-700' },
  { name: 'Outsourcing', spend: '$87K', spendValue: 87, cpl: '$1,275 CPL', color: 'bg-emerald-500', textColor: 'text-teal-700' },
]

const CAMPAIGN_CATEGORY_TOTAL = CAMPAIGN_CATEGORY_SPEND.reduce((total, category) => total + category.spendValue, 0)

const MATCH_TYPE_SPEND: readonly MatchTypeSpend[] = [
  { label: 'Broad match', spend: '$386.7K', spendValue: 386655, clicks: '15,358', conversions: '242', cpl: '$1,598 CPL', color: 'bg-red-500', textColor: 'text-red-700' },
  { label: 'Exact match', spend: '$23.7K', spendValue: 23708, clicks: '1,019', conversions: '22', cpl: '$1,078 CPL', color: 'bg-emerald-500', textColor: 'text-emerald-700' },
  { label: 'Phrase match', spend: '$6.8K', spendValue: 6823, clicks: '333', conversions: '4', cpl: '$1,706 CPL', color: 'bg-blue-500', textColor: 'text-blue-700' },
]

const MATCH_TYPE_TOTAL = MATCH_TYPE_SPEND.reduce((total, matchType) => total + matchType.spendValue, 0)

const JOB_TITLE_WASTE_ROWS: readonly JobTitleWasteRow[] = [
  { category: 'Developer/IT', name: 'Other QA/QC, Cloud Engineer, Sys Admin, Prompt Engineers', spend: '$3,818', cpl: '0 conv', is: '<10%', variant: 'rose' },
  { category: 'Finance', name: 'Finance Industry', spend: '$795', cpl: '0 conv', is: '<10%', variant: 'rose' },
  { category: 'Marketing/Graphics', name: 'Social Media Specialist', spend: '$18,564', cpl: '$4,641', is: '<10%', variant: 'rose' },
  { category: 'Finance', name: 'Accounts Payable', spend: '$10,780', cpl: '$4,312', is: '<10%', variant: 'rose' },
  { category: 'Developer/IT', name: 'Data Engineer', spend: '$4,216', cpl: '$4,216', is: '<10%', variant: 'rose' },
  { category: 'Marketing/Graphics', name: 'UX/UI Designer', spend: '$3,983', cpl: '$3,983', is: '<10%', variant: 'rose' },
  { category: 'Finance', name: 'Payroll Specialists', spend: '$18,145', cpl: '$3,629', is: '<10%', variant: 'rose' },
  { category: 'Finance', name: 'Bookkeeper', spend: '$12,558', cpl: '$3,140', is: '<10%', variant: 'rose' },
  { category: 'Finance', name: 'Generic Financial', spend: '$14,144', cpl: '$2,829', is: '<10%', variant: 'rose' },
  { category: 'Marketing/Graphics', name: 'Game Designer', spend: '$12,693', cpl: '$2,539', is: '<10%', variant: 'rose' },
  { category: 'Developer/IT', name: 'eCom Developer', spend: '$7,521', cpl: '$2,507', is: '<10%', variant: 'rose' },
  { category: 'Developer/IT', name: 'App Developer', spend: '$21,195', cpl: '$2,355', is: '<10%', variant: 'rose' },
  { category: 'Developer/IT', name: 'DevOps Engineer', spend: '$2,334', cpl: '$2,334', is: '<10%', variant: 'rose' },
  { category: 'Developer/IT', name: 'Full Stack Developer', spend: '$12,946', cpl: '$2,158', is: '10.5%', variant: 'rose' },
  { category: 'Developer/IT', name: 'Back end Developer', spend: '$3,961', cpl: '$1,981', is: '<10%', variant: 'default', cplColor: 'slate', isColor: 'muted' },
  { category: 'Finance', name: 'Accountant', spend: '$5,614', cpl: '$1,871', is: '<10%', variant: 'default', cplColor: 'slate', isColor: 'muted' },
  { category: 'Developer/IT', name: 'Front end Developer', spend: '$5,186', cpl: '$1,729', is: '<10%', variant: 'default', cplColor: 'slate', isColor: 'muted' },
  { category: 'Marketing/Graphics', name: 'PPC/SEM Specialist', spend: '$4,965', cpl: '$1,655', is: '<10%', variant: 'default', cplColor: 'slate', isColor: 'muted' },
  { category: 'Developer/IT', name: 'Data Analyst', spend: '$3,241', cpl: '$1,389', is: '<10%', variant: 'default', cplColor: 'slate', isColor: 'muted' },
  { category: 'Finance', name: 'Accounts Receivable', spend: '$8,887', cpl: '$1,270', is: '<10%', variant: 'default', cplColor: 'emerald', isColor: 'amber' },
  { category: 'Developer/IT', name: 'Software developers', spend: '$14,306', cpl: '$1,192', is: '<10%', variant: 'default', cplColor: 'emerald', isColor: 'amber' },
  { category: 'Marketing/Graphics', name: 'Graphic Designer', spend: '$6,950', cpl: '$1,158', is: '11.7%', variant: 'default', cplColor: 'emerald', isColor: 'slate' },
  { category: 'Developer/IT', name: 'IT Services', spend: '$34,698', cpl: '$1,157', is: '<10%', variant: 'default', cplColor: 'emerald', isColor: 'amber' },
  { category: 'Marketing/Graphics', name: 'Digital Marketing Specialist', spend: '$25,555', cpl: '$1,127', is: '<10%', variant: 'default', cplColor: 'emerald', isColor: 'amber' },
  { category: 'Marketing/Graphics', name: 'SEO Specialist', spend: '$4,450', cpl: '$1,112', is: '<10%', variant: 'default', cplColor: 'emerald', isColor: 'amber' },
  { category: 'Marketing/Graphics', name: '3D Animator', spend: '$16,563', cpl: '$1,035', is: '<10%', variant: 'default', cplColor: 'emerald', isColor: 'amber' },
  { category: 'Marketing/Graphics', name: 'Content Writer', spend: '$6,394', cpl: '$913', is: '<10%', variant: 'default', cplColor: 'emerald', isColor: 'amber' },
  { category: 'Marketing/Graphics', name: 'Video Editor', spend: '$2,158', cpl: '$360', is: '24.3%', variant: 'default', cplColor: 'emerald', isColor: 'slate' },
]

const TIMELINE_ROWS: readonly TimelineRow[] = [
  {
    workstream: 'GA4 + HubSpot + chatbot',
    tone: 'green',
    phases: [
      { label: 'Fix GA4, HubSpot + chat tracking', start: 1, span: 0.75 },
      { label: 'Use HubSpot data in decisions', start: 4, span: 1 },
    ],
  },
  {
    workstream: 'Negative keyword list',
    tone: 'red',
    phases: [
      { label: 'Historical cleanup of all negatives', start: 1, span: 2 },
      { label: 'Weekly scheduled negative list', start: 3, span: 1 },
    ],
  },
  {
    workstream: 'AI Max + bidding',
    tone: 'amber',
    phases: [
      { label: 'Turn off AI Max + Maximise Clicks risk', start: 1, span: 1 },
      { label: 'Stabilise bid strategy', start: 2, span: 3 },
    ],
  },
  {
    workstream: 'Budget reallocation',
    tone: 'blue',
    phases: [
      { label: 'Shift budget to stronger intent', start: 1, span: 2 },
      { label: 'Scale what proves quality', start: 3, span: 2 },
    ],
  },
  {
    workstream: 'Match types',
    tone: 'purple',
    phases: [
      { label: 'Eliminate broad match keywords + move to phrase/exact', start: 1, span: 2.5 },
    ],
  },
  {
    workstream: 'Ad group structure',
    tone: 'cyan',
    phases: [
      { label: 'Refine by intent', start: 2, span: 2 },
      { label: 'Refine budgets by theme', start: 4, span: 1 },
    ],
  },
  {
    workstream: 'Ad copy',
    tone: 'pink',
    phases: [
      { label: 'Rewrite by role + funnel stage', start: 3.5, span: 1.5 },
    ],
  },
  {
    workstream: 'Landing page + flow',
    tone: 'green',
    phases: [
      { label: 'Align pages to search intent', start: 4, span: 1 },
    ],
  },
]

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

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-blue-500 font-semibold text-sm uppercase tracking-widest mb-2">{children}</p>
}

function SlideTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-[30px] md:text-[42px] font-bold tracking-tight text-slate-950 mb-3">{children}</h2>
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="text-sm md:text-base text-slate-600 leading-relaxed max-w-4xl mb-6">{children}</p>
}

function CampaignCategorySplit() {
  return (
    <div className="campaign-swipe-panel">
      <div className="max-w-5xl mx-auto w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">
          Total spend by campaign category
        </div>
        <div className="flex h-20 overflow-hidden rounded-2xl bg-slate-100 shadow-inner">
          {CAMPAIGN_CATEGORY_SPEND.map((category) => (
            <div
              key={category.name}
              className={`${category.color} flex items-center justify-center border-r border-white/40 px-3 text-center text-sm font-black text-white last:border-r-0`}
              style={{ width: `${(category.spendValue / CAMPAIGN_CATEGORY_TOTAL) * 100}%` }}
              title={`${category.name}: ${category.spend}, ${category.cpl}`}
            >
              {category.spend}
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-0">
          {CAMPAIGN_CATEGORY_SPEND.map((category) => (
            <div
              key={category.name}
              className="px-2 text-center"
              style={{ width: `${(category.spendValue / CAMPAIGN_CATEGORY_TOTAL) * 100}%` }}
            >
              <div className="text-xs font-black uppercase tracking-wider text-slate-700">{category.name}</div>
              <div className={`mt-1 text-sm font-bold ${category.textColor}`}>{category.cpl}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function jobTitleNameClass(row: JobTitleWasteRow): string {
  if (row.variant === 'rose') return 'py-1.5 px-3 font-semibold text-rose-700'
  if (row.variant === 'muted') return 'py-1.5 px-3 text-slate-500'
  return 'py-1.5 px-3 text-slate-700'
}

function jobTitleSpendClass(row: JobTitleWasteRow): string {
  if (row.variant === 'muted') return 'py-1.5 px-3 text-right tabular-nums text-slate-500'
  return 'py-1.5 px-3 text-right tabular-nums text-slate-700'
}

function jobTitleCplClass(row: JobTitleWasteRow): string {
  if (row.variant === 'rose') return 'py-1.5 px-3 text-right tabular-nums font-semibold text-rose-700'
  if (row.variant === 'muted') return 'py-1.5 px-3 text-right tabular-nums text-slate-500'
  if (row.cplColor === 'emerald') return 'py-1.5 px-3 text-right tabular-nums font-semibold text-emerald-700'
  return 'py-1.5 px-3 text-right tabular-nums text-slate-700'
}

function jobTitleIsClass(row: JobTitleWasteRow): string {
  if (row.isColor === 'amber') return 'py-1.5 px-3 text-right tabular-nums font-semibold text-amber-700'
  return 'py-1.5 px-3 text-right tabular-nums text-slate-500'
}

function JobTitleWasteSplit() {
  return (
    <div className="campaign-swipe-panel">
      <div className="max-w-5xl mx-auto w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 text-xs font-black uppercase tracking-widest text-slate-500">
          Job-title waste by ad group
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-xs md:text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Category</th>
                <th className="px-3 py-2 font-semibold">Job title</th>
                <th className="px-3 py-2 text-right font-semibold">Spend</th>
                <th className="px-3 py-2 text-right font-semibold">CPL</th>
                <th className="px-3 py-2 text-right font-semibold">IS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {JOB_TITLE_WASTE_ROWS.map((row) => (
                <tr key={`${row.category}-${row.name}`} className={row.variant === 'rose' ? 'bg-rose-50/55' : undefined}>
                  <td className="py-1.5 px-3 text-slate-500">{row.category}</td>
                  <td className={jobTitleNameClass(row)}>{row.name}</td>
                  <td className={jobTitleSpendClass(row)}>{row.spend}</td>
                  <td className={jobTitleCplClass(row)}>{row.cpl}</td>
                  <td className={jobTitleIsClass(row)}>{row.is}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function BroadMatchSpendSplit() {
  return (
    <div className="campaign-swipe-panel">
      <div className="max-w-5xl mx-auto w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">
          Keyword spend by match type from Jun 2025 to Apr 2026
        </div>
        <div className="flex h-20 overflow-hidden rounded-2xl bg-slate-100 shadow-inner">
          {MATCH_TYPE_SPEND.map((matchType) => {
            const width = matchType.label === 'Broad match' ? '72%' : matchType.label === 'Exact match' ? '18%' : '10%'
            return (
              <div
                key={matchType.label}
                className={`${matchType.color} flex items-center justify-center border-r border-white/40 px-3 text-center text-sm font-black text-white last:border-r-0`}
                style={{ width }}
                title={`${matchType.label}: ${matchType.spend}, ${matchType.cpl}`}
              >
                {matchType.label.replace(' match', '')}
              </div>
            )
          })}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4">
          {MATCH_TYPE_SPEND.map((matchType) => (
            <div key={matchType.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
              <div className="text-xs font-black uppercase tracking-wider text-slate-700">{matchType.label}</div>
              <div className={`mt-2 text-2xl font-black ${matchType.textColor}`}>{matchType.spend}</div>
              <div className={`mt-1 text-sm font-bold ${matchType.textColor}`}>{matchType.cpl}</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-500">
                <div><span className="block text-slate-400">Clicks</span>{matchType.clicks}</div>
                <div><span className="block text-slate-400">Conv.</span>{matchType.conversions}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, tone = 'blue' }: MetricRow) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
  }
  return (
    <div className={`rounded-2xl border p-5 ${tones[tone]}`}>
      <div className="text-4xl md:text-6xl font-black tracking-tight">{value}</div>
      <div className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-600">{label}</div>
    </div>
  )
}

function TermTable({ rows }: { rows: readonly TermRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-2 font-semibold">Search term</th>
            <th className="px-4 py-2 text-right font-semibold">Spend</th>
            <th className="px-4 py-2 text-right font-semibold">Avg CPC</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={`${row.term}-${row.spend}`}>
              <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{row.term}</td>
              <td className="px-4 py-2 text-right font-semibold text-slate-900">{row.spend}</td>
              <td className="px-4 py-2 text-right font-semibold text-slate-700">{row.avgCpc ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SearchTermSplitCard({ split }: { split: SearchTermSplit }) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    purple: 'border-violet-200 bg-violet-50 text-violet-700',
  }

  return (
    <details className={`group rounded-2xl border ${tones[split.tone]} overflow-hidden`}>
      <summary className="cursor-pointer list-none p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-4xl md:text-5xl font-black tracking-tight">{split.percent}</div>
            <div className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-600">{split.label}</div>
          </div>
          <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-slate-600 group-open:rotate-180 transition-transform">⌄</span>
        </div>
        <div className="mt-4 text-xs font-semibold text-slate-600">
          <span>{split.count}</span>
        </div>
      </summary>
      <div className="border-t border-current/10 bg-white/65 p-3">
        <TermTable rows={split.terms} />
      </div>
    </details>
  )
}

function BulletCard({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-bold text-slate-950 mb-3">{title}</h3>
      <ul className="space-y-2 text-sm text-slate-600 leading-snug">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function GanttBar({ row }: { row: TimelineRow }) {
  const tones = {
    red: 'from-red-500 to-orange-400 border-red-200',
    blue: 'from-blue-600 to-cyan-400 border-blue-200',
    green: 'from-emerald-600 to-lime-400 border-emerald-200',
    amber: 'from-amber-500 to-yellow-300 border-amber-200',
    purple: 'from-violet-600 to-fuchsia-400 border-violet-200',
    slate: 'from-slate-700 to-slate-400 border-slate-200',
    cyan: 'from-cyan-600 to-sky-300 border-cyan-200',
    pink: 'from-pink-600 to-rose-300 border-pink-200',
  }

  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 items-center py-2 border-b border-slate-100 last:border-b-0">
      <div className="text-xs font-black text-slate-900 leading-tight">{row.workstream}</div>
      <div className="relative grid grid-cols-4 gap-2 min-h-[48px]">
        <div className="absolute inset-0 grid grid-cols-4 gap-2 pointer-events-none">
          {[0, 1, 2, 3].map((i) => <div key={i} className="rounded-xl bg-slate-100/80" />)}
        </div>
        {row.phases.map((phase) => {
          const reachesDay90 = phase.start + phase.span >= 5
          return (
            <div
              key={`${row.workstream}-${phase.label}`}
              className={`absolute z-10 border bg-gradient-to-r ${tones[row.tone]} px-2 py-1.5 text-[10px] font-bold leading-tight text-white shadow-sm flex h-12 items-center ${reachesDay90 ? 'rounded-l-lg pr-4' : 'rounded-lg'}`}
              style={{
                left: `${(phase.start - 1) * 25}%`,
                width: reachesDay90 ? `calc(${phase.span * 25}% + 0.5rem)` : `calc(${phase.span * 25}% - 0.25rem)`,
                clipPath: reachesDay90 ? 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)' : undefined,
              }}
            >
              {phase.label}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function AwayDigitalOptimisationPlanPage() {
  return (
    <AuditPasswordGate
      auditSlug="away-digital/google-ads-audit"
      businessName="Away Digital Teams"
      featureLabel="Google Ads Optimisation Plan"
    >
      <div className="fixed top-0 left-0 right-0 h-1 bg-slate-200 z-50">
        <div id="progress-bar" className="h-full bg-blue-600 transition-all" style={{ width: '0%' }} />
      </div>

      <main className="flex flex-col-reverse">
        <section id="cover" data-label="Cover" className="cover-v2 relative min-h-screen flex flex-col">
          <Starfield id="cover-starfield" />
          <div className="orbit-deco" style={{ width: '1100px', height: '1100px', right: '-380px', top: '-300px' }} />
          <div
            className="orbit-deco"
            style={{ width: '720px', height: '720px', right: '-160px', top: '-80px', borderColor: 'rgba(77,148,255,0.1)' }}
          />
          <div className="relative z-10 px-8 md:px-12 pt-10 w-full">
            <div className="flex items-center gap-3">
              <span className="cover-dot" aria-hidden="true" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/optimise-digital-logo-white.webp" alt="Optimise Digital" className="w-auto h-[22.8px] md:h-[30.4px]" />
            </div>
          </div>
          <div className="relative z-10 flex-1 flex flex-col justify-center px-8 md:px-12 pb-12 w-full -mt-[20px]">
            <div className="flex flex-col items-start gap-5 text-left max-w-4xl">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="cover-pill">Google Ads Optimisation Plan</span>
                <span className="cover-meta">90-day rollout</span>
              </div>
              <h1 className="cover-h1 text-4xl md:text-6xl">Away Digital Teams</h1>
            </div>
          </div>
        </section>

        <Section id="success-metrics" label="Goals and metrics" number="2 / 11">
          <Eyebrow>90-day goal</Eyebrow>
          <SlideTitle>Increase leads, maintain spend, and make every dollar work harder.</SlideTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-3xl border border-emerald-200 p-5">
              <div className="text-xs font-black uppercase tracking-widest text-emerald-700">Goal 1</div>
              <h3 className="mt-2 text-xl font-black text-slate-950">Reduce cost per lead significantly.</h3>
              <p className="mt-2 text-sm font-semibold text-slate-700">The benchmark from June 2025 onward is <strong>$1,373 cost per lead</strong>. The goal is to reduce that significantly, ideally by half.</p>
            </div>
            <div className="rounded-3xl border border-emerald-200 p-5">
              <div className="text-xs font-black uppercase tracking-widest text-emerald-700">Goal 2</div>
              <h3 className="mt-2 text-xl font-black text-slate-950">Maintain investment and increase leads.</h3>
              <p className="mt-2 text-sm font-semibold text-slate-700">The aim is to keep investing around <strong>$50,000 per month</strong>, but spend it as efficiently as possible and see how many qualified leads that can generate.</p>
            </div>
            <div className="rounded-3xl border border-emerald-200 p-5">
              <div className="text-xs font-black uppercase tracking-widest text-emerald-700">Goal 3</div>
              <h3 className="mt-2 text-xl font-black text-slate-950">Lift search relevance above 90%.</h3>
              <p className="mt-2 text-sm font-semibold text-slate-700">Current search relevance is likely below 50%. We want the majority of spend going to searches that clearly match outsourcing intent.</p>
            </div>
          </div>
        </Section>

        <Section id="search-waste" label="Search spend waste" number="3 / 11">
          <Eyebrow>Immediate low-hanging fruit</Eyebrow>
          <SlideTitle>Last month's search terms alone show extreme waste.</SlideTitle>
          <div className="grid grid-cols-1 md:grid-cols-[1.05fr_1.95fr] gap-4 mb-4 items-stretch">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 flex flex-col justify-center">
              <div className="text-xs font-black uppercase tracking-widest text-slate-500">May Google Ads spend</div>
              <div className="mt-2 text-6xl md:text-7xl font-black tracking-tight text-slate-950">$42k</div>
              <p className="mt-3 text-sm font-semibold leading-snug text-slate-600">
                One month of media spend before fixing the search waste, targeting and conversion tracking issues.
              </p>
            </div>
            <div className="search-split-grid grid grid-cols-1 md:grid-cols-2 gap-4">
              {SEARCH_TERM_SPLITS.map((split) => <SearchTermSplitCard key={split.label} split={split} />)}
            </div>
          </div>
        </Section>

        <Section id="budget-allocation" label="Budget allocation" number="4 / 11">
          <Eyebrow>Same budget, better allocation</Eyebrow>
          <SlideTitle>Shift spend from weak intent into stronger commercial intent.</SlideTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <h3 className="font-bold text-red-900 mb-3">Optimise / Reduce / Control</h3>
              <ul className="space-y-2 text-sm text-red-950/80">
                <li className="flex items-center justify-between gap-3">
                  <span>• Job categories with repeated high CPA or weak lead quality</span>
                  <details className="campaign-swipe group shrink-0">
                    <summary className="list-none inline-flex h-7 w-7 cursor-pointer select-none items-center justify-center rounded-full border border-red-200 bg-white/70 text-sm font-black text-red-700 transition hover:bg-white hover:border-red-300" aria-label="View campaign category split">
                      <span className="group-open:hidden">→</span>
                      <span className="hidden group-open:inline whitespace-nowrap px-3">Back to slide 3</span>
                    </summary>
                    <CampaignCategorySplit />
                  </details>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span>• Job-title searches that have never proven performance</span>
                  <details className="campaign-swipe group shrink-0">
                    <summary className="list-none inline-flex h-7 w-7 cursor-pointer select-none items-center justify-center rounded-full border border-red-200 bg-white/70 text-sm font-black text-red-700 transition hover:bg-white hover:border-red-300" aria-label="View job-title waste split">
                      <span className="group-open:hidden">→</span>
                      <span className="hidden group-open:inline whitespace-nowrap px-3">Back to slide 3</span>
                    </summary>
                    <JobTitleWasteSplit />
                  </details>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span>• Almost eliminate broad match across the account</span>
                  <details className="campaign-swipe group shrink-0">
                    <summary className="list-none inline-flex h-7 w-7 cursor-pointer select-none items-center justify-center rounded-full border border-red-200 bg-white/70 text-sm font-black text-red-700 transition hover:bg-white hover:border-red-300" aria-label="View match-type spend split">
                      <span className="group-open:hidden">→</span>
                      <span className="hidden group-open:inline whitespace-nowrap px-3">Back to slide 3</span>
                    </summary>
                    <BroadMatchSpendSplit />
                  </details>
                </li>
              </ul>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <h3 className="font-bold text-emerald-900 mb-3">Increase / protect</h3>
              <ul className="space-y-2 text-sm text-emerald-950/80">
                <li>• Generic outsourcing and offshore staffing intent</li>
                <li>• Exact/phrase queries with proven commercial relevance</li>
                <li>• Role categories the client confirms are strategically important</li>
                <li>• Vietnam search coverage if ownership is a priority</li>
              </ul>
            </div>
          </div>
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
            Before making changes to strategically important role categories, we’ll align with your team first. The initial focus is to remove obvious waste, then reallocate budget toward the searches, campaigns and audiences showing stronger commercial intent and better lead quality.
          </div>
        </Section>

        <Section id="hubspot-context" label="HubSpot context" number="5 / 11">
          <Eyebrow>Commercial context</Eyebrow>
          <SlideTitle>Google Ads is the highest converting channel according to HubSpot.</SlideTitle>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm md:text-base">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Segment</th>
                  <th className="px-4 py-3 text-right">Leads</th>
                  <th className="px-4 py-3 text-right">Deals</th>
                  <th className="px-4 py-3 text-right">Lead → Deal CR</th>
                  <th className="px-4 py-3 text-right">Client Won</th>
                  <th className="px-4 py-3 text-right">Lead → Client Won CR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {HUBSPOT_ROWS.map((row) => (
                  <tr key={row[0]} className={row[0] === 'Google Ads only' ? 'bg-blue-50' : undefined}>
                    <td className="px-4 py-3 font-bold text-slate-900">{row[0]}</td>
                    <td className="px-4 py-3 text-right">{row[1]}</td>
                    <td className="px-4 py-3 text-right">{row[2]}</td>
                    <td className="px-4 py-3 text-right font-semibold">{row[3]}</td>
                    <td className="px-4 py-3 text-right">{row[4]}</td>
                    <td className="px-4 py-3 text-right font-black text-blue-700">{row[5]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </Section>

        <Section id="vietnam-coverage" label="Vietnam coverage" number="6 / 11">
          <Eyebrow>Requested and recommended</Eyebrow>
          <SlideTitle>Away Digital should own Vietnam outsourcing search.</SlideTitle>
          <div className="grid grid-cols-1 md:grid-cols-[0.8fr_1.2fr] gap-5 items-stretch">
            <div className="rounded-3xl border border-red-200 bg-red-50 p-6 flex flex-col justify-center text-center">
              <div className="text-7xl md:text-8xl font-black tracking-tight text-red-600">~10%</div>
              <div className="mt-3 text-sm font-bold uppercase tracking-widest text-red-900">covered today</div>
              <p className="mt-4 text-sm text-red-950/75">In simple terms, the relevant campaign context is appearing for roughly 1 in 10 available searches.</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-bold text-slate-950 mb-4">What is limiting coverage?</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4"><div className="text-slate-500">Lost to budget</div><div className="text-3xl font-black text-slate-900">~50%</div></div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4"><div className="text-slate-500">Lost to rank</div><div className="text-3xl font-black text-slate-900">~41%</div></div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 col-span-2"><strong>Structure:</strong> Vietnam terms sit inside generic outsourcing/ad groups rather than a dedicated ownership structure.</div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 col-span-2"><strong>Message:</strong> current ads are strong generic offshore messages, but not Vietnam-specific.</div>
              </div>
            </div>
          </div>

        </Section>

        <Section id="other-optimisations" label="Other optimisations" number="7 / 11">
          <SlideTitle>Account optimisations that will turn around the account within 90 days.</SlideTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <BulletCard title="Negative keyword system" items={['Start adding negative keywords from day 1.', 'Review historical negative keywords and search-term waste.', 'Combine the cleaned list with our scheduled weekly negative keyword process.']} />
            <BulletCard title="AI Max + bid strategy fixes" items={['Turn off AI Max where it is expanding into weak intent.', 'Move away from Maximise Clicks where it is driving poor-quality traffic.', 'Use bid strategies that optimise toward lead quality, not cheap clicks.']} />
            <BulletCard title="Match type restructure" items={['Remove broad match where query quality is poor.', 'Move proven terms into phrase and exact match.', 'Keep discovery/testing separate from core lead generation.']} />
            <BulletCard title="Ad group structure" items={['Separate generic outsourcing, role-specific, Vietnam and comparison searches.', 'Make query → keyword → ad → landing page more aligned.', 'Use clearer budgets and success criteria by theme.']} />
            <BulletCard title="Ad copy improvements" items={['Match ad copy to the searcher’s role, intent and buying stage.', 'Use finance-specific pain points for accounts payable and accountant searches.', 'Use mid-funnel education and comparison copy for broader outsourcing searches.', 'Add qualification language: full-time hires, long-term teams, not freelancers.']} />
            <BulletCard title="Landing page + flow audit" items={['Review whether landing pages match search intent.', 'Validate form → HubSpot → Calendly flow.', 'Use the Peter TEST submission to confirm source and click data capture.']} />
            <BulletCard title="HubSpot quality feedback" items={['Map leads to deals and won clients by source/campaign.', 'Use lead quality to guide budget decisions.', 'Consider offline conversion imports once fields are clean.']} />
            <BulletCard title="GA4 + Google Ads tracking fix" items={['GA4 key events are not set up cleanly.', 'Remove page_view, first_visit and session_start as key events.', 'Current GA4 links show Google Ads customer 489-489-6666, not the active Away Ads account 342-535-3766.', 'Relink GA4 to the active Google Ads account and keep real lead actions as primary conversions.']} />
            <BulletCard title="Chatbot tracking check" items={['GA4 event review did not show chat/chatbot/conversation events.', 'Confirm which chatbot widget is active and whether chats create HubSpot contacts/deals.', 'Track chatbot starts, qualified chats and booked meetings as secondary or primary lead events depending on quality.']} />
          </div>
        </Section>

        <Section id="timeline" label="90-day rollout" number="8 / 11">
          <Eyebrow>Implementation roadmap</Eyebrow>
          <SlideTitle>90-day rollout plan.</SlideTitle>
          <Lead>First 30 days remove waste and restructure. Days 31 to 90 optimise, validate lead quality, then scale what works.</Lead>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/70">
            <div className="grid grid-cols-[180px_1fr] gap-4 items-end border-b border-slate-200 pb-3 mb-1">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Workstream</div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs font-black uppercase tracking-widest text-slate-500">
                <div>Days 1 to 14</div>
                <div>Days 15 to 30</div>
                <div>Days 31 to 60</div>
                <div>Days 61 to 90</div>
              </div>
            </div>
            {TIMELINE_ROWS.map((row) => <GanttBar key={row.workstream} row={row} />)}
          </div>

        </Section>


        <Section id="goal-alignment" label="End-goal alignment" number="10 / 11">
          <Eyebrow>Client decision point</Eyebrow>
          <SlideTitle>Questions to confirm.</SlideTitle>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <ul className="space-y-2 text-base text-slate-600 leading-snug">
              {['Is the goal more total leads, better-fit leads, more deals, or more won clients?', 'Are there roles you want to keep prioritising even if CPA is higher?', 'Are there roles you do not want more enquiries for?', 'How much freedom do we have to pause or reduce roles if the data shows they are driving poor-quality leads or high CPL?'].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section id="philippines-vietnam" label="Market demand" number="11 / 11">
          <Eyebrow>Market demand</Eyebrow>
          <SlideTitle>Australia has more Philippines search volume, but Vietnam is the ownership opportunity.</SlideTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center">
              <div className="text-xs font-black uppercase tracking-widest text-emerald-700">Vietnam outsourcing searches in Australia</div>
              <div className="mt-3 text-6xl font-black text-emerald-700">{AU_VIETNAM_MONTHLY_SEARCH_VOLUME}</div>
              <div className="mt-2 text-sm font-bold text-emerald-950/70">estimated searches per month across included themes</div>
            </div>
            <div className="rounded-3xl border border-blue-200 bg-blue-50 p-6 text-center">
              <div className="text-xs font-black uppercase tracking-widest text-blue-700">Philippines outsourcing searches in Australia</div>
              <div className="mt-3 text-6xl font-black text-blue-700">{AU_PHILIPPINES_MONTHLY_SEARCH_VOLUME}</div>
              <div className="mt-2 text-sm font-bold text-blue-950/70">estimated searches per month across included themes</div>
            </div>
          </div>
          <details className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer list-none bg-slate-50 px-5 py-4 text-sm font-black uppercase tracking-widest text-slate-600">
              Show included keyword themes
            </summary>
            <table className="w-full text-left text-sm">
              <thead className="bg-white text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Search theme</th>
                  <th className="px-4 py-3 text-right">AU Vietnam</th>
                  <th className="px-4 py-3 text-right">AU Philippines</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {VIETNAM_DEMAND_ROWS.map((row) => (
                  <tr key={row[0]}>
                    <td className="px-4 py-3 font-semibold text-slate-900">{row[0]}</td>
                    <td className="px-4 py-3 text-right">{row[1]}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-700">{row[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Section>

        <div id="space-transition" className="v2-space-transition h-24" aria-hidden="true" />

        <section id="closing" data-label="Closing" className="closing-v2 relative min-h-screen flex flex-col">
          <Starfield id="closing-starfield" />
          <div className="orbit-deco" style={{ width: '900px', height: '900px', right: '-280px', top: '-240px' }} />
          <div className="relative z-10 flex-1 flex flex-col justify-center px-8 md:px-12 pb-12 w-full">
            <h2 className="closing-h1 text-4xl md:text-6xl max-w-4xl">Ready to turn the audit into implementation.</h2>
            <div className="closing-who mt-12">
              <div>
                <div className="lbl">Prepared for</div>
                <div className="val">Away Digital Teams</div>
              </div>
              <div>
                <div className="lbl">Prepared by</div>
                <div className="val">Optimise Digital</div>
              </div>
            </div>
          </div>
          <div className="absolute bottom-9 right-4 z-10 flex flex-wrap items-center justify-end gap-2">
            <a href="/partners/away-digital/google-ads-audit" className="inline-flex items-center justify-center rounded-md bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm transition-colors hover:bg-white">
              Original audit deck · PIN 4466
            </a>
            <DownloadPdfButton />
          </div>
        </section>
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
