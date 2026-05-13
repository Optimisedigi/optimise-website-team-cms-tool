/**
 * Route: /partners/away-digital/google-ads-audit
 *
 * Server-rendered scaffold of the Away Digital Teams Google Ads audit deck.
 * Each <section> is the column-reverse "slide" — the cover sits at the bottom
 * of the document; users scroll upward through the deck (handled by
 * DeckScrollEffects). Section content is ported from
 * website-growth-tools/output/away-digital-audit-may-2026.html.
 *
 * Currently filled in: #cover only. Other sections are placeholders to be
 * completed in subsequent tasks.
 */

import type { ReactNode } from 'react'
import './away-digital.css'
import AuditPasswordGate from '@/components/AuditPasswordGate'
import Starfield from './Starfield'
import DeckScrollEffects from './DeckScrollEffects'
import AccountGlanceChart from './AccountGlanceChart'

type AuditScoreBar = {
  step: number
  label: string
  score: number
  scoreColor: string
  barColor: string
}

const AUDIT_SCORE_BARS: readonly AuditScoreBar[] = [
  { step: 3, label: 'Keyword & search intent', score: 3, scoreColor: 'text-red-500', barColor: 'bg-red-500' },
  { step: 13, label: 'Competitive landscape', score: 3, scoreColor: 'text-red-500', barColor: 'bg-red-500' },
  { step: 1, label: 'Website & business analysis', score: 5, scoreColor: 'text-amber-500', barColor: 'bg-amber-500' },
  { step: 11, label: 'Historical performance', score: 5, scoreColor: 'text-amber-500', barColor: 'bg-amber-500' },
  { step: 6, label: 'Channel performance', score: 7, scoreColor: 'text-lime-600', barColor: 'bg-lime-500' },
  { step: 7, label: 'Search query analysis', score: 7, scoreColor: 'text-lime-600', barColor: 'bg-lime-500' },
  { step: 2, label: 'Account structure overview', score: 8, scoreColor: 'text-lime-600', barColor: 'bg-lime-500' },
  { step: 4, label: 'Tracking & measurement setup', score: 8, scoreColor: 'text-lime-600', barColor: 'bg-lime-500' },
  { step: 5, label: 'Campaign structure analysis', score: 8, scoreColor: 'text-lime-600', barColor: 'bg-lime-500' },
  { step: 10, label: 'Brand vs generic split', score: 8, scoreColor: 'text-lime-600', barColor: 'bg-lime-500' },
  { step: 8, label: 'Negative keyword management', score: 10, scoreColor: 'text-green-500', barColor: 'bg-green-500' },
  { step: 9, label: 'Ad copy & assets review', score: 10, scoreColor: 'text-green-500', barColor: 'bg-green-500' },
  { step: 12, label: 'Audience strategy', score: 10, scoreColor: 'text-green-500', barColor: 'bg-green-500' },
]

type NbTrendMonth = {
  /** X position of the bar (rect x attribute) */
  x: number
  /** Centered X used for the rotated month label and total label */
  centerX: number
  /** Month label */
  label: string
  /** Y position of the total label above the stack */
  totalY: number
  /** Total dollars text shown above the stack */
  total: string
  /** Stacked segments in draw order: blue, violet, orange, teal */
  segments: readonly [
    { y: number; height: number },
    { y: number; height: number },
    { y: number; height: number },
    { y: number; height: number },
  ]
}

const NB_TREND_SEGMENT_COLORS = [
  'rgb(59,130,246)',
  'rgb(168,85,247)',
  'rgb(245,158,11)',
  'rgb(16,185,129)',
] as const

const NB_TREND_MONTHS: readonly NbTrendMonth[] = [
  { x: 48.0, centerX: 60.0, label: 'Jan', totalY: 174.4, total: '$8.6k', segments: [{ y: 206.4, height: 3.6 }, { y: 202.1, height: 4.3 }, { y: 193.0, height: 9.2 }, { y: 178.4, height: 14.6 }] },
  { x: 90.7, centerX: 102.7, label: 'Feb', totalY: 143.2, total: '$17.1k', segments: [{ y: 202.8, height: 7.2 }, { y: 194.3, height: 8.5 }, { y: 175.9, height: 18.3 }, { y: 147.2, height: 28.7 }] },
  { x: 133.3, centerX: 145.3, label: 'Mar', totalY: 114.1, total: '$25.0k', segments: [{ y: 199.2, height: 10.8 }, { y: 188.4, height: 10.8 }, { y: 175.8, height: 12.6 }, { y: 118.1, height: 57.7 }] },
  { x: 176.0, centerX: 188.0, label: 'Apr', totalY: 128.6, total: '$21.1k', segments: [{ y: 200.4, height: 9.6 }, { y: 190.7, height: 9.7 }, { y: 180.0, height: 10.7 }, { y: 132.6, height: 47.4 }] },
  { x: 218.7, centerX: 230.7, label: 'May', totalY: 120.2, total: '$23.4k', segments: [{ y: 186.7, height: 23.3 }, { y: 160.1, height: 26.6 }, { y: 136.4, height: 23.7 }, { y: 124.2, height: 12.1 }] },
  { x: 261.3, centerX: 273.3, label: 'Jun', totalY: 126.5, total: '$21.7k', segments: [{ y: 193.0, height: 17.0 }, { y: 172.0, height: 21.1 }, { y: 153.7, height: 18.2 }, { y: 130.5, height: 23.2 }] },
  { x: 304.0, centerX: 316.0, label: 'Jul', totalY: 104.1, total: '$27.8k', segments: [{ y: 186.6, height: 23.4 }, { y: 157.0, height: 29.6 }, { y: 130.9, height: 26.1 }, { y: 108.1, height: 22.9 }] },
  { x: 346.7, centerX: 358.7, label: 'Aug', totalY: 90.8, total: '$31.4k', segments: [{ y: 180.8, height: 29.2 }, { y: 154.7, height: 26.1 }, { y: 124.1, height: 30.6 }, { y: 94.8, height: 29.2 }] },
  { x: 389.3, centerX: 401.3, label: 'Sep', totalY: 77.2, total: '$35.1k', segments: [{ y: 184.7, height: 25.3 }, { y: 137.4, height: 47.3 }, { y: 114.0, height: 23.4 }, { y: 81.2, height: 32.8 }] },
  { x: 432.0, centerX: 444.0, label: 'Oct', totalY: 41.2, total: '$44.9k', segments: [{ y: 175.7, height: 34.3 }, { y: 116.6, height: 59.1 }, { y: 87.2, height: 29.4 }, { y: 45.2, height: 42.0 }] },
  { x: 474.7, centerX: 486.7, label: 'Nov', totalY: 53.3, total: '$41.6k', segments: [{ y: 190.7, height: 19.3 }, { y: 137.3, height: 53.4 }, { y: 106.6, height: 30.7 }, { y: 57.3, height: 49.3 }] },
  { x: 517.3, centerX: 529.3, label: 'Dec', totalY: 142.2, total: '$17.4k', segments: [{ y: 192.3, height: 17.7 }, { y: 181.4, height: 10.9 }, { y: 166.0, height: 15.4 }, { y: 146.2, height: 19.8 }] },
  { x: 560.0, centerX: 572.0, label: 'Jan', totalY: 93.5, total: '$30.7k', segments: [{ y: 170.9, height: 39.1 }, { y: 138.3, height: 32.6 }, { y: 112.1, height: 26.2 }, { y: 97.5, height: 14.6 }] },
  { x: 602.7, centerX: 614.7, label: 'Feb', totalY: 16.0, total: '$51.8k', segments: [{ y: 145.0, height: 65.0 }, { y: 82.2, height: 62.8 }, { y: 47.2, height: 35.0 }, { y: 20.0, height: 27.2 }] },
  { x: 645.3, centerX: 657.3, label: 'Mar', totalY: 47.4, total: '$43.2k', segments: [{ y: 139.8, height: 70.2 }, { y: 97.1, height: 42.6 }, { y: 78.8, height: 18.3 }, { y: 51.4, height: 27.5 }] },
  { x: 688.0, centerX: 700.0, label: 'Apr', totalY: 58.7, total: '$40.2k', segments: [{ y: 132.3, height: 77.7 }, { y: 101.5, height: 30.8 }, { y: 94.7, height: 6.9 }, { y: 62.7, height: 32.0 }] },
]

type NbTrendGridLine = { y: number; label: string }

const NB_TREND_GRID_LINES: readonly NbTrendGridLine[] = [
  { y: 20.0, label: '$52k' },
  { y: 67.5, label: '$39k' },
  { y: 115.0, label: '$26k' },
  { y: 162.5, label: '$13k' },
  { y: 210.0, label: '$0k' },
]

type NbTrendLegendEntry = {
  /** Legend swatch X (text labels are offset by +17) */
  x: number
  color: string
  name: string
  cpl: string
}

const NB_TREND_LEGEND: readonly NbTrendLegendEntry[] = [
  { x: 0, color: 'rgb(59,130,246)', name: 'Marketing/Graphics', cpl: '$1,413 CPL' },
  { x: 160, color: 'rgb(168,85,247)', name: 'Developer/IT', cpl: '$1,636 CPL' },
  { x: 320, color: 'rgb(245,158,11)', name: 'Finance', cpl: '$2,676 CPL' },
  { x: 480, color: 'rgb(16,185,129)', name: 'Outsourcing', cpl: '$1,275 CPL' },
]

type AdGroupRow = {
  name: string
  spend: string
  cpl: string
  is: string
  /** Visual treatment of the row */
  variant: 'default' | 'rose' | 'muted'
  /** Override colour for the CPL cell when row is `default` */
  cplColor?: 'emerald' | 'slate'
  /** Override colour for the IS cell when row is `default` */
  isColor?: 'amber' | 'slate' | 'muted'
}

type AdGroupCategory = {
  name: string
  spendTotal: string
  cpl: string
  rows: readonly AdGroupRow[]
  opportunity: ReactNode
}

const AD_GROUP_CATEGORIES: readonly AdGroupCategory[] = [
  {
    name: 'Marketing/Graphics',
    spendTotal: '$114K',
    cpl: '$1,413 CPL',
    rows: [
      { name: 'Digital Marketing Specialist', spend: '$25,555', cpl: '$1,127', is: '<10%', variant: 'default', cplColor: 'emerald', isColor: 'amber' },
      { name: 'Social Media Specialist', spend: '$18,564', cpl: '$4,641', is: '<10%', variant: 'rose' },
      { name: '3D Animator', spend: '$16,563', cpl: '$1,035', is: '<10%', variant: 'default', cplColor: 'emerald', isColor: 'amber' },
      { name: 'Game Designer', spend: '$12,693', cpl: '$2,539', is: '<10%', variant: 'rose' },
      { name: 'Graphic Designer', spend: '$6,950', cpl: '$1,158', is: '11.7%', variant: 'default', cplColor: 'emerald', isColor: 'slate' },
      { name: 'Content Writer', spend: '$6,394', cpl: '$913', is: '<10%', variant: 'default', cplColor: 'emerald', isColor: 'amber' },
      { name: 'PPC/SEM Specialist', spend: '$4,965', cpl: '$1,655', is: '<10%', variant: 'default', cplColor: 'slate', isColor: 'muted' },
      { name: 'SEO Specialist', spend: '$4,450', cpl: '$1,112', is: '<10%', variant: 'default', cplColor: 'emerald', isColor: 'amber' },
      { name: 'UX/UI Designer', spend: '$3,983', cpl: '$3,983', is: '<10%', variant: 'rose' },
      { name: 'Video Editor', spend: '$2,158', cpl: '$360', is: '24.3%', variant: 'default', cplColor: 'emerald', isColor: 'slate' },
      { name: 'Other (Generic, Media, Graphic Designers, Generic Marketing)', spend: '$11,729', cpl: '$2,346', is: '<10%', variant: 'rose' },
    ],
    opportunity: (
      <>
        <span className="font-semibold">Opportunity:</span> Digital Marketing Specialist, 3D Animator,
        Content Writer &amp; SEO Specialist all convert below average with &lt;10% impression share -
        clear headroom to scale.
      </>
    ),
  },
  {
    name: 'Developer/IT',
    spendTotal: '$113K',
    cpl: '$1,636 CPL',
    rows: [
      { name: 'IT Services', spend: '$34,698', cpl: '$1,157', is: '<10%', variant: 'default', cplColor: 'emerald', isColor: 'amber' },
      { name: 'App Developer', spend: '$21,195', cpl: '$2,355', is: '<10%', variant: 'rose' },
      { name: 'Software developers', spend: '$14,306', cpl: '$1,192', is: '<10%', variant: 'default', cplColor: 'emerald', isColor: 'amber' },
      { name: 'Full Stack Developer', spend: '$12,946', cpl: '$2,158', is: '10.5%', variant: 'rose' },
      { name: 'eCom Developer', spend: '$7,521', cpl: '$2,507', is: '<10%', variant: 'rose' },
      { name: 'Front end Developer', spend: '$5,186', cpl: '$1,729', is: '<10%', variant: 'default', cplColor: 'slate', isColor: 'muted' },
      { name: 'Data Engineer', spend: '$4,216', cpl: '$4,216', is: '<10%', variant: 'rose' },
      { name: 'Back end Developer', spend: '$3,961', cpl: '$1,981', is: '<10%', variant: 'default', cplColor: 'slate', isColor: 'muted' },
      { name: 'Data Analyst', spend: '$3,241', cpl: '$1,389', is: '<10%', variant: 'default', cplColor: 'slate', isColor: 'muted' },
      { name: 'DevOps Engineer', spend: '$2,334', cpl: '$2,334', is: '<10%', variant: 'rose' },
      { name: 'Other (QA/QC, Cloud Engineer, Sys Admin, Prompt Engineers)', spend: '$3,818', cpl: '0 conv', is: '<10%', variant: 'rose' },
    ],
    opportunity: (
      <>
        <span className="font-semibold">Opportunity:</span> IT Services ($1,157 CPL, &lt;10% IS) &amp;
        Software developers ($1,192 CPL) are the clear winners - scale these and pause the high-CPL
        outliers (App Dev, eCom Dev, Data Engineer, DevOps).
      </>
    ),
  },
  {
    name: 'Finance',
    spendTotal: '$71K',
    cpl: '$2,676 CPL',
    rows: [
      { name: 'Payroll Specialists', spend: '$18,145', cpl: '$3,629', is: '<10%', variant: 'rose' },
      { name: 'Generic - Financial', spend: '$14,144', cpl: '$2,829', is: '<10%', variant: 'rose' },
      { name: 'Bookkeeper', spend: '$12,558', cpl: '$3,140', is: '<10%', variant: 'rose' },
      { name: 'Accounts Payable', spend: '$10,780', cpl: '$4,312', is: '<10%', variant: 'rose' },
      { name: 'Accounts Receivable', spend: '$8,887', cpl: '$1,270', is: '<10%', variant: 'default', cplColor: 'emerald', isColor: 'amber' },
      { name: 'Accountant', spend: '$5,614', cpl: '$1,871', is: '<10%', variant: 'default', cplColor: 'slate', isColor: 'muted' },
      { name: 'Finance - Industry', spend: '$795', cpl: '0 conv', is: '<10%', variant: 'rose' },
    ],
    opportunity: (
      <>
        <span className="font-semibold">Opportunity:</span> Only Accounts Receivable ($1,270 CPL,
        &lt;10% IS) is performing - scale this aggressively and consider pausing the rest while the
        category is restructured.
      </>
    ),
  },
  {
    name: 'Outsourcing',
    spendTotal: '$87K',
    cpl: '$1,275 CPL',
    rows: [
      { name: 'outsourcing', spend: '$76,864', cpl: '$1,240', is: '10.8%', variant: 'default', cplColor: 'emerald', isColor: 'slate' },
      { name: 'back office outsourcing', spend: '$5,994', cpl: '$1,090', is: '<10%', variant: 'default', cplColor: 'emerald', isColor: 'amber' },
      { name: 'bpo', spend: '$2,912', cpl: '$2,912', is: '<10%', variant: 'rose' },
      { name: 'rpo', spend: '$1,099', cpl: '0 conv', is: '<10%', variant: 'rose' },
      { name: 'philippines', spend: '$380', cpl: '0 conv', is: '10.7%', variant: 'muted' },
    ],
    opportunity: (
      <>
        <span className="font-semibold">Opportunity:</span> 2 winners (outsourcing, back office
        outsourcing) both below average CPL with only ~10% IS - significant room to scale once Quality
        Score is improved.
      </>
    ),
  },
]

type SearchTermRow = {
  term: string
  spend: string
  conv: string
  cpl: string
  budgetLimited: string
  /** When `false`, render the budget-limited cell in muted slate rather than amber. */
  budgetLimitedHighlight?: boolean
}

const SEARCH_TERM_TOP_ROWS: readonly SearchTermRow[] = [
  { term: 'offshore staff', spend: '$491', conv: '1', cpl: '$491', budgetLimited: 'Yes (29%)' },
  { term: 'offshore admin', spend: '$345', conv: '1', cpl: '$345', budgetLimited: 'Yes (29%)' },
  { term: 'offshore accounting', spend: '$264', conv: '1', cpl: '$264', budgetLimited: 'Yes (31%)' },
  { term: 'outsourcing admin work', spend: '$239', conv: '1', cpl: '$239', budgetLimited: 'Yes (47%)' },
  { term: 'outsourcing graphic design', spend: '$151', conv: '1', cpl: '$151', budgetLimited: 'Yes (29%)' },
  { term: 'hire commission sales people', spend: '$150', conv: '1', cpl: '$150', budgetLimited: 'Yes (29%)' },
  { term: 'offshore staffing', spend: '$127', conv: '1', cpl: '$127', budgetLimited: 'Yes (47%)' },
  { term: 'digital marketing agency brisbane', spend: '$94', conv: '1', cpl: '$94', budgetLimited: 'Yes (32%)' },
  { term: 'website developers adelaide', spend: '$91', conv: '1', cpl: '$91', budgetLimited: 'Yes (32%)' },
  { term: 'hire marketing expert', spend: '$84', conv: '1', cpl: '$84', budgetLimited: 'Yes (29%)' },
  { term: 'overseas software development', spend: '$80', conv: '1', cpl: '$80', budgetLimited: 'Yes (29%)' },
  { term: 'outsource payroll australia', spend: '$79', conv: '1', cpl: '$79', budgetLimited: 'Yes (31%)' },
  { term: '3d animator hire', spend: '$69', conv: '1', cpl: '$69', budgetLimited: 'Yes (30%)' },
  { term: 'offshore mvp reviews', spend: '$69', conv: '1', cpl: '$69', budgetLimited: 'Yes (29%)' },
  { term: 'blog writer', spend: '$74', conv: '1', cpl: '$74', budgetLimited: 'Yes (30%)' },
  { term: 'offshore development', spend: '$42', conv: '1', cpl: '$42', budgetLimited: 'Yes (23%)' },
  { term: 'hire online graphic designer', spend: '$32', conv: '1', cpl: '$32', budgetLimited: 'Yes (32%)' },
  { term: 'indian web developer', spend: '$28', conv: '1', cpl: '$28', budgetLimited: 'Yes (29%)' },
  { term: 'graphic design brisbane', spend: '$25', conv: '1', cpl: '$25', budgetLimited: 'Yes (32%)' },
  { term: 'offshore digital marketing services', spend: '$25', conv: '1', cpl: '$25', budgetLimited: 'No (1%)', budgetLimitedHighlight: false },
]

type NegativePatternRow = {
  label: string
  detail: string
  examples: string
  wasted: string
  terms: string
}

const NEGATIVE_PATTERN_ROWS: readonly NegativePatternRow[] = [
  {
    label: 'Unrelated brands',
    detail: ' (Shopify, Gusto, eBay, Quickbooks)',
    examples: 'shopify $405 / 26cl  ·  gusto payroll provider $384  ·  help shopify com $204  ·  shopify website builder $159',
    wasted: '$4,297',
    terms: '60',
  },
  {
    label: 'Non-target geos',
    detail: ' (US states, NZ, UK cities)',
    examples: 'payroll companies in texas $916  ·  payroll companies in arizona $202  ·  payroll companies in florida $140  ·  seo company nz $125',
    wasted: '$2,689',
    terms: '27',
  },
  {
    label: '"near me"',
    detail: ' (matches Australian US shoppers + irrelevant geos)',
    examples: 'bookkeeper near me $197  ·  it experts near me $144  ·  graphic designer near me $122',
    wasted: '$2,324',
    terms: '38',
  },
  {
    label: 'Jobs / careers / salary',
    detail: '',
    examples: 'remote jobs $355 / 10cl  ·  online jobs $81  ·  remote jobs australia $75  ·  remote work $62',
    wasted: '$1,267',
    terms: '19',
  },
  {
    label: 'Reviews',
    detail: ' (research intent, low buyer signal)',
    examples: 'supportninja reviews $136  ·  stealth agents reviews $123  ·  virtual receptionist australia reviews $122',
    wasted: '$984',
    terms: '14',
  },
  {
    label: 'Informational / how-to',
    detail: '',
    examples: 'how do i make an app for free $40  ·  how do you make a game $34',
    wasted: '$75',
    terms: '2',
  },
]

type LandingPageRow = {
  path: string
  href: string
  spend: string
  clicks: string
  conv: string
  cpl: string
  /** Colour treatment for the CPL cell */
  cplTone: 'rose' | 'amber' | 'emerald'
}

const LANDING_PAGE_ROWS: readonly LandingPageRow[] = [
  {
    path: '/how-it-works/',
    href: 'https://awaydigitalteams.com/how-it-works/',
    spend: '$23,826',
    clicks: '1,047',
    conv: '4',
    cpl: '$5,956',
    cplTone: 'rose',
  },
  {
    path: '/our-services/outsource-app-development/',
    href: 'https://awaydigitalteams.com/our-services/outsource-app-development/',
    spend: '$10,075',
    clicks: '240',
    conv: '1',
    cpl: '$10,075',
    cplTone: 'rose',
  },
  {
    path: '/our-services/outsource-admin-assistants/',
    href: 'https://awaydigitalteams.com/our-services/outsource-admin-assistants/',
    spend: '$11,671',
    clicks: '395',
    conv: '4',
    cpl: '$2,918',
    cplTone: 'rose',
  },
  {
    path: '/our-services/hiring-full-stack-developers/',
    href: 'https://awaydigitalteams.com/our-services/hiring-full-stack-developers/',
    spend: '$10,390',
    clicks: '544',
    conv: '6',
    cpl: '$1,732',
    cplTone: 'amber',
  },
  {
    path: '/our-services/information-technology-functions/',
    href: 'https://awaydigitalteams.com/our-services/information-technology-functions/',
    spend: '$36,488',
    clicks: '3,434',
    conv: '28',
    cpl: '$1,303',
    cplTone: 'amber',
  },
  {
    path: '/contact/',
    href: 'https://awaydigitalteams.com/contact/',
    spend: '$22,536',
    clicks: '769',
    conv: '40',
    cpl: '$563',
    cplTone: 'emerald',
  },
  {
    path: '/ (homepage)',
    href: 'https://awaydigitalteams.com/',
    spend: '~$36,700',
    clicks: '1,869',
    conv: '37',
    cpl: '$992',
    cplTone: 'emerald',
  },
]

type ScoringMethodologyCard = {
  /** Step number (1-13) */
  n: number
  /** Category name */
  name: string
  /** Weight (importance) */
  weight: number
  /** Score (0-10) */
  score: number
  /** Tailwind class for the score colour */
  scoreClass: string
  /** Short description of what this step covers */
  desc: string
}

const SCORING_METHODOLOGY_CARDS: readonly ScoringMethodologyCard[] = [
  {
    n: 1,
    name: 'Website & business analysis',
    weight: 5,
    score: 5,
    scoreClass: 'text-amber-500',
    desc: 'Site readiness to convert paid traffic: landing page quality, CTA clarity, conversion paths, and category-specific pages.',
  },
  {
    n: 2,
    name: 'Account structure overview',
    weight: 8,
    score: 8,
    scoreClass: 'text-lime-600',
    desc: 'Campaign hierarchy, budget allocation logic, ad group organisation, and whether the structure supports effective bidding.',
  },
  {
    n: 3,
    name: 'Keyword & search intent',
    weight: 10,
    score: 3,
    scoreClass: 'text-red-500',
    desc: 'Match type distribution, search intent alignment, keyword relevance, and spend on irrelevant or non-converting terms.',
  },
  {
    n: 4,
    name: 'Tracking & measurement setup',
    weight: 12,
    score: 8,
    scoreClass: 'text-lime-600',
    desc: 'Conversion action setup, GA4 integration, enhanced conversions, attribution, and conversion signal quality for bidding.',
  },
  {
    n: 5,
    name: 'Campaign structure analysis',
    weight: 8,
    score: 8,
    scoreClass: 'text-lime-600',
    desc: 'Budget allocation vs performance, geo-targeting, device adjustments, ad scheduling, and bid strategy alignment.',
  },
  {
    n: 6,
    name: 'Channel performance',
    weight: 8,
    score: 7,
    scoreClass: 'text-lime-600',
    desc: 'ROAS & CPL across Search, Display, PMax, Shopping; cross-channel cannibalisation; budget flow to best performers.',
  },
  {
    n: 7,
    name: 'Search query analysis',
    weight: 10,
    score: 7,
    scoreClass: 'text-lime-600',
    desc: 'Actual queries triggering ads: relevance %, wasted query spend, intent alignment, and YoY search term quality.',
  },
  {
    n: 8,
    name: 'Negative keyword management',
    weight: 7,
    score: 10,
    scoreClass: 'text-green-500',
    desc: 'Negative keyword coverage, themed list organisation, regular addition history, and estimated preventable waste.',
  },
  {
    n: 9,
    name: 'Ad copy & assets review',
    weight: 8,
    score: 10,
    scoreClass: 'text-green-500',
    desc: 'RSA quality, pin strategy, ad strength scores, extension coverage, and landing page relevance per ad group.',
  },
  {
    n: 10,
    name: 'Brand vs generic split',
    weight: 10,
    score: 8,
    scoreClass: 'text-lime-600',
    desc: 'Three-way segmentation (brand / brand+ / generic), per-tier bidding, incrementality, and competitor brand bidding.',
  },
  {
    n: 11,
    name: 'Historical performance',
    weight: 7,
    score: 5,
    scoreClass: 'text-amber-500',
    desc: 'Monthly spend, conversions, CPL, ROAS trends since account start. Identifies trajectory, seasonality, inflection points.',
  },
  {
    n: 12,
    name: 'Audience strategy',
    weight: 5,
    score: 10,
    scoreClass: 'text-green-500',
    desc: 'Remarketing coverage, customer match & first-party data, in-market audience targeting, and bid adjustments.',
  },
  {
    n: 13,
    name: 'Competitive landscape',
    weight: 5,
    score: 3,
    scoreClass: 'text-red-500',
    desc: 'Auction insights per campaign (impression share, overlap rate, outranking share), competitor ad benchmarking, strategic positioning.',
  },
]

function landingPageCplClass(tone: LandingPageRow['cplTone']): string {
  if (tone === 'rose') return 'text-right py-2 pl-2 tabular-nums font-bold text-rose-700'
  if (tone === 'amber') return 'text-right py-2 pl-2 tabular-nums font-semibold text-amber-700'
  return 'text-right py-2 pl-2 tabular-nums font-semibold text-emerald-700'
}

function adGroupNameClass(variant: AdGroupRow['variant']): string {
  if (variant === 'rose') return 'py-1 px-2 font-semibold text-rose-700'
  if (variant === 'muted') return 'py-1 px-2 text-slate-500'
  return 'py-1 px-2 text-slate-700'
}

function adGroupSpendClass(variant: AdGroupRow['variant']): string {
  if (variant === 'rose') return 'text-right py-1 px-2 tabular-nums font-semibold text-rose-700'
  if (variant === 'muted') return 'text-right py-1 px-2 tabular-nums text-slate-500'
  return 'text-right py-1 px-2 tabular-nums text-slate-700'
}

function adGroupCplClass(row: AdGroupRow): string {
  if (row.variant === 'rose') return 'text-right py-1 px-2 tabular-nums font-semibold text-rose-700'
  if (row.variant === 'muted') return 'text-right py-1 px-2 tabular-nums text-slate-500'
  if (row.cplColor === 'emerald') return 'text-right py-1 px-2 tabular-nums font-semibold text-emerald-700'
  return 'text-right py-1 px-2 tabular-nums text-slate-700'
}

function adGroupIsClass(row: AdGroupRow): string {
  if (row.variant === 'rose') return 'text-right py-1 pl-2 pr-3 tabular-nums text-slate-500'
  if (row.variant === 'muted') return 'text-right py-1 pl-2 pr-3 tabular-nums text-slate-500'
  if (row.isColor === 'amber') return 'text-right py-1 pl-2 pr-3 tabular-nums font-semibold text-amber-700'
  if (row.isColor === 'muted') return 'text-right py-1 pl-2 pr-3 tabular-nums text-slate-500'
  return 'text-right py-1 pl-2 pr-3 tabular-nums text-slate-700'
}

export default function AwayDigitalAuditPage() {
  return (
    <AuditPasswordGate
      auditSlug="away-digital/google-ads-audit"
      businessName="Away Digital Teams"
      featureLabel="Google Ads Audit"
    >
      <div className="fixed top-0 left-0 right-0 h-1 bg-slate-200 z-50">
        <div
          id="progress-bar"
          className="h-full bg-blue-600 transition-all"
          style={{ width: '0%' }}
        />
      </div>

      <main className="flex flex-col-reverse">
        <section
          id="cover"
          data-label="Cover"
          className="cover-v2 relative min-h-screen flex flex-col"
        >
          <Starfield id="cover-starfield" />
          <div
            className="orbit-deco"
            style={{ width: '1100px', height: '1100px', right: '-380px', top: '-300px' }}
          />
          <div
            className="orbit-deco"
            style={{
              width: '720px',
              height: '720px',
              right: '-160px',
              top: '-80px',
              borderColor: 'rgba(77,148,255,0.1)',
            }}
          />
          <div className="relative z-10 px-8 md:px-12 pt-10 w-full">
            <div className="flex items-center gap-3">
              <span className="cover-dot" aria-hidden="true" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/optimise-digital-logo-white.webp"
                alt="Optimise Digital"
                className="w-auto h-[22.8px] md:h-[30.4px]"
              />
            </div>
          </div>
          <div className="relative z-10 flex-1 flex flex-col justify-center px-8 md:px-12 pb-12 w-full -mt-[20px]">
            <div className="flex flex-col items-start gap-5 text-left max-w-3xl">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="cover-pill">Google Ads Account Audit</span>
                <span className="cover-meta">January 2025 &ndash; April 2026</span>
              </div>
              <h1 className="cover-h1 text-4xl md:text-6xl">Away Digital Teams</h1>
              <p
                className="text-base md:text-lg text-white/70 max-w-2xl leading-snug"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                A deep-dive Google Ads audit and optimisation plan to reverse rising CPL
                and improve lead volume.
              </p>
            </div>
          </div>
          <a
            href="#tldr"
            className="absolute z-10 bottom-6 left-8 md:left-12 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 transition-colors cursor-pointer"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            <span
              className="text-[11px] font-medium tracking-widest uppercase"
              style={{ color: 'var(--purple-soft)' }}
            >
              TL;DR
            </span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: 'var(--purple-soft)' }}
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </a>
        </section>

        <section id="tldr" className="relative min-h-screen flex flex-col bg-white">
          <div className="flex-1 flex flex-col justify-center px-6 pt-10 pb-8 max-w-5xl mx-auto w-full">
            <div className="mb-4 max-w-5xl mx-auto w-full">
              <p className="text-blue-500 font-semibold text-sm uppercase tracking-widest mb-1">TL;DR</p>
              <h2 className="text-xl md:text-2xl font-bold text-slate-900">The audit, in one slide</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-0.5">Account health</div>
                <p className="text-[12px] text-slate-700 leading-snug">Spend has 4×'d to ~$50K/mo, but CPL has risen alongside it. Reliable conversion tracking only started June 2025, so meaningful CPL data covers Jun'25–Apr'26.</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-0.5">Keyword categories</div>
                <p className="text-[12px] text-slate-700 leading-snug">73.5% of spend goes to Job Titles ($1,678 CPL) vs 21.7% on Generic-Outsourcing ($1,275 CPL). Budget should shift toward generic.</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-0.5">Campaign categories</div>
                <p className="text-[12px] text-slate-700 leading-snug">Outsourcing has the best CPL ($1,275) but only 10% impression share. Finance is the worst performer at $2,676 CPL and needs pausing or fixing before scaling.</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-0.5">Roles in the AI era</div>
                <p className="text-[12px] text-slate-700 leading-snug">Many heavily-bid roles (e.g. Front-End Developer) are increasingly automatable with AI. Spend should shift toward roles where human judgment still wins (e.g. Accountant).</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-0.5">Search terms</div>
                <p className="text-[12px] text-slate-700 leading-snug">Some keywords need more budget. Others need to be cut. Significant patterns of wasted spend identified and ready to block.</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-0.5">Landing pages</div>
                <p className="text-[12px] text-slate-700 leading-snug">A few high-spend pages (e.g. /how-it-works/) convert poorly and drag CPL up. Intent-to-page mismatch is a quick win.</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-0.5">AI Overviews</div>
                <p className="text-[12px] text-slate-700 leading-snug">AI Overviews aren't why paid CPL is high. The paid issues are structural — match types, Quality Score, brand cannibalisation, fragmented campaigns.</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-0.5">Recommendations</div>
                <p className="text-[12px] text-slate-700 leading-snug">11 priorities identified across budget allocation, match types, negatives, brand bidding, landing pages and Quality Score. Detail covered in the engagement.</p>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 md:col-span-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 mb-0.5">The opportunity</div>
                <p className="text-[12px] text-slate-700 leading-snug">Reducing CPL from $1,373 to $1,150 at the same $50K/mo spend unlocks ~85 additional leads/year (~437 → ~522). Quick wins land in 1–3 weeks.</p>
              </div>
            </div>
          </div>
          <div className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none" aria-hidden="true">2 / 15</div>
        </section>
        <section
          id="account-glance"
          data-label="Account at a glance"
          className="relative min-h-screen flex flex-col bg-white"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-5 pb-2 max-w-5xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-3 max-w-4xl mx-auto text-slate-900">
              Let&rsquo;s get context around the rising cost per lead
            </h2>
            <AccountGlanceChart />
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            3 / 15
          </div>
        </section>
        <section
          id="audit-score"
          data-label="Audit score"
          className="relative min-h-screen flex flex-col bg-white"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-8 max-w-5xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-2 text-slate-900">
              Google Ads account audit score
            </h2>
            <p className="text-center text-sm md:text-base pb-5 max-w-3xl mx-auto text-slate-500">
              Assessed across 13 areas. Well-managed accounts typically score 65&ndash;80.
            </p>
            <div className="flex flex-col md:flex-row items-center md:items-start gap-8 max-w-4xl mx-auto w-full">
              {/* Score ring */}
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div className="relative inline-flex items-center justify-center">
                  <svg width="140" height="140" className="-rotate-90">
                    <circle
                      cx="70"
                      cy="70"
                      r="54"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="10"
                      className="text-slate-200"
                    />
                    <circle
                      cx="70"
                      cy="70"
                      r="54"
                      fill="none"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray="339.292"
                      strokeDashoffset="98.395"
                      className="stroke-lime-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold text-slate-900">71</span>
                    <span className="text-xs text-slate-500">/ 100</span>
                  </div>
                </div>
                <span className="text-sm font-semibold text-lime-600">Room for improvement</span>
              </div>
              {/* Step bars, sorted worst -> best */}
              <div className="flex-1 w-full space-y-2">
                {AUDIT_SCORE_BARS.map((bar) => (
                  <div key={bar.step} className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 w-5 text-right shrink-0">{bar.step}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium text-slate-700 truncate">{bar.label}</span>
                        <span className={`text-xs font-semibold ml-2 shrink-0 ${bar.scoreColor}`}>
                          {bar.score}/10
                        </span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${bar.barColor}`}
                          style={{ width: `${bar.score * 10}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 max-w-4xl mx-auto w-full md:pl-[184px]">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs text-slate-700">
                  <span className="font-bold text-amber-700">Caveat:</span> the 13-step engine grades
                  structural items e.g. do negative keyword lists exist, etc. Some categories look
                  stronger than they really are &mdash; e.g. negative-keyword management scores 10/10
                  because lists exist, but our deeper review found ~$1.8K of irrelevant queries still
                  hitting the account in Apr 2026 alone.
                </p>
              </div>
            </div>
            <div className="mt-3 text-center">
              <a
                href="#appendix"
                className="text-xs text-blue-600 hover:text-blue-700 underline underline-offset-2"
              >
                How is each category scored?
              </a>
            </div>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            4 / 15
          </div>
        </section>
        <section
          id="category-breakdown"
          data-label="Category breakdown"
          className="relative min-h-screen flex flex-col bg-white"
        >
          <div className="flex-1 flex flex-col justify-center px-4 pt-5 pb-3 max-w-5xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-3 max-w-4xl mx-auto text-slate-900">
              Cut CPL by shifting budget to the right keywords
            </h2>
            <p className="text-center text-xs md:text-xs pb-[10px] max-w-3xl mx-auto text-slate-400"></p>
            <div className="max-w-4xl mx-auto w-full">
              <div className="bg-white rounded-lg p-4 border border-slate-200 mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Keyword categories
                </p>
                <svg
                  id="chart-svg"
                  viewBox="0 0 760 135"
                  className="w-full h-auto"
                  xmlns="http://www.w3.org/2000/svg"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <line x1="210" x2="210" y1="8" y2="100" stroke="rgb(15,23,42)" strokeWidth="1.5" />
                  <text x="160" y="30" textAnchor="end" fontSize="13" fontWeight="700" fill="rgb(168,85,247)">
                    Job Titles
                  </text>
                  <text x="166" y="30" fontSize="13" fontWeight="700" fill="rgb(168,85,247)">
                    73.5%
                  </text>
                  <rect x="210" y="12" width="425" height="36" fill="rgb(168,85,247)" opacity="0.8" rx="4" />
                  <text x="422" y="34" textAnchor="middle" fontSize="13" fontWeight="700" fill="white">
                    $1,678 CPL
                  </text>
                  <text x="645" y="34" fontSize="12" fill="rgb(71,85,105)">
                    $322,598 spend
                  </text>
                  <text x="160" y="78" textAnchor="end" fontSize="13" fontWeight="700" fill="rgb(16,185,129)">
                    Generic-Outsourcing
                  </text>
                  <text x="166" y="78" fontSize="13" fontWeight="700" fill="rgb(16,185,129)">
                    21.7%
                  </text>
                  <rect x="210" y="60" width="125.6" height="36" fill="rgb(16,185,129)" opacity="0.8" rx="4" />
                  <text x="272.8" y="82" textAnchor="middle" fontSize="12" fontWeight="700" fill="white">
                    $1,275 CPL
                  </text>
                  <text x="345" y="82" fontSize="12" fill="rgb(71,85,105)">
                    $95,271 spend
                  </text>
                  <text x="722" y="125" textAnchor="end" fontSize="10" fill="rgb(148,163,184)">
                    Jun 2025 – Apr 2026
                  </text>
                </svg>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-purple-700 mb-1">
                    Job Titles: 73.5% of total spend
                  </div>
                  <p className="text-sm text-slate-800">
                    <span className="font-bold">$1,678 CPL.</span> Now consuming nearly half the monthly budget, up
                    sharply from mid-2025. Negative keyword discipline is the single biggest lever available. Top
                    spend keywords:{' '}
                    <span className="italic text-slate-500">
                      &ldquo;3d animator for hire&rdquo;, &ldquo;digital marketing specialist&rdquo;, &ldquo;full stack
                      developer&rdquo;
                    </span>
                    .
                  </p>
                  <div className="mt-2 pt-2 border-t border-purple-200">
                    <div className="text-[10px] text-purple-700 font-semibold mb-1">Monthly spend: then vs now</div>
                    <div className="grid grid-cols-2 gap-x-3">
                      <div>
                        <div className="text-[9px] text-slate-500">Jun-Aug 25</div>
                        <div className="text-[10px] text-slate-700">$15K / $22K / $23K</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-500">Feb-Apr 26</div>
                        <div className="text-[10px] text-slate-700">$45K / $36K / $31K</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-1">
                    Generic-Outsourcing: 21.7% of total spend
                  </div>
                  <p className="text-sm text-slate-800">
                    <span className="font-bold">$1,275 CPL.</span> Most intent-aligned category. Steadily growing and
                    still has room to scale. Top spend keywords:{' '}
                    <span className="italic text-slate-500">
                      &quot;outsourcing companies&quot;, &quot;outsourcing company&quot;, &quot;it outsourcing&quot;
                    </span>
                    .
                  </p>
                  <div className="mt-2 pt-2 border-t border-emerald-200">
                    <div className="text-[10px] text-emerald-700 font-semibold mb-1">Monthly spend: then vs now</div>
                    <div className="grid grid-cols-2 gap-x-3">
                      <div>
                        <div className="text-[9px] text-slate-500">Jun-Aug 25</div>
                        <div className="text-[10px] text-slate-700">$6K / $6K / $8K</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-500">Feb-Apr 26</div>
                        <div className="text-[10px] text-slate-700">$9K / $11K / $10K</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-700 whitespace-nowrap overflow-hidden text-ellipsis">
                  <span className="font-bold text-slate-900">Recommendation:</span> shift budget from{' '}
                  <span className="font-bold text-purple-600">Job Titles ($1,678 CPL)</span> toward{' '}
                  <span className="font-bold text-emerald-600">Generic-Outsourcing ($1,275 CPL)</span> &mdash; more
                  intent-aligned.
                </p>
              </div>
            </div>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            5 / 15
          </div>
        </section>
        <section
          id="nb-trend"
          data-label="Non-brand trend"
          className="relative min-h-screen flex flex-col bg-slate-50"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-20 pb-12 max-w-5xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-2 max-w-4xl mx-auto text-slate-900">
              Which campaign category is pulling its weight and which one isn&rsquo;t
            </h2>
            <p className="text-center text-sm text-slate-500 mb-4 max-w-3xl mx-auto">
              <span className="font-semibold text-slate-900">Recommendation:</span> shift budget toward{' '}
              <span className="font-semibold text-teal-700">Outsourcing</span> ($1,275 CPL) and{' '}
              <span className="font-semibold text-blue-500">Marketing/Graphics</span> ($1,413 CPL); pause or fix{' '}
              <span className="font-semibold text-orange-700">Finance</span> ($2,676 CPL) before scaling.
            </p>
            <div className="max-w-4xl mx-auto w-full">
              <div className="bg-white rounded-lg p-4 border border-slate-200 mb-4">
                <svg
                  id="chart-svg-nb"
                  viewBox="0 0 760 280"
                  className="w-full h-auto"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <g>
                    {NB_TREND_GRID_LINES.map((line) => (
                      <g key={line.label}>
                        <line
                          x1="60"
                          x2="700"
                          y1={line.y}
                          y2={line.y}
                          stroke="rgb(226,232,240)"
                          strokeDasharray="2,3"
                          strokeWidth="1"
                        />
                        <text x="56" y={line.y + 4} textAnchor="end" fontSize="10" fill="rgb(100,116,139)">
                          {line.label}
                        </text>
                      </g>
                    ))}
                  </g>
                  <g>
                    {NB_TREND_MONTHS.map((month) =>
                      month.segments.map((seg, segIdx) => (
                        <rect
                          key={`${month.x}-${segIdx}`}
                          x={month.x}
                          y={seg.y}
                          width="24"
                          height={seg.height}
                          fill={NB_TREND_SEGMENT_COLORS[segIdx]}
                          opacity="0.85"
                          rx="1"
                        />
                      )),
                    )}
                  </g>
                  <g>
                    {NB_TREND_MONTHS.map((month, idx) => (
                      <text
                        key={`month-${idx}`}
                        x={month.centerX}
                        y="228"
                        textAnchor="middle"
                        fontSize="9"
                        fill="rgb(100,116,139)"
                        transform={`rotate(-45 ${month.centerX} 228)`}
                      >
                        {month.label}
                      </text>
                    ))}
                  </g>
                  <g>
                    {NB_TREND_MONTHS.map((month, idx) => (
                      <text
                        key={`total-${idx}`}
                        x={month.centerX}
                        y={month.totalY}
                        textAnchor="middle"
                        fontSize="8"
                        fill="rgb(100,116,139)"
                      >
                        {month.total}
                      </text>
                    ))}
                  </g>
                  <g transform="translate(80, 248)">
                    {NB_TREND_LEGEND.map((entry) => (
                      <g key={entry.name}>
                        <rect x={entry.x} y="0" width="12" height="12" fill={entry.color} rx="2" />
                        <text
                          x={entry.x + 17}
                          y="10"
                          fontSize="10"
                          fontWeight="600"
                          fill="rgb(51,65,85)"
                        >
                          {entry.name}
                        </text>
                        <text
                          x={entry.x + 17}
                          y="24"
                          fontSize="10"
                          fontWeight="700"
                          fill={entry.color}
                        >
                          {entry.cpl}
                        </text>
                      </g>
                    ))}
                  </g>
                </svg>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                    Marketing/Graphics is the growth engine
                  </div>
                  <div className="text-sm font-bold text-blue-600 mb-1">$1,413 CPL</div>
                  <p className="text-sm text-slate-800">
                    Spend has grown from $1K/month (Jan 2025) to $21K/month (Apr 2026) &mdash; a 21x increase. This
                    category now consumes 50% of non-brand spend. CPL is near account average, suggesting the scale
                    is justified by volume.
                  </p>
                </div>
                <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-violet-700">
                    Developer/IT: second largest, most volatile
                  </div>
                  <div className="text-sm font-bold text-violet-700 mb-1">$1,636 CPL</div>
                  <p className="text-sm text-slate-800">
                    $129,801 all-time spend (43% of total NB). Nov 2025 peak at $14,553 &mdash; driven by
                    end-of-year IT budget flush. CPL is the highest of the four main categories.
                  </p>
                </div>
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-orange-700">
                    Finance: the account&rsquo;s worst performer
                  </div>
                  <div className="text-sm font-bold text-orange-700 mb-1">$2,676 CPL</div>
                  <p className="text-sm text-slate-800">
                    $91,248 all-time spend, only 26.5 conversions post-Jun &mdash; nearly double the account
                    average. Finance category needs a dedicated strategy or budget reallocation.
                  </p>
                </div>
                <div className="rounded-lg border border-teal-200 bg-teal-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-teal-700">
                    Outsourcing: shrinking, but room to grow
                  </div>
                  <div className="text-sm font-bold text-teal-700 mb-1">$1,275 CPL</div>
                  <p className="text-sm text-slate-800">
                    Best CPL of the four, but only <strong>10% impression share</strong> &mdash; losing volume to
                    budget caps and low Quality Score. Fix QS, then scale.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            6 / 15
          </div>
        </section>
        <section
          id="ad-group-breakdown"
          data-label="Ad group breakdown"
          className="relative min-h-screen flex flex-col bg-white"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-12 max-w-6xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-1 max-w-4xl mx-auto text-slate-900">
              A deeper dive into specific roles and where the quick wins are for better CPL
            </h2>
            <p className="text-center text-xs text-slate-500 mb-4">
              Spend, CPL &amp; search impression share (IS) per ad group, by campaign category.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {AD_GROUP_CATEGORIES.map((category) => (
                <div
                  key={category.name}
                  className="rounded-lg border border-blue-200 bg-white overflow-hidden flex flex-col"
                >
                  <div className="px-3 py-1.5 bg-blue-50 border-b border-blue-200 flex items-baseline justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                      {category.name}
                    </div>
                    <div className="text-xs text-slate-600">
                      {category.spendTotal} &middot;{' '}
                      <span className="font-bold text-blue-700">{category.cpl}</span>
                    </div>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="text-left py-1 px-2 font-semibold">Ad group</th>
                        <th className="text-right py-1 px-2 font-semibold">Spend</th>
                        <th className="text-right py-1 px-2 font-semibold">CPL</th>
                        <th className="text-right py-1 pl-2 pr-3 font-semibold">IS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {category.rows.map((row) => (
                        <tr key={row.name}>
                          <td className={adGroupNameClass(row.variant)}>{row.name}</td>
                          <td className={adGroupSpendClass(row.variant)}>{row.spend}</td>
                          <td className={adGroupCplClass(row)}>{row.cpl}</td>
                          <td className={adGroupIsClass(row)}>{row.is}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-auto px-3 py-1.5 bg-blue-50/40 text-[10px] text-blue-800 border-t border-blue-200">
                    {category.opportunity}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs text-slate-700">
                <span className="font-bold text-slate-900">Suggestion:</span> many heavily-bid roles
                (e.g. <span className="font-semibold">Front-End Developer</span>) are increasingly
                automatable with AI. Shift spend toward roles where human judgment still wins (e.g.{' '}
                <span className="font-semibold">Accountant</span>).
              </p>
            </div>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            7 / 15
          </div>
        </section>
        <section
          id="search-terms"
          data-label="Search terms"
          className="relative min-h-screen flex flex-col bg-slate-50"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-8 max-w-6xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-1 max-w-4xl mx-auto text-slate-900">
              Some keywords need more budget. Others need to be cut.
            </h2>
            <p className="text-center text-xs text-slate-500 mb-4">
              Jun 2025 - Apr 2026 &middot; brand queries excluded &middot; 146K search terms reviewed
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Top 20 by conversion */}
              <div className="rounded-lg border border-emerald-200 bg-white overflow-hidden flex flex-col">
                <div className="px-3 py-1.5 bg-emerald-50 border-b border-emerald-200 flex items-baseline justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                    Top 20 search terms by conversion
                  </div>
                  <div className="text-[10px] text-slate-500">
                    $2,560 &middot; 20 conv &middot; blended CPL $128
                  </div>
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-left py-1 px-2 font-semibold">Search term</th>
                      <th className="text-right py-1 px-2 font-semibold">Spend</th>
                      <th className="text-right py-1 px-2 font-semibold">Conv</th>
                      <th className="text-right py-1 px-2 font-semibold">CPL</th>
                      <th className="text-right py-1 pl-2 pr-3 font-semibold">Budget-limited</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {SEARCH_TERM_TOP_ROWS.map((row) => (
                      <tr key={row.term}>
                        <td className="py-1 px-2 text-[11px] text-slate-700 font-mono">{row.term}</td>
                        <td className="text-right py-1 px-2 text-[11px] tabular-nums text-slate-600">
                          {row.spend}
                        </td>
                        <td className="text-right py-1 px-2 text-[11px] tabular-nums text-slate-700 font-semibold">
                          {row.conv}
                        </td>
                        <td className="text-right py-1 px-2 text-[11px] tabular-nums font-semibold text-emerald-700">
                          {row.cpl}
                        </td>
                        <td className="text-right py-1 pl-2 pr-3 text-[11px]">
                          <span
                            className={
                              row.budgetLimitedHighlight === false
                                ? 'text-slate-500'
                                : 'text-amber-700 font-semibold'
                            }
                          >
                            {row.budgetLimited}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-auto px-3 py-1.5 bg-emerald-50/40 text-[10px] text-emerald-800 border-t border-emerald-200">
                  <span className="font-semibold">Budget-limited</span> = parent campaign losing
                  &gt;20% impression share to budget caps (real opportunity to scale spend). IS is
                  only reported at campaign level; not per search term.
                </div>
              </div>
              {/* Negative-keyword candidates */}
              <div className="rounded-lg border border-rose-200 bg-white overflow-hidden flex flex-col">
                <div className="px-3 py-1.5 bg-rose-50 border-b border-rose-200 flex items-baseline justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wider text-rose-700">
                    Negative-keyword candidates (zero conv)
                  </div>
                  <div className="text-[10px] text-slate-500">
                    ~$11,636 wasted across 160 terms
                  </div>
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-left py-1 px-2 font-semibold">
                        Pattern {'\u2014'} example queries
                      </th>
                      <th className="text-right py-1 px-2 font-semibold">Wasted</th>
                      <th className="text-right py-1 pl-2 pr-3 font-semibold">Terms</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {NEGATIVE_PATTERN_ROWS.map((row) => (
                      <tr key={row.label}>
                        <td className="py-1 px-2 text-[11px]">
                          <span className="font-semibold text-slate-700">{row.label}</span>
                          {row.detail}
                          <br />
                          <span className="text-[10px] text-slate-500 font-mono">
                            {row.examples}
                          </span>
                        </td>
                        <td className="text-right py-1 px-2 text-[11px] tabular-nums font-semibold text-rose-700">
                          {row.wasted}
                        </td>
                        <td className="text-right py-1 pl-2 pr-3 text-[11px] tabular-nums text-slate-600">
                          {row.terms}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-auto px-3 py-1.5 bg-rose-50/40 text-[10px] text-rose-800 border-t border-rose-200">
                  <span className="font-semibold">Not every zero-conv term is a negative.</span>{' '}
                  Categories above are derived from real search terms with patterns the account
                  should not be paying for. Asian-region geos (Vietnam, Philippines, Indonesia,
                  etc.) are excluded - those are the target offshore markets and may convert.
                </div>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-500 italic text-center">
              Budget-limited &ldquo;Yes&rdquo; = the campaign is running out of money each day - Google
              would show our ads more often if we raised the daily budget.
            </p>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            8 / 15
          </div>
        </section>
        <section
          id="landing-pages"
          data-label="Landing pages"
          className="relative min-h-screen flex flex-col bg-white"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-20 pb-12 max-w-5xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-3 max-w-4xl mx-auto text-slate-900">
              Big CPL wins available by fixing the highest-spending landing pages
            </h2>
            <p className="text-center text-sm md:text-base pb-[20px] max-w-3xl mx-auto text-slate-500">
              Spend concentrates on 10-15 pages and several convert poorly. Small changes - better
              form, clearer CTA, role-specific content - can lift conversions and drop CPL without
              changing the campaigns.
            </p>
            <div className="max-w-4xl mx-auto w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    <th className="text-left py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Landing Page
                    </th>
                    <th className="text-right py-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Post-Jun Spend
                    </th>
                    <th className="text-right py-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Clicks
                    </th>
                    <th className="text-right py-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Conv
                    </th>
                    <th className="text-right py-2 pl-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      CPL
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {LANDING_PAGE_ROWS.map((row) => (
                    <tr key={row.path} className="hover:bg-slate-50">
                      <td className="py-2 pr-4 text-xs font-mono break-all">
                        <a
                          href={row.href}
                          target="_blank"
                          rel="noopener"
                          className="text-blue-700 hover:text-blue-900 hover:underline"
                        >
                          {row.path}
                        </a>
                      </td>
                      <td className="text-right py-2 px-2 tabular-nums text-slate-700">{row.spend}</td>
                      <td className="text-right py-2 px-2 tabular-nums text-slate-700">{row.clicks}</td>
                      <td className="text-right py-2 px-2 tabular-nums text-slate-700">{row.conv}</td>
                      <td className={landingPageCplClass(row.cplTone)}>{row.cpl}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-rose-700 mb-1">
                  Change/improve: /how-it-works/ ($5,956 CPL)
                </div>
                <p className="text-sm text-slate-800">
                  1,047 clicks, only 4 conversions. The &ldquo;how it works&rdquo; page is mid-funnel
                  education, not a conversion page. Remove it as a landing page from non-brand
                  campaigns (or use it only for retargeting).
                </p>
              </div>
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-rose-700 mb-1">
                  Change/improve: /outsource-app-development/ ($10,075 CPL)
                </div>
                <p className="text-sm text-slate-800">
                  240 clicks, 1 conversion. High-intent IT traffic is landing on a generic app-dev
                  page instead of a dedicated IT/developer page.
                </p>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-blue-700 mb-1">
                Landing page recommendations
              </div>
              <ul className="text-sm text-slate-800 space-y-1 list-disc pl-4">
                <li>
                  Build <strong>dedicated landing pages per role</strong> (Bookkeeper, Payroll,
                  Accountant, Developer, etc.) instead of routing all traffic to /how-it-works/.
                </li>
                <li>
                  <strong>Form near the fold</strong> on every landing page, with{' '}
                  <strong>multiple CTAs throughout</strong> the page (rather than a single &ldquo;Learn
                  more&rdquo;).
                </li>
                <li>
                  <strong>Role-specific intake form</strong> (not a generic &ldquo;contact us&rdquo;)
                  asking 3-4 qualifying questions: role needed, team size, start date, budget range.
                  Drives better-quality leads and signals professionalism.
                </li>
                <li>
                  Add a <strong>direct calendar booking link</strong> as a secondary CTA - removes
                  the email-back-and-forth friction and lifts conversion rate.
                </li>
                <li>
                  Build trust with role-specific case studies, salary comparisons, and team-member
                  profiles on each landing page.
                </li>
              </ul>
            </div>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            9 / 15
          </div>
        </section>
        <section
          id="ai-erosion"
          data-label="AI erosion"
          className="relative min-h-screen flex flex-col bg-slate-50"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-8 max-w-6xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-2 max-w-4xl mx-auto text-slate-900">
              Is AI search impacting paid CPLs?
            </h2>
            <p className="text-center text-sm md:text-base pb-5 max-w-3xl mx-auto text-slate-500">
              We took the top high-traffic queries across paid and organic and compared their
              12-month baseline to the last 3 months to see where the biggest drops are - and
              whether AI is responsible.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Paid queries (48 tracked)
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center">
                    <div className="text-[9px] uppercase tracking-wider text-slate-400">
                      12-mo baseline
                    </div>
                    <div className="text-lg font-bold text-slate-900">
                      59 <span className="text-xs font-normal text-slate-500">/mo</span>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] uppercase tracking-wider text-slate-400">
                      Last 3 mo
                    </div>
                    <div className="text-lg font-bold text-slate-900">
                      30 <span className="text-xs font-normal text-slate-500">/mo</span>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] uppercase tracking-wider text-slate-400">Change</div>
                    <div className="text-lg font-bold text-amber-600">-49%</div>
                  </div>
                </div>
                <p className="text-[12px] text-slate-700 leading-snug">
                  <span className="font-semibold text-slate-900">Account decisions, not AI.</span>{' '}
                  The paid queries that lost clicks were turned off or paused inside the account
                  itself - competitor-name bidding stopped, old campaigns shut down. The price per
                  click has also stayed steady, which would have risen if AI was shrinking the ad
                  inventory.
                </p>
              </div>
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-700 mb-2">
                  Organic queries (48 tracked)
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center">
                    <div className="text-[9px] uppercase tracking-wider text-rose-600">
                      12-mo baseline
                    </div>
                    <div className="text-lg font-bold text-rose-900">
                      49 <span className="text-xs font-normal text-rose-600">/mo</span>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] uppercase tracking-wider text-rose-600">
                      Last 3 mo
                    </div>
                    <div className="text-lg font-bold text-rose-900">
                      23 <span className="text-xs font-normal text-rose-600">/mo</span>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] uppercase tracking-wider text-rose-600">Change</div>
                    <div className="text-lg font-bold text-rose-700">-53%</div>
                  </div>
                </div>
                <p className="text-[12px] text-slate-700 leading-snug">
                  <span className="font-semibold text-slate-900">This is where AI shows up.</span>{' '}
                  The lost clicks are mostly people Googling research-style questions (&ldquo;what
                  is outsourcing&rdquo;, &ldquo;future of graphic design&rdquo;) - Google now
                  answers those at the top of the page with its AI summary, so clicks to the
                  website are reduced.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-sm text-slate-800">
                <strong className="text-blue-700">
                  What this means for the Google Ads strategy:
                </strong>{' '}
                AI Overviews are not currently the reason paid CPLs are high - the paid issues are
                structural (broad match, no Quality Score work, competitor-name bidding, fragmented
                campaigns). Fixing those is what moves CPL.
              </p>
            </div>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            10 / 15
          </div>
        </section>
        <section
          id="recommendations"
          data-label="Recommendations"
          className="relative min-h-screen flex flex-col bg-white"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-10 pb-8 max-w-6xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-1 max-w-4xl mx-auto text-slate-900">
              Recommendations to reduce CPL today
            </h2>
            <p className="text-center text-xs text-slate-500 mb-4">
              Eleven priorities, ordered by expected impact on CPL. Detail discussed in the
              engagement.
            </p>
            <div className="max-w-6xl mx-auto w-full">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 max-w-6xl mx-auto">
                {(
                  [
                    {
                      n: '01',
                      title: 'Pick the right campaigns & reallocate budget',
                      desc: 'Spend is misallocated against performance. A clear re-weighting opportunity.',
                    },
                    {
                      n: '02',
                      title: 'Refine each remaining campaign and ad group',
                      desc: 'Structural cleanup across ad groups, copy, bidding and budgets.',
                    },
                    {
                      n: '03',
                      title: 'Route traffic to the right landing pages',
                      desc: 'Intent-to-page mismatch is dragging down conversion rate.',
                    },
                    {
                      n: '04',
                      title: 'Migrate broad match to phrase & exact match',
                      desc: 'Match-type strategy is leaking spend on irrelevant queries.',
                    },
                    {
                      n: '05',
                      title: 'Improve the negative-keyword list',
                      desc: 'Significant patterns of wasted spend identified and ready to block.',
                    },
                    {
                      n: '06',
                      title: 'Reallocate budget away from overly broad role keywords',
                      desc: 'High-spend keywords lack the intent signal needed to convert efficiently.',
                    },
                    {
                      n: '07',
                      title: 'Add lead-qualifying form on every landing page',
                      desc: 'Lead-capture flow is funnelling unqualified traffic into the pipeline.',
                    },
                    {
                      n: '08',
                      title: 'Improve Quality Score to bring down CPCs',
                      desc: 'QS gains will compound into lower CPC and CPL across the account.',
                    },
                    {
                      n: '09',
                      title: "Audit every campaign\u2019s negative-keyword list - top to bottom",
                      desc: 'Misconfigured negatives discovered; broader cleanup needed.',
                    },
                    {
                      n: '10',
                      title: 'Exclude brand traffic from PMAX, Demand Gen & Video',
                      desc: 'PMAX, Demand Gen and Video are cannibalising organic brand traffic.',
                    },
                    {
                      n: '11',
                      title: 'Stop bidding on pure brand terms',
                      desc: 'Reclaimable spend on queries already won by organic rankings.',
                    },
                  ] as const
                ).map((r) => (
                  <div
                    key={r.n}
                    className="flex items-start gap-3 bg-white rounded-lg px-3.5 py-3 border border-slate-200"
                  >
                    <span className="text-blue-600 text-lg font-bold shrink-0 leading-none w-8 text-center">
                      {r.n}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800 font-medium leading-relaxed">
                        {r.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{r.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            11 / 15
          </div>
        </section>
        <section
          id="opportunity"
          data-label="Opportunity"
          className="relative min-h-screen flex flex-col bg-slate-900"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-8 max-w-4xl mx-auto w-full text-center">
            <p className="text-blue-400 text-xs font-semibold tracking-widest uppercase mb-4">
              The opportunity
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
              What improving this means for Away Digital
            </h2>
            <p className="text-slate-300 text-sm md:text-base leading-relaxed mb-8 max-w-2xl mx-auto">
              On a ~$50,000/month budget, the current CPL since June is{' '}
              <span className="text-white font-semibold">$1,373</span>. Every dollar shaved off CPL
              compounds across a year of spend. Here&rsquo;s what each conservative reduction
              unlocks.
            </p>
            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700 max-w-2xl mx-auto text-left">
              <p className="text-xs text-slate-400 mb-3 uppercase tracking-wider font-semibold">
                Annual leads at $50,000/mo spend ($600K/yr)
              </p>
              <div className="divide-y divide-slate-700/70 text-sm">
                <div className="flex justify-between items-center py-2 text-slate-400">
                  <span>
                    Today &middot;{' '}
                    <span className="text-white font-semibold">$1,373</span> CPL
                  </span>
                  <span className="text-slate-300 font-medium">~437 leads/yr</span>
                </div>
                <div className="flex justify-between items-center py-2 text-slate-400">
                  <span>
                    Lower to <span className="text-white font-semibold">$1,300</span> CPL
                  </span>
                  <span className="text-green-400 font-medium">
                    462 leads/yr &nbsp;
                    <span className="text-green-500/80 text-xs">(+25)</span>
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 text-slate-400">
                  <span>
                    Lower to <span className="text-white font-semibold">$1,200</span> CPL
                  </span>
                  <span className="text-green-400 font-medium">
                    500 leads/yr &nbsp;
                    <span className="text-green-500/80 text-xs">(+63)</span>
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 text-white font-semibold">
                  <span>
                    Lower to <span className="text-white">$1,100</span> CPL
                  </span>
                  <span className="text-green-400">
                    545 leads/yr &nbsp;
                    <span className="text-green-500/90 text-xs font-medium">(+108)</span>
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-3">
                Quick wins (negatives, routing, brand exclusions) typically land in 1&ndash;3 weeks.
                Restructure work continues compounding over the next 2&ndash;3 months.
              </p>
            </div>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-500 select-none pointer-events-none"
            aria-hidden="true"
          >
            12 / 15
          </div>
        </section>
        <section
          id="how-we-work"
          data-label="How we work"
          className="relative min-h-screen flex flex-col bg-white"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-8 max-w-4xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-2 text-slate-900">
              How we work differently as an agency
            </h2>
            <div className="pb-4" />
            <div className="max-w-5xl mx-auto w-full mb-5">
              <div className="optimate-box rounded-2xl border border-blue-500/20 overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr]">
                  {/* Left: copy */}
                  <div className="p-6 md:p-8 flex flex-col justify-center">
                    <p className="text-blue-400 font-semibold text-[10px] uppercase tracking-widest mb-2">
                      Proprietary Technology
                    </p>
                    <h3
                      className="text-xl md:text-2xl font-bold text-white tracking-tight"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    >
                      Meet OptiMate
                    </h3>
                    <p className="mt-2 text-[12px] md:text-[13px] text-slate-400 leading-relaxed">
                      Your account doesn&rsquo;t sleep, and neither does OptiMate. Our AI engine
                      continuously analyses your campaigns, adjusting bids in real time, identifying
                      emerging trends before they become costly, and cross-referencing organic
                      rankings against paid spend to eliminate waste.
                    </p>
                    <p className="mt-2 text-[12px] md:text-[13px] text-slate-400 leading-relaxed">
                      While other agencies review accounts weekly or monthly with a junior, OptiMate
                      runs deep-dive analytics often, flagging anomalies and executing optimisations
                      proactively.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-400">
                        Budget Pacing &amp; Alerts
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-400">
                        Organic + Paid Monitoring
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-400">
                        Negative Keyword Sweeps
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-400">
                        Deep-Dive Analytics
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-400">
                        24/7 Active
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-400">
                        Search Incrementality
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-400">
                        SERP Displacement Monitor
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-400">
                        AI Visibility Tracker
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-400">
                        Conversion Rate Audit
                      </span>
                      <a
                        href="https://www.optimisedigital.online/ai-growth-tools"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-500 border border-blue-400 text-[10px] font-semibold text-white hover:bg-blue-400 transition-colors"
                      >
                        All growth tools <span aria-hidden="true">→</span>
                      </a>
                    </div>
                  </div>
                  {/* Right: OptiMate radial visual */}
                  <div className="relative hidden md:flex items-center justify-center p-6">
                    <div className="relative w-full aspect-square max-w-[300px]">
                      {/* Animated rings */}
                      <div
                        className="absolute inset-0 rounded-full border border-blue-500/20 animate-ping"
                        style={{ animationDuration: '3s' }}
                      />
                      <div
                        className="absolute inset-4 rounded-full border border-blue-500/15 animate-ping"
                        style={{ animationDuration: '3s', animationDelay: '0.5s' }}
                      />
                      <div
                        className="absolute inset-8 rounded-full border border-blue-500/10 animate-ping"
                        style={{ animationDuration: '3s', animationDelay: '1s' }}
                      />
                      {/* Connecting dashed lines (center 150,150 -> each node) */}
                      <svg
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        viewBox="0 0 300 300"
                        fill="none"
                      >
                        <line x1="150" y1="150" x2="26" y2="46" stroke="rgba(59,130,246,0.15)" strokeWidth="1" strokeDasharray="4 4" />
                        <line x1="150" y1="150" x2="206" y2="25" stroke="rgba(59,130,246,0.15)" strokeWidth="1" strokeDasharray="4 4" />
                        <line x1="150" y1="150" x2="-16" y2="145" stroke="rgba(59,130,246,0.15)" strokeWidth="1" strokeDasharray="4 4" />
                        <line x1="150" y1="150" x2="224" y2="124" stroke="rgba(59,130,246,0.15)" strokeWidth="1" strokeDasharray="4 4" />
                        <line x1="150" y1="150" x2="26" y2="244" stroke="rgba(59,130,246,0.15)" strokeWidth="1" strokeDasharray="4 4" />
                        <line x1="150" y1="150" x2="206" y2="226" stroke="rgba(59,130,246,0.15)" strokeWidth="1" strokeDasharray="4 4" />
                        <line x1="150" y1="150" x2="104" y2="280" stroke="rgba(59,130,246,0.15)" strokeWidth="1" strokeDasharray="4 4" />
                      </svg>
                      {/* Core: OptiMate gradient tile */}
                      <div className="absolute inset-0 flex items-center justify-center z-10">
                        <div
                          className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center p-2.5"
                          style={{ boxShadow: '0 0 60px rgba(59,130,246,0.3)' }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src="https://www.optimisedigital.online/images/optimate-ai-assistant-transparent.webp"
                            alt="OptiMate AI Engine"
                            className="optimate-icon w-16 h-auto"
                            style={{ filter: 'drop-shadow(0 0 12px rgba(255,255,255,0.3))' }}
                          />
                        </div>
                      </div>
                      {/* 7 data nodes positioned around the ring */}
                      <div className="absolute flex items-center gap-1.5 z-10" style={{ left: '2%', top: '12%' }}>
                        <div className="w-6 h-6 rounded-md bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                          </svg>
                        </div>
                        <span className="text-[9px] font-medium text-slate-400 leading-tight whitespace-nowrap">
                          Real-time bid adjustments
                        </span>
                      </div>
                      <div className="absolute flex items-center gap-1.5 z-10" style={{ left: '62%', top: '5%' }}>
                        <div className="w-6 h-6 rounded-md bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                            <path d="M3 3v16a2 2 0 0 0 2 2h16" />
                            <path d="M7 14l4-4 4 4 6-6" />
                          </svg>
                        </div>
                        <span className="text-[9px] font-medium text-slate-400 leading-tight whitespace-nowrap">
                          Budget pacing &amp; alerts
                        </span>
                      </div>
                      <div className="absolute flex items-center gap-1.5 z-10" style={{ left: '-12%', top: '45%' }}>
                        <div className="w-6 h-6 rounded-md bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                            <circle cx="11" cy="11" r="8" />
                            <path d="M21 21l-4.35-4.35" />
                          </svg>
                        </div>
                        <span className="text-[9px] font-medium text-slate-400 leading-tight whitespace-nowrap">
                          Deep-dive analytics
                        </span>
                      </div>
                      <div className="absolute flex items-center gap-1.5 z-10" style={{ left: '68%', top: '38%' }}>
                        <div className="w-6 h-6 rounded-md bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                          </svg>
                        </div>
                        <span className="text-[9px] font-medium text-slate-400 leading-tight whitespace-nowrap">
                          Trend identification
                        </span>
                      </div>
                      <div className="absolute flex items-center gap-1.5 z-10" style={{ left: '2%', top: '78%' }}>
                        <div className="w-6 h-6 rounded-md bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                            <path d="M12 2L2 7l10 5 10-5-10-5z" />
                            <path d="M2 17l10 5 10-5" />
                            <path d="M2 12l10 5 10-5" />
                          </svg>
                        </div>
                        <span className="text-[9px] font-medium text-slate-400 leading-tight whitespace-nowrap">
                          Organic + Paid monitoring
                        </span>
                      </div>
                      <div className="absolute flex items-center gap-1.5 z-10" style={{ left: '62%', top: '72%' }}>
                        <div className="w-6 h-6 rounded-md bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            <path d="M9 12l2 2 4-4" />
                          </svg>
                        </div>
                        <span className="text-[9px] font-medium text-slate-400 leading-tight whitespace-nowrap">
                          Negative keyword sweeps
                        </span>
                      </div>
                      <div className="absolute flex items-center gap-1.5 z-10" style={{ left: '28%', top: '90%' }}>
                        <div className="w-6 h-6 rounded-md bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 6v6l4 2" />
                          </svg>
                        </div>
                        <span className="text-[9px] font-medium text-slate-400 leading-tight whitespace-nowrap">
                          24/7 active optimisation
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-center text-xs md:text-sm text-slate-500 mt-4 mb-2">
              A five-step framework applied across every engagement.
            </p>
            <div className="max-w-5xl mx-auto w-full grid grid-cols-1 md:grid-cols-5 gap-2">
              {(
                [
                  {
                    n: '01',
                    title: 'Discovery',
                    desc: 'Understand the business commercially: goals, margins, constraints. Growth decisions grounded in commercial reality.',
                  },
                  {
                    n: '02',
                    title: 'Foundations',
                    desc: 'Audit and strengthen digital foundations before scaling: account audit, tracking, conversion readiness, channel health.',
                  },
                  {
                    n: '03',
                    title: 'Prioritisation',
                    desc: 'Identify the highest-impact opportunities and sequence by effort, risk, and expected return.',
                  },
                  {
                    n: '04',
                    title: 'Rollout',
                    desc: 'Structured phases, not a big-bang launch. Measure, test, and refine continuously against real outcomes.',
                  },
                  {
                    n: '05',
                    title: 'Scale & learn',
                    desc: 'Scale what is working and identify the next stage of growth based on performance data and commercial impact.',
                  },
                ] as const
              ).map((step) => (
                <div
                  key={step.n}
                  className="step-card rounded-lg px-2.5 py-2 border bg-white border-slate-200 flex flex-col items-start gap-0.5 cursor-default"
                >
                  <span className="text-base font-bold leading-none text-blue-600">{step.n}</span>
                  <p className="text-[12px] font-semibold leading-snug text-slate-900">{step.title}</p>
                  <p className="text-[10px] leading-snug text-slate-500">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            13 / 15
          </div>
        </section>
        <section
          id="working-together"
          data-label="Working together"
          className="relative flex flex-col bg-white"
          style={{ minHeight: 'calc(100vh - 100px)' }}
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-2 pb-8 max-w-3xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-2 text-slate-900">
              Working together
            </h2>
            <p className="text-center text-sm md:text-base pb-5 max-w-2xl mx-auto text-slate-500">
              Month-to-month because we earn the business through results.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <h3 className="text-xs font-semibold text-slate-900 mb-2">Google Ads management</h3>
                <ul className="space-y-1 text-xs text-slate-600">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 shrink-0">✓</span>No lock-in contracts
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 shrink-0">✓</span>Expert team and strategy, not juniors
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 shrink-0">✓</span>AI-powered monitoring and recommendations
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 shrink-0">✓</span>Clear bespoke dashboards
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 shrink-0">✓</span>Transparent reporting against commercial goals
                  </li>
                </ul>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <h3 className="text-xs font-semibold text-slate-900 mb-2">What’s included</h3>
                <ul className="space-y-1 text-xs text-slate-600">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 shrink-0">✓</span>Week 1: Quick wins (negatives, routing, brand
                    exclusions, pause pure brand bidding)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 shrink-0">✓</span>Weeks 2–6: Restructure (broad-match →
                    phrase/exact, ad-group refinement)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 shrink-0">✓</span>Month 2+: Scale (form-on-LP rollout, QS lift,
                    ongoing review)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 shrink-0">✓</span>Ongoing: Fortnightly optimisation + monthly
                    optimisation plans
                  </li>
                </ul>
              </div>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900">
                    <th className="text-left text-white font-semibold px-4 py-2"></th>
                    <th className="text-right text-white font-semibold px-4 py-2">Investment</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-white">
                    <td className="px-4 py-2 font-medium text-slate-900">Monthly retainer</td>
                    <td className="px-4 py-2 text-right text-slate-700 font-semibold">$4,800 / month</td>
                  </tr>
                  <tr className="bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-900">Ad spend</td>
                    <td className="px-4 py-2 text-right text-slate-700 font-semibold">$50,000 / month</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            14 / 15
          </div>
        </section>
        <div id="space-transition" className="v2-space-transition" aria-hidden="true" />
        <section
          id="closing"
          data-label="Closing"
          className="closing-v2 relative flex flex-col"
          style={{ minHeight: 'calc(100vh - 100px)' }}
        >
          <Starfield id="closing-starfield" />
          <div
            className="orbit-deco"
            style={{ width: '1100px', height: '1100px', right: '-440px', bottom: '-380px' }}
          />
          <div
            className="orbit-deco"
            style={{
              width: '760px',
              height: '760px',
              right: '-260px',
              bottom: '-200px',
              borderColor: 'rgba(77,148,255,0.1)',
            }}
          />
          <div className="closing-station" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/slides/Space-station-optimise-digital.png" alt="" />
          </div>
          <div className="relative z-10 px-8 md:px-12 pt-10 w-full">
            <a
              href="https://optimisedigital.online?utm_source=audit&utm_medium=closing"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3"
              aria-label="Visit Optimise Digital"
            >
              <span className="cover-dot" aria-hidden="true" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/optimise-digital-logo-white.webp"
                alt="Optimise Digital"
                className="w-auto h-[22.8px] md:h-[30.4px]"
              />
            </a>
          </div>
          <div className="relative z-10 flex-1 flex flex-col justify-center px-8 md:px-12 pb-0 w-full gap-10">
            <h2 className="closing-h1 text-4xl md:text-6xl max-w-3xl">
              Ready to <em>discuss</em>?
            </h2>
            <div className="closing-who max-w-4xl">
              <div>
                <div className="lbl">For</div>
                <div className="val">
                  <a href="https://awaydigital.com" target="_blank" rel="noopener noreferrer">
                    Away Digital Teams
                  </a>
                </div>
              </div>
              <div>
                <div className="lbl">Peter Tu</div>
                <div className="val">
                  <a href="mailto:peter@optimisedigital.online">peter@optimisedigital.online</a>
                </div>
                <div className="val" style={{ marginTop: '4px' }}>
                  <a href="tel:0493053188">0493 053 188</a>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section
          id="appendix-cover"
          className="relative min-h-screen flex flex-col items-center justify-center bg-slate-900 text-center px-6"
        >
          <h2 className="text-5xl md:text-6xl font-bold text-white">Appendix</h2>
        </section>
        <section
          id="appendix"
          className="relative min-h-screen flex flex-col bg-white px-6 py-8"
        >
          <div className="max-w-6xl mx-auto w-full">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
                  Appendix
                </p>
                <h2 className="text-lg md:text-xl font-bold text-slate-900">
                  Scoring methodology
                </h2>
              </div>
              <a
                href="#audit-score"
                className="text-[11px] text-blue-600 hover:text-blue-700 underline underline-offset-2 shrink-0"
              >
                Back to score overview
              </a>
            </div>
            <p className="text-[11px] text-slate-600 mb-3">
              Each step is scored 0&ndash;10 and weighted by importance. The overall score is
              the weighted average across all 13 steps, normalised to 0&ndash;100. Higher-weight
              areas have a larger impact on the total.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {SCORING_METHODOLOGY_CARDS.map((card) => (
                <div
                  key={card.n}
                  className={
                    card.n === 13
                      ? 'bg-slate-50 rounded-lg p-2.5 border border-slate-200 md:col-span-2'
                      : 'bg-slate-50 rounded-lg p-2.5 border border-slate-200'
                  }
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <h3 className="text-[12px] font-semibold text-slate-900">
                      <span className="text-blue-500 mr-1.5">{card.n}.</span>
                      {card.name}
                    </h3>
                    <div className="flex items-center gap-2 text-[10px] shrink-0">
                      <span className="text-slate-500">W: {card.weight}</span>
                      <span className={`font-semibold ${card.scoreClass}`}>
                        {card.score}/10
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-600 leading-snug">{card.desc}</p>
                </div>
              ))}
            </div>
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
