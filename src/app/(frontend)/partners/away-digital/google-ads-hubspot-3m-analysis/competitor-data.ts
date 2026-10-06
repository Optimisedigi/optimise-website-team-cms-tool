// Competitor analysis content extracted from
// Competitor-Landing-Page-Review-2026-09-15.html (the review deck of 26
// competitors). This feeds the competitor-analysis table slide and the
// appendix slide of the Google Ads + HubSpot deck.
//
// Visits / Google Ads / Meta Ads are the figures recorded for each competitor
// in the reviewed comparison table. The Away Digital Teams row is the benchmark.

export type CompetitorRow = {
  readonly name: string
  readonly location: string
  readonly visits: string
  readonly googleAds: string
  readonly metaAds: string
  readonly takeaway: boolean
}

export type CompetitorTakeaway = {
  readonly title: string
  readonly text: string
}

export type CompetitorWriteup = {
  readonly name: string
  readonly location: string
  readonly website: string
  readonly description: string
  readonly takeaways: readonly CompetitorTakeaway[]
  readonly comment: string
}

export const COMPETITOR_ROWS: readonly CompetitorRow[] = [
  { name: 'Away Digital Teams', location: 'Australia / Vietnam', visits: '6,048', googleAds: 'Yes', metaAds: '-', takeaway: false },
  { name: "Somewhere", location: "United States", visits: '213,700', googleAds: 'Yes', metaAds: 'Yes', takeaway: true },
  { name: "BruntWork", location: "Australia / Global", visits: '210,200', googleAds: 'Yes', metaAds: 'Yes', takeaway: true },
  { name: "Athena", location: "United States / Philippines", visits: '137,000', googleAds: 'Yes', metaAds: 'Yes', takeaway: true },
  { name: "Wing Assistant", location: "United States", visits: '129,600', googleAds: 'Yes', metaAds: 'Yes', takeaway: true },
  { name: "MyOutDesk", location: "United States", visits: '23,900', googleAds: 'Yes', metaAds: 'Yes', takeaway: true },
  { name: "Pearl Talent", location: "United States", visits: '41,800', googleAds: 'Yes', metaAds: 'Yes', takeaway: true },
  { name: "hammerjack", location: "Australia", visits: '12,100', googleAds: 'Yes', metaAds: 'Yes', takeaway: false },
  { name: "Emapta", location: "Australia / Philippines", visits: '159,200', googleAds: 'Yes', metaAds: 'Yes', takeaway: true },
  { name: "Cloudstaff", location: "Australia / Philippines", visits: '247,500', googleAds: 'No', metaAds: 'Yes', takeaway: true },
  { name: "MicroSourcing", location: "Philippines / Australia", visits: '29,700', googleAds: 'Yes', metaAds: 'Yes', takeaway: false },
  { name: "Beepo", location: "Australia", visits: '9,800', googleAds: 'Yes', metaAds: 'Yes', takeaway: false },
  { name: "Satellite Office", location: "Australia", visits: '3,700', googleAds: 'Yes', metaAds: 'Yes', takeaway: true },
  { name: "Virtual Coworker", location: "Australia / United States", visits: '21,000', googleAds: 'Yes', metaAds: 'Yes', takeaway: true },
  { name: "VirtualStaff.ph", location: "Philippines", visits: '260,900', googleAds: 'No', metaAds: 'Yes', takeaway: false },
  { name: "Outstaffer", location: "Australia", visits: '1,600', googleAds: 'Yes', metaAds: 'Yes', takeaway: true },
  { name: "ClearDesk", location: "United States", visits: '7,600', googleAds: 'No', metaAds: 'No', takeaway: false },
  { name: "Staff Domain", location: "Australia", visits: '-', googleAds: 'No', metaAds: 'No', takeaway: true },
  { name: "Outsourced.ph", location: "Australia / Philippines", visits: '93,000', googleAds: 'No', metaAds: 'No', takeaway: true },
  { name: "KMC Solutions", location: "Philippines", visits: '196,000', googleAds: 'Yes', metaAds: 'No', takeaway: true },
  { name: "Booth & Partners", location: "Philippines", visits: '18,700', googleAds: 'No', metaAds: 'No', takeaway: false },
  { name: "Acquire BPO", location: "Australia", visits: '129,000', googleAds: 'Yes', metaAds: 'No', takeaway: false },
  { name: "Flat Planet", location: "Australia / United States", visits: '3,200', googleAds: 'No', metaAds: 'No', takeaway: false },
  { name: "Remote CoWorker", location: "United States", visits: '21,270', googleAds: 'Yes', metaAds: 'Yes', takeaway: true },
  { name: "Yoonet", location: "Australia", visits: '323', googleAds: 'No', metaAds: 'No', takeaway: true },
  { name: "Connext Global", location: "United States / Philippines", visits: '50,200', googleAds: 'Yes', metaAds: 'No', takeaway: true },
  { name: "Mintrix", location: "Australia", visits: '887', googleAds: 'No', metaAds: 'No', takeaway: false },
]

export const COMPETITOR_WRITEUPS: readonly CompetitorWriteup[] = [
  {
    name: "Somewhere",
    location: "United States",
    website: "https://somewhere.com",
    description: "Puts a full lead form directly in the fold , with the headline built around a hard number: top 1% talent for up to 80% less than US equivalents. Risk reversal sits under the submit button, \"you don't pay us anything if we don't find you the perfect person\". On mobile the form survives the fold intact.",
    takeaways: [
      { title: "Clarify the commercial offer.", text: "“Pay only when you hire,” an itemised service, a refundable deposit, and a visible guarantee reduce uncertainty." },
      { title: "Make savings interactive.", text: "Role, seniority, and market comparisons turn a broad cost-saving claim into a useful planning tool." },
      { title: "Support self-service research.", text: "Popular roles, salary ranges, and savings help visitors assess fit before submitting an enquiry." },
      { title: "Concentrate social proof.", text: "Recognisable client logos paired with short testimonials provide fast reassurance without lengthy case studies." },
    ],
    comment: "",
  },
  {
    name: "BruntWork",
    location: "Australia / Global",
    website: "https://bruntwork.co",
    description: "The entire left half of the fold is a lead form on a white card. The subhead removes three objections in a single line: \"Full-time remote staff from $4/hr. Hire in days, not months. Cancel anytime.\" The final field is pre-filled with a worked example to show the expected answer.",
    takeaways: [
      { title: "Lead with the customer’s desired shift.", text: "“Stop interviewing. Start delegating.” is direct, memorable, and moves the message from recruitment effort to productive capacity. Build on the idea without copying the line verbatim." },
      { title: "Make the operating offer concrete.", text: "Vetted full-time remote staff in the client’s time zone, live within a week, no lock-in contracts, up to 70% savings, hiring in under seven days, and a 20-hour weekly minimum answer key buying questions quickly. Away should only use equivalents it can substantiate and deliver." },
    ],
    comment: "",
  },
  {
    name: "Athena",
    location: "United States / Philippines",
    website: "https://athena.com",
    description: "Instead of a form, a one-click qualifying question sits in the fold: \"What best describes your role?\" with four options. It segments the visitor before asking for any contact details. The headline is purely emotional, \"The relief is immediate. The ROI is real.\"",
    takeaways: [],
    comment: "the what best describes your role? is a good way to cater to specific types of businesses to give them more direction direct from the page rather than go through the chat",
  },
  {
    name: "Wing Assistant",
    location: "United States",
    website: "https://wingassistant.com",
    description: "The densest proof stack in the category: 4.8/5 from 200+ reviews, 10,000+ companies served, 2M+ applicants screened, live in 48 hours. Candidate photos are tagged \"previously at Uber / J.P. Morgan / Nike\" , which answers the quality objection through the talent rather than the company.",
    takeaways: [
      { title: "Make speed specific.", text: "A “live in 48 hours” promise gives visitors a concrete time to value, provided the scope and starting point are clearly defined." },
      { title: "Quantify sourcing scale.", text: "“2M+ applicants screened yearly” turns recruiting capacity into immediate proof rather than a general claim about reach." },
      { title: "Reduce the commitment barrier.", text: "“Start small. Scale across teams.” makes the first engagement feel manageable while signalling a path to expansion." },
      { title: "Support two levels of buying intent.", text: "Free consultation serves visitors who need guidance, while plans and pricing helps visitors ready to compare the commercial offer." },
      { title: "Help visitors self-qualify.", text: "A clear fit and not-a-fit comparison sets expectations around ownership, scaling, oversight, short-term work, freelancer management, and price sensitivity." },
      { title: "Productise operational support.", text: "A visible workspace with task status, documented workflows, structured handoffs, and cross-time-zone continuity differentiates the service beyond supplying staff." },
    ],
    comment: "",
  },
  {
    name: "MyOutDesk",
    location: "United States",
    website: "https://myoutdesk.com",
    description: "Four benefit chips in a grid (hire in 7 days, reduce admin overload, scale without overhead, enterprise-grade security) with the rating line sitting directly under the call to action: 4.9, 700+ reviews, 8,500+ clients . Client logos start at the fold edge to pull the scroll.",
    takeaways: [
      { title: "Route visitors by intent.", text: "Immediate call, scheduled meeting, live chat, and job-seeker paths reduce ambiguity, while “Trusted by 8,500+ businesses” adds reassurance at the decision point." },
      { title: "Show recognisable client proof early.", text: "A compact logo strip communicates market adoption quickly and supports the existing review and client-count evidence near the first call to action." },
      { title: "Summarise the offer with scannable outcomes.", text: "Hiring in seven days, scaling without overhead, reducing administration, and enterprise-grade security answer distinct buying concerns in very little space. Any equivalent Away claims must be specific and supportable." },
    ],
    comment: "",
  },
  {
    name: "Pearl Talent",
    location: "United States",
    website: "https://pearltalent.com",
    description: "Centred layout carrying three statistics in the fold: 1200+ hires placed, 90%+ client retention and $3B+ raised by our clients . That last figure signals the calibre of the client base rather than the provider. The vetting claim is unusually specific, top 0.8% through a 5-stage process.",
    takeaways: [
      { title: "Make talent readiness explicit.", text: "“Pre-vetted” provides process assurance, while “AI-trained” signals current capability. Away should only use AI language when it describes a real skill standard and a clear client benefit." },
      { title: "Use expansion as evidence of delivered value.", text: "Showing that one in three clients expands within a year and expanding clients average four or more hires demonstrates confidence beyond the first placement." },
      { title: "Make retention a prominent trust signal.", text: "A 90%+ client-retention figure is concise and persuasive when its measurement period, sample, and definition are stated clearly." },
      { title: "Differentiate support after hiring.", text: "Positioning the service as a partner-not a ticketing system-and naming ongoing talent support, compliance, and payroll shows that value continues after placement." },
      { title: "Turn case studies into quantified proof.", text: "Three placements, $192k in annual overhead savings, and 34 days saved in sourcing and interviewing make the result easy to understand before reading the full story." },
    ],
    comment: "",
  },
  {
    name: "hammerjack",
    location: "Australia",
    website: "https://hammerjack.com.au",
    description: "The shortest headline in the category, \"Offshore that works. Real leverage.\" Underneath sits the strongest credential row: Fortune 100 Best Companies to Work For, two Great Place to Work marks and ISO 27001. Uniquely, it uses employer-brand awards as client-facing proof .",
    takeaways: [],
    comment: "Not much to take from this competitor",
  },
  {
    name: "Emapta",
    location: "Australia / Philippines",
    website: "https://emapta.com",
    description: "Four differentiators sit in the fold, each one naming a competitor weakness: no markup on salaries, full transparency, easy in and out terms, you maintain control . Uses a product interface mockup rather than a stock photo, with enterprise client logos at the fold edge.",
    takeaways: [
      { title: "Reduce commitment risk clearly.", text: "“Easy in and out terms” and “no long-term contracts” answer a common concern directly. Away should explain any equivalent minimum term, notice period, replacement policy, and exit conditions rather than relying on a broad flexibility claim." },
      { title: "Make the hiring system visible.", text: "Pre-vetted and pre-sourced candidates, intelligent shortlisting, days-not-weeks hiring, a single end-to-end platform, dedicated client support, and a nine-day team-building promise make the process feel tangible. Claims such as top 1% talent and 60% faster hiring need a clear methodology." },
    ],
    comment: "",
  },
  {
    name: "Cloudstaff",
    location: "Australia / Philippines",
    website: "https://cloudstaff.com",
    description: "The largest provider in the category, but a region-switch pop-up fires on load and covers the headline, and \"Powered by People+Tech\" is internal language rather than a customer benefit. \"Get Pricing\" as the main call to action is the strongest element, matching what a visitor wants.",
    takeaways: [
      { title: "Let visitors model the saving.", text: "Role, team size, experience level, onshore cost, Cloudstaff cost, monthly saving, and percentage saving turn the price proposition into a personalised business case. Away could adapt this with transparent assumptions and clearly labelled estimates." },
      { title: "Humanise technical capability.", text: "A polished staff portrait creates an approachable focal point, while simple security, AI, and global-delivery cues reinforce service capability without relying on dense copy." },
      { title: "Connect the calculator directly to conversion.", text: "“See how much you can save before you hire,” an annual-savings range, a visible team-cost estimate, and separate Get Pricing and Book a meeting actions move visitors from value exploration to the appropriate next step. Any percentage or dollar saving needs a defensible methodology." },
    ],
    comment: "",
  },
  {
    name: "MicroSourcing",
    location: "Philippines / Australia",
    website: "https://microsourcing.com",
    description: "A corporate, low-urgency fold built for procurement teams rather than founders. No pricing, no rating and no capture mechanism, which is consistent with a business that sells through tenders and referrals rather than paid traffic.",
    takeaways: [],
    comment: "Nothing here to take",
  },
  {
    name: "Beepo",
    location: "Australia",
    website: "https://beepo.com.au",
    description: "Centred hero over a dark image, with a cookie banner taking the lower third. The notable element is the middle button, \"Free eCourse\" , the only genuine lead magnet offered in the fold by an Australian provider, though it is given equal weight to the two buttons either side of it.",
    takeaways: [],
    comment: "Nothing here",
  },
  {
    name: "Satellite Office",
    location: "Australia",
    website: "https://satelliteoffice.com.au",
    description: "Clean, premium execution, but the fold does little selling. The small line above the headline carries more information than the headline itself, and the animated statistics counters sit just below the fold where a visitor has to scroll to find them.",
    takeaways: [
      { title: "Use recognisable client proof at a glance.", text: "A broad logo strip quickly communicates adoption across established brands. Away should prioritise approved, relevant logos and connect them to specific outcomes or case studies where possible." },
      { title: "Make the service model accessible from the first screen.", text: "A prominent How It Works action reduces uncertainty, while Build Your Team serves visitors ready to act. The supporting copy also combines control, transparent pricing, premium talent, flexible scaling, and ongoing support in one clear long-term partnership proposition." },
    ],
    comment: "",
  },
  {
    name: "Virtual Coworker",
    location: "Australia / United States",
    website: "https://virtualcoworker.com",
    description: "Both a US and an Australian phone number are pinned to the top bar, signalling dual-market service. Four trust medallions sit in the fold (Clutch, Forbes Business Council, Google 5-Star, founded 15 years ago), though the body copy is long and dilutes the hierarchy.",
    takeaways: [],
    comment: "- Happy picture - Clearly showing prices for no ambiguiuty",
  },
  {
    name: "VirtualStaff.ph",
    location: "Philippines",
    website: "https://virtualstaff.ph",
    description: "The clearest pricing statement of any competitor: \"You choose the staff. You agree on the salary. We charge a simple $99/month per seat, with no heavy salary markup.\" The model is explained in one sentence, though the fold carries no social proof at all.",
    takeaways: [],
    comment: "",
  },
  {
    name: "Outstaffer",
    location: "Australia",
    website: "https://outstaffer.com",
    description: "One of only a handful of Australian providers actively running paid social. Leads by rejecting the category, \"Not software. Not an agency. Just outcomes.\" and carries a \"first hire free\" offer. Framed as a product rather than a service.",
    takeaways: [],
    comment: "- They have a platform they're pushing which is something we can consider",
  },
  {
    name: "ClearDesk",
    location: "United States",
    website: "https://cleardesk.com",
    description: "A very sparse fold with significant empty space below the button. Their strongest assets (4.9/5 satisfaction, 2000+ business owners, 70% savings) all sit below the fold, and the main button \"Our Services\" is navigational rather than commercial.",
    takeaways: [],
    comment: "",
  },
  {
    name: "Staff Domain",
    location: "Australia",
    website: "https://staffdomain.com",
    description: "Positions itself as an operating system for building offshore teams rather than a traditional outsourcing provider. Clear, but makes broadly the same promise as most Australian competitors in near-identical wording.",
    takeaways: [],
    comment: "Having a clear target market: For mid-market australian businesses is helpful",
  },
  {
    name: "Outsourced.ph",
    location: "Australia / Philippines",
    website: "https://outsourced.ph",
    description: "Traditional managed-office positioning aimed at businesses building a sizeable offshore division. The minimum engagement of three to five staff is not mentioned in the fold, so smaller enquiries self-select in before being disqualified later.",
    takeaways: [],
    comment: "- the save 75% is a a good incentive - Top 1% talent in philiphines",
  },
  {
    name: "KMC Solutions",
    location: "Philippines",
    website: "https://kmc.solutions",
    description: "Runs both a staffing business and a flexible workspace business, and the fold carries both identities at once. A visitor has to work out which company they have landed on before the proposition lands.",
    takeaways: [],
    comment: "- Big brand company logos to improve trust",
  },
  {
    name: "Booth & Partners",
    location: "Philippines",
    website: "https://boothandpartners.com",
    description: "Leads with ethics, culture and sustainability rather than a commercial outcome. That appeals to a values-led buyer, but gives a cost-driven buyer nothing concrete to hold onto in the fold.",
    takeaways: [],
    comment: "",
  },
  {
    name: "Acquire BPO",
    location: "Australia",
    website: "https://acquirebpo.com",
    description: "A pure enterprise outsourcing fold, built for large tender-driven engagements. There is no entry point anywhere in the fold for a smaller business making its first offshore hire.",
    takeaways: [],
    comment: "",
  },
  {
    name: "Flat Planet",
    location: "Australia / United States",
    website: "https://flatplanet.com",
    description: "Operates across both the Philippines and South Africa, which gives genuine geographic redundancy that single-country providers cannot offer. That advantage is not mentioned anywhere in the fold.",
    takeaways: [],
    comment: "",
  },
  {
    name: "Remote CoWorker",
    location: "United States",
    website: "https://remotecoworker.com",
    description: "Competes almost entirely on the hourly rate, from $9.99 an hour. Differentiation beyond price is thin, which leaves the brand exposed to anyone pairing a similar rate with stronger proof.",
    takeaways: [],
    comment: "- 'Vetted talent', nice and clear - pricing is clear - Reviews to build trust factors - pretty image of outsourcer",
  },
  {
    name: "Yoonet",
    location: "Australia",
    website: "https://yoonet.io",
    description: "Specialises in allied health practices and publishes an unusually precise staff retention figure of 89.29%, which reads as credible precisely because it is not rounded. Both are underplayed in the fold.",
    takeaways: [],
    comment: "Adding a how it works in the header",
  },
  {
    name: "Connext Global",
    location: "United States / Philippines",
    website: "https://connextglobal.com",
    description: "Builds custom back-office teams for each client. The fold follows a standard business services template, with little that a competitor could not equally claim.",
    takeaways: [],
    comment: "- 98% retention - days to fill positions - $0 up front cost key callouts - could update what we have",
  },
  {
    name: "Mintrix",
    location: "Australia",
    website: "https://mintrix.com.au",
    description: "A smaller Australian operator running some of the sharpest paid social copy in the market, built around the difficulty of choosing between providers. The landing experience does not yet carry that same angle through from the ad.",
    takeaways: [],
    comment: "",
  },
]
