// Static mock data mirroring the mockup HTML values 1:1 so the visual diff is exact.

export type Trend = 'up' | 'down' | 'flat'
export type PillVariant = 'green' | 'amber' | 'gray' | 'blue' | 'red' | 'teal' | 'violet'

export type Kpi = { label: string; dot?: string; value: string; delta: string; trend: Trend }

export const DASH_KPIS: Kpi[] = [
  { label: 'Active Clients', dot: 'var(--accent)', value: '24', delta: '▲ 3 this month', trend: 'up' },
  { label: 'Active Leads', dot: 'var(--violet)', value: '47', delta: '▲ 9', trend: 'up' },
  { label: 'ARR', dot: 'var(--teal)', value: '$612k', delta: '▲ 8.4%', trend: 'up' },
  { label: 'Monthly Retainer', dot: 'var(--violet)', value: '$51k', delta: '▲ 4.1%', trend: 'up' },
  { label: 'Retainer Rev. YTD', value: '$284k', delta: '▲ 12%', trend: 'up' },
  { label: 'One-Off Projects YTD', value: '$96k', delta: '▲ 6%', trend: 'up' },
  { label: 'Lead Conversion', value: '31%', delta: '— flat', trend: 'flat' },
  { label: 'MTD Costs', dot: 'var(--amber)', value: '$8.2k', delta: '▼ 2.0%', trend: 'down' },
]

export const GSC_STATS: { k: string; v: string; d: string; trend: Trend }[] = [
  { k: 'Clicks', v: '18.2k', d: '▲ 6%', trend: 'up' },
  { k: 'Impressions', v: '1.4M', d: '▲ 11%', trend: 'up' },
  { k: 'CTR', v: '1.3%', d: '▼ 0.1%', trend: 'down' },
  { k: 'Avg Position', v: '12.4', d: '▲ 0.6', trend: 'up' },
  { k: 'Keywords', v: '3,810', d: '▲ 120', trend: 'up' },
  { k: 'Pages', v: '642', d: '— 0', trend: 'flat' },
]

export const GSC_BARS: { h: number; dk?: boolean }[] = [
  { h: 40 },
  { h: 55 },
  { h: 48, dk: true },
  { h: 70 },
  { h: 62 },
  { h: 85, dk: true },
  { h: 75 },
  { h: 92 },
  { h: 80, dk: true },
  { h: 68 },
  { h: 78 },
  { h: 88 },
]

export const INVOICE_ROWS: { client: string; inv: string; statusVariant: PillVariant; status: string; amount: string }[] = [
  { client: 'Acme Corp', inv: 'INV-0231', statusVariant: 'red', status: 'Overdue 12d', amount: '$4,200' },
  { client: 'Brightline', inv: 'INV-0229', statusVariant: 'amber', status: 'Due 3d', amount: '$2,800' },
  { client: 'Northwind', inv: 'INV-0228', statusVariant: 'blue', status: 'Sent', amount: '$6,500' },
  { client: 'Vertex Labs', inv: 'INV-0227', statusVariant: 'green', status: 'Scheduled', amount: '$3,100' },
]

export const GA4_STATS: { k: string; v: string; d: string; trend: Trend }[] = [
  { k: 'Users', v: '84.2k', d: '▲ 7.1%', trend: 'up' },
  { k: 'Sessions', v: '121k', d: '▲ 5.4%', trend: 'up' },
  { k: 'Pageviews', v: '389k', d: '▲ 9.0%', trend: 'up' },
  { k: 'Bounce Rate', v: '42%', d: '▲ 1.2%', trend: 'up' },
  { k: 'Avg Duration', v: '2m 14s', d: '▼ 6s', trend: 'down' },
  { k: 'Conversions', v: '1,930', d: '▲ 11%', trend: 'up' },
]

export const GA4_CHANNELS: { ch: string; sessions: string; users: string; newUsers: string; bounce: string; dur: string; events: string }[] = [
  { ch: 'Organic Search', sessions: '52,310', users: '38,902', newUsers: '31,440', bounce: '39%', dur: '2m 41s', events: '980' },
  { ch: 'Paid Search', sessions: '28,120', users: '19,330', newUsers: '16,210', bounce: '45%', dur: '1m 58s', events: '620' },
  { ch: 'Direct', sessions: '19,540', users: '14,880', newUsers: '9,210', bounce: '38%', dur: '2m 30s', events: '180' },
  { ch: 'Organic Social', sessions: '9,870', users: '7,640', newUsers: '6,990', bounce: '52%', dur: '1m 12s', events: '70' },
  { ch: 'Referral', sessions: '6,320', users: '5,110', newUsers: '3,860', bounce: '41%', dur: '2m 04s', events: '50' },
  { ch: 'Email', sessions: '3,940', users: '3,210', newUsers: '1,120', bounce: '33%', dur: '3m 02s', events: '30' },
  { ch: 'Paid Social', sessions: '2,610', users: '2,040', newUsers: '1,880', bounce: '58%', dur: '0m 54s', events: '12' },
]

export const FUNNEL: { label: string; width: number; bg: string; count: string; pct: string }[] = [
  { label: 'Leads', width: 100, bg: 'var(--teal-dark)', count: '152', pct: '100%' },
  { label: 'Qualified', width: 74, bg: 'var(--accent-strong)', count: '112', pct: '74%' },
  { label: 'Proposal Sent', width: 53, bg: 'var(--accent)', count: '81', pct: '53%' },
  { label: 'Audit Delivered', width: 36, bg: 'var(--teal)', count: '55', pct: '36%' },
  { label: 'Won (Client)', width: 31, bg: 'var(--teal-light)', count: '47', pct: '31%' },
]

export const LEAD_CHANNELS: {
  ch: string
  leads: string
  qualified: string
  proposals: string
  won: string
  rateVariant: PillVariant
  rate: string
  avg: string
  pipeline: string
}[] = [
  { ch: 'Referral Partner', leads: '38', qualified: '31', proposals: '24', won: '17', rateVariant: 'green', rate: '45%', avg: '$3,400', pipeline: '$57.8k' },
  { ch: 'Organic Search', leads: '42', qualified: '28', proposals: '19', won: '12', rateVariant: 'green', rate: '29%', avg: '$2,900', pipeline: '$34.8k' },
  { ch: 'Paid Search', leads: '31', qualified: '20', proposals: '14', won: '8', rateVariant: 'amber', rate: '26%', avg: '$2,600', pipeline: '$20.8k' },
  { ch: 'BNI / Networking', leads: '14', qualified: '12', proposals: '9', won: '6', rateVariant: 'green', rate: '43%', avg: '$3,100', pipeline: '$18.6k' },
  { ch: 'Cold Outreach', leads: '19', qualified: '9', proposals: '5', won: '2', rateVariant: 'red', rate: '11%', avg: '$2,200', pipeline: '$4.4k' },
  { ch: 'Social / LinkedIn', leads: '8', qualified: '5', proposals: '3', won: '2', rateVariant: 'amber', rate: '25%', avg: '$2,800', pipeline: '$5.6k' },
]

export const DRIP: { state: 'done' | 'active' | ''; icon: string; label: string; stat: string }[] = [
  { state: 'done', icon: '✉', label: 'Welcome', stat: '152 sent · 68% open' },
  { state: 'done', icon: '📊', label: 'Free Audit', stat: '141 sent · 54% open' },
  { state: 'active', icon: '📈', label: 'Case Study', stat: '98 sent · 47% open' },
  { state: '', icon: '💬', label: 'Book a Call', stat: 'Scheduled · 0 sent' },
  { state: '', icon: '⏰', label: 'Final Nudge', stat: 'Queued' },
]

// Clients list rows (mockup 2)
export type ClientRow = {
  initial: string
  avatarBg: string
  name: string
  domain: string
  slug: string
  statusVariant: PillVariant
  status: string
  services: { variant: PillVariant; label: string }[]
  pin: string
  mgr: string
  months: string
  typeVariant: PillVariant
  type: string
  healthVariant: PillVariant
  health: string
}

export const CLIENT_ROWS: ClientRow[] = [
  {
    initial: 'A',
    avatarBg: 'linear-gradient(135deg,#2c97c9,#468D8B)',
    name: 'Acme Corp',
    domain: 'acme.com',
    slug: 'acme-corp',
    statusVariant: 'green',
    status: 'Active',
    services: [{ variant: 'blue', label: 'Ads' }, { variant: 'gray', label: 'SEO' }],
    pin: '4821',
    mgr: 'Peter Tu',
    months: '14 mo',
    typeVariant: 'teal',
    type: 'Recurring',
    healthVariant: 'green',
    health: '● Good',
  },
  {
    initial: 'B',
    avatarBg: 'linear-gradient(135deg,#E67E22,#dca)',
    name: 'Brightline',
    domain: 'brightline.io',
    slug: 'brightline',
    statusVariant: 'green',
    status: 'Active',
    services: [{ variant: 'blue', label: 'Ads' }],
    pin: '7364',
    mgr: 'Sarah K.',
    months: '8 mo',
    typeVariant: 'teal',
    type: 'Recurring',
    healthVariant: 'amber',
    health: '● At risk',
  },
  {
    initial: 'N',
    avatarBg: 'linear-gradient(135deg,#6366f1,#9aa)',
    name: 'Northwind',
    domain: 'northwind.co',
    slug: 'northwind',
    statusVariant: 'green',
    status: 'Active',
    services: [
      { variant: 'blue', label: 'Ads' },
      { variant: 'gray', label: 'SEO' },
      { variant: 'gray', label: 'Content' },
    ],
    pin: '2093',
    mgr: 'Peter Tu',
    months: '26 mo',
    typeVariant: 'teal',
    type: 'Recurring',
    healthVariant: 'green',
    health: '● Good',
  },
  {
    initial: 'V',
    avatarBg: 'linear-gradient(135deg,#16a34a,#8c8)',
    name: 'Vertex Labs',
    domain: 'vertexlabs.ai',
    slug: 'vertex-labs',
    statusVariant: 'blue',
    status: 'Prospect',
    services: [{ variant: 'gray', label: 'Proposal' }],
    pin: '5517',
    mgr: 'Sarah K.',
    months: '— mo',
    typeVariant: 'gray',
    type: '—',
    healthVariant: 'gray',
    health: '● New',
  },
  {
    initial: 'L',
    avatarBg: 'linear-gradient(135deg,#dc2626,#f99)',
    name: 'Lumen Co',
    domain: 'lumen.co',
    slug: 'lumen-co',
    statusVariant: 'green',
    status: 'Active',
    services: [{ variant: 'blue', label: 'Ads' }, { variant: 'gray', label: 'SEO' }],
    pin: '9142',
    mgr: 'Peter Tu',
    months: '5 mo',
    typeVariant: 'violet',
    type: 'One-off',
    healthVariant: 'green',
    health: '● Good',
  },
  {
    initial: 'P',
    avatarBg: 'linear-gradient(135deg,#0891b2,#7cc)',
    name: 'Pinnacle Group',
    domain: 'pinnacle.com',
    slug: 'pinnacle-group',
    statusVariant: 'green',
    status: 'Active',
    services: [{ variant: 'gray', label: 'Content' }],
    pin: '3388',
    mgr: 'Sarah K.',
    months: '19 mo',
    typeVariant: 'teal',
    type: 'Recurring',
    healthVariant: 'amber',
    health: '● At risk',
  },
]
