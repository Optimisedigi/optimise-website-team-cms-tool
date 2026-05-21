/**
 * Pure markdown renderer for the Client Discovery Briefing.
 *
 * Ported byte-for-byte from the `exportMarkdown()` function in
 * `public/client-discovery-briefing.html` (lines ~1235–1385), minus the
 * clipboard / `Blob` download side effects. Any change here MUST be
 * mirrored in the HTML or vice-versa so the standalone form and the
 * CMS-bound form emit identical markdown.
 */

import type { DiscoveryBriefingState } from "./types";

/**
 * Render the ranked `topGrowthChannels` list as a single markdown line,
 * falling back to the legacy single-string `topGrowthChannel` when the
 * array is empty (so older payloads still produce the same output).
 */
function formatTopGrowthChannels(state: DiscoveryBriefingState): string {
  const ranked = state.topGrowthChannels ?? [];
  if (ranked.length > 0) {
    const labels = ranked.map((v, i) => {
      const display =
        v === "other" && state.topGrowthChannelOther
          ? `Other: ${state.topGrowthChannelOther}`
          : v;
      return `${i + 1}. ${display}`;
    });
    return `**Top growth channels (ranked):** ${labels.join(", ")}`;
  }
  const legacy =
    state.topGrowthChannel === "other" && state.topGrowthChannelOther
      ? `Other: ${state.topGrowthChannelOther}`
      : state.topGrowthChannel || "Not provided";
  return `**Top growth channel:** ${legacy}`;
}

/**
 * Parse a free-form currency / number string like "$3.20" or "3.50"
 * into a finite positive number, or `null` if it doesn't look numeric.
 */
function parseLooseNumber(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Best-effort lead estimate from Google Ads budget, avg CPC, and expected
 * conversion rate. Returns a rounded integer or `null` when any input is
 * missing / non-numeric.
 */
function estimateMonthlyLeads(state: DiscoveryBriefingState): number | null {
  const budget = parseLooseNumber(state.adsBudget);
  const cpc = parseLooseNumber(state.adsAvgCpc);
  const crPercent = parseLooseNumber(state.adsConversionRate);
  if (budget == null || cpc == null || crPercent == null) return null;
  const clicks = budget / cpc;
  const leads = clicks * (crPercent / 100);
  if (!Number.isFinite(leads) || leads <= 0) return null;
  return Math.round(leads);
}

/**
 * Render a discovery briefing state to its canonical markdown form.
 *
 * Pure function — no I/O, no clipboard, no DOM access. Safe to call from
 * server-side route handlers, Payload hooks, or the browser.
 */
export function buildDiscoveryBriefingMarkdown(
  state: DiscoveryBriefingState,
): string {
  const lines: string[] = [
    "# Client Discovery Briefing",
    "",
    `**Business:** ${state.businessName || "Not provided"}`,
    `**Website:** ${state.websiteUrl || "Not provided"}`,
    "",
    "## Business Overview",
    "",
    state.oneLiner || "Not provided",
    "",
    "---",
    "",
    "## Commercials & Growth",
    "",
    `**Average order value:** ${state.averageOrderValue || "Not provided"}`,
    `**Purchase frequency (per client per year):** ${state.purchaseFrequency || "Not provided"}`,
    `**Current new leads / month:** ${state.newLeadsPerMonth || "Not provided"}`,
    `**Ideal lead volume / month:** ${state.idealLeadVolume || "Not provided"}`,
    formatTopGrowthChannels(state),
    "",
    "---",
    "",
    "## Core Services",
    "",
  ];

  if (state.services.length > 0) {
    state.services.forEach((s) => {
      const margin = s.highMargin ? " (high margin)" : "";
      const focus = s.focus ? " — priority focus" : "";
      lines.push(`- ${s.name || "Unnamed"}${margin}${focus}`);
    });
  } else {
    lines.push("Not provided");
  }

  lines.push("", `**Revenue split:** ${state.revenueSplit || "Not provided"}`);
  lines.push("", "---", "", "## Target Audience", "");
  lines.push(`**Ideal client:** ${state.idealClient || "Not provided"}`);
  lines.push(`**Locations:** ${state.locations || "Not provided"}`);
  lines.push(`**Geographic focus:** ${state.geoFocus || "Not provided"}`);
  if (state.industries.length > 0) {
    const industryList = state.industries
      .map((i) =>
        i === "other" && state.industryOther
          ? "Other: " + state.industryOther
          : i,
      )
      .join(", ");
    lines.push(`**Industries:** ${industryList}`);
  }

  lines.push("", "---", "", "## USP & Differentiation", "");
  lines.push(`**USP:** ${state.usp || "Not provided"}`);
  lines.push(
    "",
    `**Competitors you admire or want to mimic:** ${state.competitorsAdmire || "Not provided"}`,
  );
  lines.push(
    "",
    `**Differentiation:** ${state.differentiators || "Not provided"}`,
  );

  lines.push("", "---", "", "## Brand Assets & Voice", "");
  lines.push(`**Logo / assets:** ${state.brandLogoNotes || "Not provided"}`);
  lines.push(`**Colours:** ${state.brandColors || "Not provided"}`);
  lines.push(`**Fonts:** ${state.brandFonts || "Not provided"}`);
  lines.push(
    `**Style guide:** ${state.brandStyleGuideUrl || "Not provided"}`,
  );
  const toneList = (state.brandToneOfVoice ?? [])
    .map((t) =>
      t === "other" && state.brandToneOfVoiceOther
        ? `Other: ${state.brandToneOfVoiceOther}`
        : t,
    )
    .join(", ");
  lines.push(`**Tone of voice:** ${toneList || "Not provided"}`);
  lines.push(
    `**Reference sites / writing:** ${state.brandReferenceSites || "Not provided"}`,
  );

  lines.push("", "---", "", "## Tech Stack", "");
  lines.push(
    `**CRM:** ${state.crm || "Not provided"}${state.crm === "other" && state.crmOther ? " — " + state.crmOther : ""}`,
  );
  lines.push(
    `**Email:** ${state.emailMarketing || "Not provided"}${state.emailMarketing === "other" && state.emailMarketingOther ? " — " + state.emailMarketingOther : ""}`,
  );
  lines.push(
    `**Calendar / scheduling:** ${state.calendarScheduling || "Not provided"}${state.calendarScheduling === "other" && state.calendarSchedulingOther ? " — " + state.calendarSchedulingOther : ""}`,
  );
  lines.push(
    `**Project management:** ${state.projectManagement || "Not provided"}${state.projectManagement === "other" && state.projectManagementOther ? " — " + state.projectManagementOther : ""}`,
  );
  lines.push(
    `**Payment processor:** ${state.paymentProcessor || "Not provided"}${state.paymentProcessor === "other" && state.paymentProcessorOther ? " — " + state.paymentProcessorOther : ""}`,
  );
  lines.push(
    `**Communication / phone:** ${state.communication || "Not provided"}${state.communication === "other" && state.communicationOther ? " — " + state.communicationOther : ""}`,
  );
  lines.push(
    `**CMS:** ${state.cms || "Not provided"}${state.cms === "other" && state.cmsOther ? " — " + state.cmsOther : ""}`,
  );
  lines.push(
    `**Analytics:** ${state.analytics || "Not provided"}${state.analytics === "other" && state.analyticsOther ? " — " + state.analyticsOther : ""}`,
  );
  lines.push("", `**Other tools:** ${state.otherTools || "Not provided"}`);

  lines.push("", "### Tools & Access", "");
  const fmtStatus = (v: string): string => {
    if (v === "yes") return "yes";
    if (v === "no") return "no";
    if (v === "unsure") return "not sure";
    return "not provided";
  };
  const fmtAccess = (v: string): string => {
    if (v === "yes") return "granted";
    if (v === "no") return "not yet";
    if (v === "later") return "will provide later";
    return "not provided";
  };
  const toolLine = (
    label: string,
    status: string,
    access: string,
    extraLabel?: string,
    extraValue?: string,
  ): string => {
    const base = `- **${label}:** Has it: ${fmtStatus(status)} — Access: ${fmtAccess(access)}`;
    if (extraLabel && extraValue) return `${base} — ${extraLabel}: ${extraValue}`;
    return base;
  };
  lines.push(
    toolLine(
      "Search Console",
      state.toolSearchConsoleStatus,
      state.toolSearchConsoleAccess,
    ),
  );
  lines.push(toolLine("GA4", state.toolGa4Status, state.toolGa4Access));
  lines.push(toolLine("GTM", state.toolGtmStatus, state.toolGtmAccess));
  lines.push(
    toolLine(
      "Hosting",
      state.toolHostingStatus,
      state.toolHostingAccess,
      "Provider",
      state.toolHostingProvider,
    ),
  );
  lines.push(
    toolLine(
      "DNS",
      state.toolDnsStatus,
      state.toolDnsAccess,
      "Provider",
      state.toolDnsProvider,
    ),
  );
  lines.push(
    toolLine(
      "Backlinks tool",
      state.toolBacklinksStatus,
      state.toolBacklinksAccess,
      "Tool",
      state.toolBacklinksTool,
    ),
  );
  lines.push(
    toolLine(
      "Review platforms",
      state.toolReviewsStatus,
      state.toolReviewsAccess,
      "Platforms",
      state.toolReviewsPlatforms,
    ),
  );
  const prDoneDisplay =
    state.prDone === "yes" ? "yes" : state.prDone === "no" ? "no" : "not provided";
  const prSuffix = state.prDetails ? ` — ${state.prDetails}` : "";
  lines.push(`- **PR done:** ${prDoneDisplay}${prSuffix}`);
  lines.push(
    `- **Existing backlinks to protect:** ${state.existingBacklinksNotes || "Not provided"}`,
  );

  lines.push("", "---", "", "## Current SEO & Online Presence", "");
  const gbp: string[] = [];
  if (state.gbpExists) gbp.push("Claimed and optimised");
  if (state.gbpPartial) gbp.push("Claimed but needs work");
  if (state.gbpNone) gbp.push("Not claimed");
  lines.push(
    `**Google Business Profile:** ${gbp.join(", ") || "Not specified"}`,
  );
  if (state.gbpExists || state.gbpPartial || state.gbpNone) {
    if (state.gbpUpdateDetails)
      lines.push("  - Keeps business details up to date");
    if (state.gbpRespondReviews) lines.push("  - Responds to reviews");
    if (state.gbpPostRegularly)
      lines.push("  - Posts regularly (updates, offers, photos)");
  }

  const social: string[] = [];
  if (state.socialLinkedin) social.push("LinkedIn");
  if (state.socialFacebook) social.push("Facebook");
  if (state.socialInstagram) social.push("Instagram");
  if (state.socialTwitter) social.push("Twitter/X");
  if (state.socialTikTok) social.push("TikTok");
  if (state.socialYoutube) social.push("YouTube");
  lines.push(`**Social media:** ${social.join(", ") || "None specified"}`);
  const handles: string[] = [];
  if (state.socialLinkedin && state.socialLinkedinHandle)
    handles.push(`LinkedIn: ${state.socialLinkedinHandle}`);
  if (state.socialFacebook && state.socialFacebookHandle)
    handles.push(`Facebook: ${state.socialFacebookHandle}`);
  if (state.socialInstagram && state.socialInstagramHandle)
    handles.push(`Instagram: ${state.socialInstagramHandle}`);
  if (state.socialTwitter && state.socialTwitterHandle)
    handles.push(`Twitter/X: ${state.socialTwitterHandle}`);
  if (state.socialTikTok && state.socialTikTokHandle)
    handles.push(`TikTok: ${state.socialTikTokHandle}`);
  if (state.socialYoutube && state.socialYoutubeHandle)
    handles.push(`YouTube: ${state.socialYoutubeHandle}`);
  if (handles.length > 0)
    lines.push("", `**Social handles:** ${handles.join(" · ")}`);

  lines.push("", "---", "", "## Social Proof", "");
  lines.push(`**Notable clients:** ${state.notableClients || "Not provided"}`);
  lines.push(
    "",
    `**Notable individuals:** ${state.notableIndividuals || "Not provided"}`,
  );

  if (state.proof.length > 0) {
    lines.push("", "### Testimonials / Case Studies");
    state.proof.forEach((p) => {
      if (p.client || p.testimonial) {
        const suffix = p.useOnSite ? " — OK to use on website" : "";
        lines.push(`- **${p.client || "Client"}:** ${p.testimonial || ""}${suffix}`);
      }
    });
  }

  const reviews: string[] = [];
  if (state.reviewsGoogle) reviews.push("Google Reviews");
  if (state.reviewsFacebook) reviews.push("Facebook Reviews");
  if (state.reviewsClutch) reviews.push("Clutch/Industry");
  if (state.reviewsNone) reviews.push("None yet");
  lines.push("", `**Reviews:** ${reviews.join(", ") || "Not specified"}`);

  lines.push("", "---", "", "## Content Strategy", "");
  const content: string[] = [];
  if (state.contentBlog) content.push("Blog posts");
  if (state.contentCaseStudies) content.push("Case studies");
  if (state.contentGuides) content.push("How-to guides");
  if (state.contentVideos) content.push("Videos");
  if (state.contentInfographics) content.push("Infographics");
  lines.push(`**Content focus:** ${content.join(", ") || "Not specified"}`);
  lines.push(
    "",
    `**Topics & angles the audience cares about:** ${state.contentNotes || "Not provided"}`,
  );

  const pillarRows = (state.pillarTopics ?? []).filter(
    (p) => (p.name ?? "").trim() !== "",
  );
  if (pillarRows.length > 0) {
    lines.push("", "### Pillar Topics", "");
    pillarRows.forEach((p, i) => {
      lines.push(`${i + 1}. ${p.name.trim() || "Unnamed topic"}`);
    });
  }

  const faqRows = (state.faqs ?? []).filter(
    (f) => (f.question ?? "").trim() !== "" || (f.answer ?? "").trim() !== "",
  );
  if (faqRows.length > 0) {
    lines.push("", "### FAQs", "");
    faqRows.forEach((f) => {
      lines.push(`**Q:** ${f.question.trim() || ""}`);
      lines.push(`**A:** ${f.answer.trim() || ""}`);
      lines.push("");
    });
    // Trim trailing empty string we just pushed for separation
    if (lines[lines.length - 1] === "") lines.pop();
  }

  lines.push("", "---", "", "## Google Ads", "");
  lines.push(`**Status:** ${state.adsStatus || "Not provided"}`);
  lines.push(`**Budget:** ${state.adsBudget || "Not provided"}`);
  lines.push("", `**Campaigns:** ${state.adsCampaigns || "Not provided"}`);
  lines.push(`**Average CPC:** ${state.adsAvgCpc || "Not provided"}`);
  lines.push(
    `**Expected conversion rate:** ${state.adsConversionRate || "Not provided"}`,
  );
  const estimatedLeads = estimateMonthlyLeads(state);
  if (estimatedLeads != null) {
    lines.push(`**Estimated leads / month:** ${estimatedLeads}`);
  }

  lines.push("", "---", "", "## Timeline", "");
  lines.push(`**Launch date:** ${state.launchDate || "Not provided"}`);
  lines.push("", `**Deadlines:** ${state.deadlines || "Not provided"}`);

  lines.push("", "---", "", "## Working Relationship", "");
  lines.push(
    `**Point of contact (changes, approvals, asset requests):** ${state.pointOfContact || "Not provided"}`,
  );
  if (state.linkedDeckSlug) {
    lines.push(`**Linked proposal deck:** ${state.linkedDeckSlug}`);
  }

  lines.push("", "---", "", "## Lead Nurturing", "");
  if (state.leadNurturingSteps.length > 0) {
    lines.push("### Current process");
    state.leadNurturingSteps.forEach((s, i) => {
      if (s.step || s.owner) {
        const stepText = s.step || "Unnamed step";
        const ownerText = s.owner ? ` — ${s.owner}` : "";
        lines.push(`${i + 1}. ${stepText}${ownerText}`);
      }
    });
  } else {
    lines.push("**Current process:** Not provided");
  }
  lines.push(
    "",
    `**Future-state notes:** ${state.leadNurturingFutureNotes || "Not provided"}`,
  );

  const hasAdditionalDetails =
    (state.complianceNotes ?? "").trim() !== "" ||
    (state.decisionMakerNotes ?? "").trim() !== "" ||
    (state.hostingDnsNotes ?? "").trim() !== "";
  if (hasAdditionalDetails) {
    lines.push("", "---", "", "## Additional Details", "");
    if ((state.complianceNotes ?? "").trim() !== "") {
      lines.push(`**Compliance notes:** ${state.complianceNotes}`);
    }
    if ((state.decisionMakerNotes ?? "").trim() !== "") {
      lines.push(
        `**Decision-maker / approval cycle:** ${state.decisionMakerNotes}`,
      );
    }
    if ((state.hostingDnsNotes ?? "").trim() !== "") {
      lines.push(`**Hosting / DNS notes:** ${state.hostingDnsNotes}`);
    }
  }

  lines.push("", "---", "", "## Discovery Notes", "");
  lines.push(
    `**Additional notes:** ${state.additionalNotes || "Not provided"}`,
  );
  lines.push(
    "",
    `**Questions for us:** ${state.questionsForUs || "Not provided"}`,
  );
  lines.push("", `**Internal notes:** ${state.internalNotes || "Not provided"}`);

  lines.push(
    "",
    "",
    "---",
    "",
    "*Generated by Optimise Digital — Client Discovery Briefing*",
  );

  return lines.join("\n");
}
