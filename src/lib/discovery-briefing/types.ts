/**
 * Shared types + default factory for the Client Discovery Briefing
 * questionnaire.
 *
 * Source of truth: the `DEFAULT_STATE` object in
 * `public/client-discovery-briefing.html` (lines ~923–1000).
 *
 * Keep this file in sync with that object — both the standalone HTML form
 * and the Payload-bound form/markdown renderer rely on the same shape.
 */

/** A single row of the dynamic "Core Services" list. */
export interface DiscoveryBriefingService {
  /** Service name. */
  name: string;
  /** Flagged as a high-margin offering. */
  highMargin: boolean;
  /** Marked as a priority focus. */
  focus: boolean;
}

/** A single row of the dynamic "Testimonials / Case Studies" list. */
export interface DiscoveryBriefingProof {
  /** Client name (or anonymised label). */
  client: string;
  /** The testimonial / case study blurb. */
  testimonial: string;
  /** Whether we have permission to use this on the website. */
  useOnSite: boolean;
}

/** A single step in the lead nurturing process. */
export interface DiscoveryBriefingNurtureStep {
  /** What happens at this step (e.g. "Lead form submitted", "Welcome email"). */
  step: string;
  /** Who or what owns this step (e.g. "Sales rep", "Mailchimp automation"). */
  owner: string;
}

/** A single pillar topic in the content strategy. */
export interface DiscoveryBriefingPillarTopic {
  /** Topic name. */
  name: string;
}

/** A single FAQ row in the content strategy. */
export interface DiscoveryBriefingFaq {
  /** Question text. */
  question: string;
  /** Answer text. */
  answer: string;
}

/** A simple audience type defined in the Target Audience section.
 * Contains just a name/description — the economic data lives in
 * `DiscoveryBriefingAudienceSegment`.
 */
export interface DiscoveryBriefingAudienceType {
  /** Display label, e.g. "Small Business", "Enterprise", "Personal". */
  name: string;
  /** Optional description or notes about this audience type. */
  description: string;
}

/**
 * A single audience-type column under Commercials & Growth. Each segment
 * captures the four economic inputs for one customer type (e.g.
 * "Personal", "Business customers"). Names are synced from `targetAudienceTypes`.
 */
export interface DiscoveryBriefingAudienceSegment {
  /** Display label, e.g. "Personal", "Business customers". */
  name: string;
  averageOrderValue: string;
  purchaseFrequency: string;
  newLeadsPerMonth: string;
  idealLeadVolume: string;
}

/** A single lead magnet row. */
export interface DiscoveryBriefingLeadMagnet {
  /** Label, e.g. "Free SEO audit". */
  name: string;
  /** Optional one-line description / what the prospect gets. */
  description: string;
  /** Optional CTA destination, free-form. */
  cta: string;
}

/** A single RACI matrix row. */
export interface DiscoveryBriefingRaciRow {
  task: string;
  responsible: string;
  accountable: string;
  consulted: string;
  informed: string;
}

/**
 * Stable section ids used by the form's per-section visibility toggles
 * and the markdown renderer's hidden-section guards.
 */
export const DISCOVERY_BRIEFING_SECTIONS = [
  "businessOverview",
  "coreServices",
  "targetAudience",
  "commercials",
  "usp",
  "brand",
  "techStack",
  "seoPresence",
  "socialProof",
  "leadMagnets",
  "contentStrategy",
  "googleAds",
  "timeline",
  "workingRelationship",
  "raci",
  "leadNurturing",
  "discoveryNotes",
  "additionalDetails",
] as const;
export type DiscoveryBriefingSectionId = (typeof DISCOVERY_BRIEFING_SECTIONS)[number];

/**
 * Full shape of the discovery briefing state — mirrors the HTML form's
 * `DEFAULT_STATE` object plus the `specialisms` field that the HTML
 * binds via `data-key` but omits from `DEFAULT_STATE`.
 */
export interface DiscoveryBriefingState {
  // ── Section 1 · Business overview ─────────────────────────────────
  businessName: string;
  websiteUrl: string;
  oneLiner: string;

  // ── Section 1.5 · Commercials & growth ───────────────────────────
  averageOrderValue: string;
  purchaseFrequency: string;
  newLeadsPerMonth: string;
  idealLeadVolume: string;
  /**
   * Top growth channels today, ranked in selection order (first picked =
   * #1). Values come from GROWTH_CHANNELS in DiscoveryBriefingForm; the
   * literal string `"other"` pairs with `topGrowthChannelOther`.
   *
   * Legacy single-string field `topGrowthChannel` (below) is preserved for
   * backwards-compat with older persisted payloads — readers should prefer
   * `topGrowthChannels` when both are populated.
   */
  topGrowthChannels: string[];
  /** Legacy single-select — see `topGrowthChannels`. */
  topGrowthChannel: string;
  topGrowthChannelOther: string;

  // ── Section 2 · Core services ─────────────────────────────────────
  services: DiscoveryBriefingService[];
  revenueSplit: string;
  /**
   * Present on the HTML form via `data-key="specialisms"` but missing
   * from the original `DEFAULT_STATE`. Optional here for backwards
   * compatibility with older persisted payloads.
   */
  specialisms?: string;

  // ── Section 3 · Target audience ───────────────────────────────────
  idealClient: string;
  locations: string;
  geoFocus: string;
  industries: string[];
  industryOther: string;
  /** Audience types defined here and synced to audienceSegments in Commercials. */
  targetAudienceTypes: DiscoveryBriefingAudienceType[];

  // ── Section 4 · USP & differentiation ─────────────────────────────
  usp: string;
  competitorsAdmire: string;
  differentiators: string;

  // ── Section 4.5 · Brand assets & voice ────────────────────────────
  /** Free-form note: link to drive/folder where logos live, etc. */
  brandLogoNotes: string;
  /** Brand colour palette free-form (e.g. "#1A1A1A primary, #2563EB accent"). */
  brandColors: string;
  /** Brand typography free-form. */
  brandFonts: string;
  /** URL to a brand style guide if one exists. */
  brandStyleGuideUrl: string;
  /** Tone-of-voice descriptors (chip multi-select). "other" pairs with brandToneOfVoiceOther. */
  brandToneOfVoice: string[];
  /** Free-form "Other" tone-of-voice text paired with brandToneOfVoice. */
  brandToneOfVoiceOther: string;
  /** Free-form list of reference sites / writing the client admires. */
  brandReferenceSites: string;

  // ── Section 5 · Tech stack ────────────────────────────────────────
  crm: string;
  crmOther: string;
  emailMarketing: string;
  emailMarketingOther: string;
  calendarScheduling: string;
  calendarSchedulingOther: string;
  /**
   * Dormant — present in DEFAULT_STATE but no UI element renders it.
   * Preserved for backwards-compat with any saved local state.
   */
  currentPlatform: string;
  /** Dormant — see `currentPlatform`. */
  currentPlatformOther: string;
  projectManagement: string;
  projectManagementOther: string;
  paymentProcessor: string;
  paymentProcessorOther: string;
  communication: string;
  communicationOther: string;
  analytics: string;
  analyticsOther: string;
  cms: string;
  cmsOther: string;
  otherTools: string;

  // ── Section 5.5 · Tools & access checklist ────────────────────────
  /** Each tool has a status (yes/no/unsure) and access (yes/no/later) value. */
  toolSearchConsoleStatus: string;
  toolSearchConsoleAccess: string;
  toolGa4Status: string;
  toolGa4Access: string;
  toolGtmStatus: string;
  toolGtmAccess: string;
  toolHostingStatus: string;
  toolHostingAccess: string;
  toolHostingProvider: string;
  toolDnsStatus: string;
  toolDnsAccess: string;
  toolDnsProvider: string;
  toolBacklinksStatus: string;
  toolBacklinksAccess: string;
  toolBacklinksTool: string;
  toolReviewsStatus: string;
  toolReviewsAccess: string;
  toolReviewsPlatforms: string;
  /** Any PR work done? "yes" | "no" | "". */
  prDone: string;
  /** PR details free-form (publications, dates, etc.). */
  prDetails: string;
  /** Notes on existing backlinks worth protecting. */
  existingBacklinksNotes: string;
  /** Slug of a presentation/deck on the parent record this briefing is linked to. */
  linkedDeckSlug: string;

  // ── Section 6 · Current SEO & online presence ─────────────────────
  gbpExists: boolean;
  gbpPartial: boolean;
  gbpNone: boolean;
  gbpUpdateDetails: boolean;
  gbpRespondReviews: boolean;
  gbpPostRegularly: boolean;
  socialLinkedin: boolean;
  socialLinkedinHandle: string;
  socialFacebook: boolean;
  socialFacebookHandle: string;
  socialInstagram: boolean;
  socialInstagramHandle: string;
  socialTwitter: boolean;
  socialTwitterHandle: string;
  socialTikTok: boolean;
  socialTikTokHandle: string;
  socialYoutube: boolean;
  socialYoutubeHandle: string;

  // ── Section 7 · Social proof ──────────────────────────────────────
  notableClients: string;
  notableIndividuals: string;
  proof: DiscoveryBriefingProof[];
  reviewsGoogle: boolean;
  reviewsFacebook: boolean;
  reviewsClutch: boolean;
  reviewsNone: boolean;

  // ── Section 8 · SEO strategy ──────────────────────────────────────
  seoGoal: string;
  targetKeywords: string;
  contentBlog: boolean;
  contentCaseStudies: boolean;
  contentGuides: boolean;
  contentVideos: boolean;
  contentInfographics: boolean;
  contentServicePages: boolean;

  // ── Section 8 · Content strategy ──────────────────────────────────
  /**
   * Free-form notes — which content types the client thinks will resonate
   * with their audience and the angles/topics they want to cover.
   */
  contentNotes: string;
  /** Pillar topics — dynamic list (single name field per row). */
  pillarTopics: DiscoveryBriefingPillarTopic[];
  /** FAQs — dynamic list with question + answer per row. */
  faqs: DiscoveryBriefingFaq[];

  // ── Section 9 · Google Ads ────────────────────────────────────────
  /** Radio: `"active" | "paused" | "never" | "managed" | ""`. */
  adsStatus: string;
  adsBudget: string;
  adsCampaigns: string;
  /** Legacy — no longer surfaced in the form, retained for old payloads. */
  negativeKeywords: string;
  /** Lead calculator inputs — free-form text so we can accept "$3.20" etc. */
  adsAvgCpc: string;
  /** Expected conversion rate as a percent (e.g. "3.5"). */
  adsConversionRate: string;

  // ── Section 10 · Timeline ─────────────────────────────────────────
  /** Legacy — form no longer asks; kept for older persisted payloads. */
  websiteBudget: string;
  /** Legacy — form no longer asks; kept for older persisted payloads. */
  seoBudget: string;
  launchDate: string;
  deadlines: string;

  // ── Section 10.5 · Working relationship ───────────────────────────
  /** Point of contact for changes, approvals, asset requests, etc. */
  pointOfContact: string;

  // ── Section 10.7 · Lead nurturing ─────────────────────────────────
  /** Ordered steps describing how leads are nurtured today. */
  leadNurturingSteps: DiscoveryBriefingNurtureStep[];
  /** Free-form notes on what the future-state lead nurturing flow looks like. */
  leadNurturingFutureNotes: string;

  // ── Section 11 · Discovery notes ──────────────────────────────────
  additionalNotes: string;
  questionsForUs: string;
  internalNotes: string;

  // ── Section 12 · Additional details (collapsed by default) ────────
  /** Compliance notes (regulated industry constraints, etc.). */
  complianceNotes: string;
  /** Legacy — no longer surfaced in the form, retained for old payloads. */
  decisionMakerNotes: string;
  /** Legacy — no longer surfaced in the form, retained for old payloads. */
  hostingDnsNotes: string;

  // ── Multi-audience commercials ────────────────────────────────────
  /**
   * Per-audience-type economic inputs. When empty, the form/markdown fall
   * back to the legacy top-level `averageOrderValue` / `purchaseFrequency`
   * / `newLeadsPerMonth` / `idealLeadVolume` fields for backwards compat.
   * Names are synced from `targetAudienceTypes` on the client side.
   */
  audienceSegments: DiscoveryBriefingAudienceSegment[];

  // ── Lead magnets ──────────────────────────────────────────────────
  leadMagnets: DiscoveryBriefingLeadMagnet[];
  leadMagnetsNotes: string;

  // ── RACI & approvals ──────────────────────────────────────────────
  raciRows: DiscoveryBriefingRaciRow[];
  /** Free-form "who approves what" notes. */
  approvalsNotes: string;

  // ── Per-section visibility ────────────────────────────────────────
  /**
   * Section ids (see `DISCOVERY_BRIEFING_SECTIONS`) that should be hidden
   * from the rendered markdown and shown as a collapsed header in the
   * form. Always treat missing as empty.
   */
  hiddenSections: string[];
}

/**
 * Returns a fresh, empty discovery-briefing state.
 *
 * Mirrors the `DEFAULT_STATE` object from `public/client-discovery-briefing.html`
 * exactly. Always returns a new object (and new arrays) so callers can
 * freely mutate the result without aliasing.
 */
export function defaultDiscoveryBriefingState(): DiscoveryBriefingState {
  return {
    businessName: "",
    websiteUrl: "",
    oneLiner: "",
    averageOrderValue: "",
    purchaseFrequency: "",
    newLeadsPerMonth: "",
    idealLeadVolume: "",
    topGrowthChannels: [],
    topGrowthChannel: "",
    topGrowthChannelOther: "",
    services: [],
    revenueSplit: "",
    idealClient: "",
    locations: "",
    geoFocus: "",
    industries: [],
    industryOther: "",
    targetAudienceTypes: [],
    usp: "",
    competitorsAdmire: "",
    differentiators: "",
    brandLogoNotes: "",
    brandColors: "",
    brandFonts: "",
    brandStyleGuideUrl: "",
    brandToneOfVoice: [],
    brandToneOfVoiceOther: "",
    brandReferenceSites: "",
    crm: "",
    crmOther: "",
    emailMarketing: "",
    emailMarketingOther: "",
    calendarScheduling: "",
    calendarSchedulingOther: "",
    currentPlatform: "",
    currentPlatformOther: "",
    projectManagement: "",
    projectManagementOther: "",
    paymentProcessor: "",
    paymentProcessorOther: "",
    communication: "",
    communicationOther: "",
    analytics: "",
    analyticsOther: "",
    cms: "",
    cmsOther: "",
    otherTools: "",
    toolSearchConsoleStatus: "",
    toolSearchConsoleAccess: "",
    toolGa4Status: "",
    toolGa4Access: "",
    toolGtmStatus: "",
    toolGtmAccess: "",
    toolHostingStatus: "",
    toolHostingAccess: "",
    toolHostingProvider: "",
    toolDnsStatus: "",
    toolDnsAccess: "",
    toolDnsProvider: "",
    toolBacklinksStatus: "",
    toolBacklinksAccess: "",
    toolBacklinksTool: "",
    toolReviewsStatus: "",
    toolReviewsAccess: "",
    toolReviewsPlatforms: "",
    prDone: "",
    prDetails: "",
    existingBacklinksNotes: "",
    linkedDeckSlug: "",
    gbpExists: false,
    gbpPartial: false,
    gbpNone: false,
    gbpUpdateDetails: false,
    gbpRespondReviews: false,
    gbpPostRegularly: false,
    socialLinkedin: false,
    socialLinkedinHandle: "",
    socialFacebook: false,
    socialFacebookHandle: "",
    socialInstagram: false,
    socialInstagramHandle: "",
    socialTwitter: false,
    socialTwitterHandle: "",
    socialTikTok: false,
    socialTikTokHandle: "",
    socialYoutube: false,
    socialYoutubeHandle: "",
    notableClients: "",
    notableIndividuals: "",
    proof: [],
    reviewsGoogle: false,
    reviewsFacebook: false,
    reviewsClutch: false,
    reviewsNone: false,
    seoGoal: "",
    targetKeywords: "",
    contentBlog: false,
    contentCaseStudies: false,
    contentGuides: false,
    contentVideos: false,
    contentInfographics: false,
    contentServicePages: false,
    contentNotes: "",
    pillarTopics: [],
    faqs: [],
    adsStatus: "",
    adsBudget: "",
    adsCampaigns: "",
    negativeKeywords: "",
    adsAvgCpc: "",
    adsConversionRate: "",
    websiteBudget: "",
    seoBudget: "",
    launchDate: "",
    deadlines: "",
    pointOfContact: "",
    leadNurturingSteps: [],
    leadNurturingFutureNotes: "",
    additionalNotes: "",
    questionsForUs: "",
    internalNotes: "",
    complianceNotes: "",
    decisionMakerNotes: "",
    hostingDnsNotes: "",
    audienceSegments: [],
    leadMagnets: [],
    leadMagnetsNotes: "",
    raciRows: [],
    approvalsNotes: "",
    hiddenSections: [],
  };
}
