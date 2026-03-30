/**
 * Drip Email Preview Builder
 *
 * Reconstructs the exact email HTML that was sent to a lead.
 * Copied from optimise-website/lib/email/google-ads-emails.ts — keep in sync
 * if the templates change on the main website.
 */

// ─── Types ───────────────────────────────────────────────────

export interface AuditLeadData {
  name: string;
  email: string;
  website: string;
  monthlySpend: string;
  biggestConcern: string;
  additionalNotes: string;
}

// ─── Helpers ─────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const BOOKING_LINK = "https://calendar.app.google/74d3MPADMc6CLSWD8";

function isNotSpending(data: AuditLeadData): boolean {
  return data.monthlySpend === "not-spending";
}

function isConsultation(data: AuditLeadData): boolean {
  return isNotSpending(data) && data.biggestConcern === "want-consultation";
}

function isWebsiteAudit(data: AuditLeadData): boolean {
  return isNotSpending(data) && data.biggestConcern === "want-campaign-structure";
}

// ─── Shared styles ───────────────────────────────────────────

const emailWrapper = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; line-height: 1.6; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; }
    h3 { color: #1a1a1a; font-size: 16px; margin-top: 24px; margin-bottom: 8px; }
    p { margin: 0 0 16px 0; font-size: 15px; color: #333; }
    ul { margin: 0 0 16px 0; padding-left: 20px; }
    li { margin-bottom: 6px; font-size: 15px; color: #333; }
    a { color: #2563eb; text-decoration: underline; }
    .steps { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px 24px; margin: 20px 0; }
    .steps p { margin-bottom: 10px; }
    .highlight { background: #f0fdf4; border-left: 4px solid #22c55e; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0; }
    .highlight p { margin: 0; color: #166534; }
    .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 13px; color: #6b7280; }
    .signature { font-weight: 600; color: #1a1a1a; }
    .cta-link { display: inline-block; background: #2563eb; color: #ffffff !important; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; margin: 8px 0; }
  </style>
</head>
<body>
  <div class="container">
    ${content}
  </div>
</body>
</html>
`;

// ─── Concern / spend blocks ──────────────────────────────────

function getConcernBlock(concern: string): string {
  switch (concern) {
    case "agency-performance":
      return `<p>You mentioned your current agency isn't delivering results. That's one of the most common reasons businesses come to us. Our audit will give you a clear, objective view of what's actually happening in your account, so you have the data to make the right decision.</p>`;
    case "agency-quality":
      return `<p>You mentioned you're not sure if your agency is doing a good job. That's completely fair, and honestly, most businesses don't have visibility into what's actually happening. Our audit gives you that clarity. No spin, just the data.</p>`;
    case "scaling":
      return `<p>You mentioned you want to scale profitably. That's exactly where our approach is strongest. We'll look at your current structure, bidding strategy, and conversion data to identify where there's room to grow without blowing out your cost per lead.</p>`;
    case "not-sure":
      return `<p>You mentioned you're not sure what the issue is, and that's exactly why the audit exists. We'll go through everything and give you a clear picture of where things stand. If your account is already well managed, we'll tell you that too.</p>`;
    default:
      return "";
  }
}

function getSpendBlock(spend: string): string {
  switch (spend) {
    case "under-2k":
      return `<p>Even at smaller budgets, our audit regularly uncovers 20-40% of spend going to irrelevant searches. That adds up quickly.</p>`;
    case "2k-5k":
      return `<p>At your spend level, even small inefficiencies compound fast. We typically find $500-$2,000/month in wasted spend in accounts this size.</p>`;
    case "5k-15k":
    case "15k-50k":
    case "50k-plus":
      return `<p>At your spend level, the impact of a proper audit is significant. We regularly find 20-40% of budget going to searches that will never convert.</p>`;
    default:
      return "";
  }
}

// ═════════════════════════════════════════════════════════════
// EMAIL 1
// ═════════════════════════════════════════════════════════════

function buildEmail1_ActiveSpender(data: AuditLeadData): { subject: string; html: string } {
  const name = escapeHtml(data.name);
  const subject = data.name
    ? `We've received your audit request, ${data.name}`
    : `We've received your audit request`;
  const greeting = data.name ? `Hi ${name},` : "Hi,";

  const html = emailWrapper(`
    <p>${greeting}</p>
    <p>Thanks for reaching out. We've received your request and your account is now in our queue.</p>
    <h3>What we'll cover in your audit:</h3>
    <ul>
      <li>Where budget is being wasted on irrelevant searches</li>
      <li>Whether your conversion tracking is set up correctly</li>
      <li>Account structure and campaign efficiency</li>
      <li>Brand vs non-brand spend breakdown</li>
      <li>Quality score and ad relevance analysis</li>
      <li>Opportunities your current setup is missing</li>
    </ul>
    ${getConcernBlock(data.biggestConcern)}
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
    <div class="steps">
      <h3 style="margin-top: 0;">Here's how to give us read-only access (takes about 2 minutes):</h3>
      <p><strong>Step 1:</strong> Log into your Google Ads account at <a href="https://ads.google.com">ads.google.com</a></p>
      <p><strong>Step 2:</strong> Click the Admin icon (wrench) > Access and security</p>
      <p><strong>Step 3:</strong> Click the blue <strong>+</strong> button > Enter our email: <strong>peter@optimisedigital.online</strong></p>
      <p><strong>Step 4:</strong> Set the access level to <strong>Read only</strong></p>
      <p><strong>Step 5:</strong> Click Send invitation</p>
    </div>
    <div class="highlight">
      <p>Once you've done this, <strong>please reply to this email to let us know</strong> so we can get started right away. Your full audit will be delivered within <strong>3 hours</strong> of us receiving access.</p>
    </div>
    <p><strong>Note on privacy:</strong> In most cases, your current agency will not be notified. The only exception is if your agency has Admin-level access to the account, in which case they may receive a notification. If you're unsure, you can check their access level under Access and security before sending the invite.</p>
    <p>If you get stuck or have any questions, just reply to this email and we'll walk you through it.</p>
    <p>Speak soon,<br /><span class="signature">Peter and the Optimise Digi team</span></p>
  `);

  return { subject, html };
}

function buildEmail1_Consultation(data: AuditLeadData): { subject: string; html: string } {
  const name = escapeHtml(data.name);
  const subject = data.name
    ? `Let's chat about Google Ads, ${data.name}`
    : `Let's chat about Google Ads`;
  const greeting = data.name ? `Hi ${name},` : "Hi,";

  const html = emailWrapper(`
    <p>${greeting}</p>
    <p>Thanks for reaching out - excited to chat about how Google Ads could work for your business.</p>
    <p>Rather than go back and forth on email, the quickest way to get started is a short call. I've opened up my calendar so you can pick a time that works for you:</p>
    <p style="text-align: center; margin: 24px 0;">
      <a href="${BOOKING_LINK}" class="cta-link">Book a 15-minute call</a>
    </p>
    <h3>What we'll cover on the call:</h3>
    <ul>
      <li>Your business goals and who your ideal customers are</li>
      <li>Whether Google Ads is the right channel for you (we'll be honest if it isn't)</li>
      <li>What a realistic budget looks like for your industry</li>
      <li>How we'd structure your first campaigns for the best return</li>
      <li>Timeline and what to expect in the first 30-60 days</li>
    </ul>
    <p>The call is completely free and there's no obligation. If Google Ads isn't the right fit, we'll tell you and point you in the right direction.</p>
    <p>If you'd prefer to chat over email instead, just reply to this email with any questions and I'll get back to you the same day.</p>
    <p>Speak soon,<br /><span class="signature">Peter and the Optimise Digi team</span></p>
  `);

  return { subject, html };
}

function buildEmail1_WebsiteAudit(data: AuditLeadData): { subject: string; html: string } {
  const name = escapeHtml(data.name);
  const website = escapeHtml(data.website);
  const subject = data.name
    ? `We've received your audit request, ${data.name}`
    : `We've received your audit request`;
  const greeting = data.name ? `Hi ${name},` : "Hi,";

  const html = emailWrapper(`
    <p>${greeting}</p>
    <p>Thanks for reaching out. Smart move getting your website and campaign structure right before spending a dollar - it's the difference between launching profitably and burning through budget learning what doesn't work.</p>
    <p>We've got <strong>${website}</strong> in our queue and we'll have your full audit back within <strong>3 hours</strong>.</p>
    <h3>What we'll cover in your website audit:</h3>
    <ul>
      <li>Whether your landing pages are ready to convert Google Ads traffic</li>
      <li>Page speed and mobile experience (Google penalises slow sites with higher CPCs)</li>
      <li>Conversion tracking readiness - what needs to be in place before you launch</li>
      <li>Call-to-action clarity and user journey analysis</li>
      <li>Competitive landscape - what your competitors are doing on Google Ads</li>
      <li>Recommended campaign structure tailored to your business</li>
      <li>Keyword strategy and estimated budget for your market</li>
    </ul>
    <div class="highlight">
      <p>No access to share, no setup needed - we have everything we need from your form submission. Your audit will be delivered to this email address within <strong>3 hours</strong>.</p>
    </div>
    <p>If you have any questions in the meantime, just reply to this email.</p>
    <p>Speak soon,<br /><span class="signature">Peter and the Optimise Digi team</span></p>
  `);

  return { subject, html };
}

function buildEmail1(data: AuditLeadData): { subject: string; html: string } {
  if (isConsultation(data)) return buildEmail1_Consultation(data);
  if (isWebsiteAudit(data)) return buildEmail1_WebsiteAudit(data);
  return buildEmail1_ActiveSpender(data);
}

// ═════════════════════════════════════════════════════════════
// EMAIL 2
// ═════════════════════════════════════════════════════════════

function buildEmail2_ActiveSpender(data: AuditLeadData): { subject: string; html: string } {
  const name = escapeHtml(data.name);
  const subject = `Still want your free audit, ${data.name || "there"}?`;

  const html = emailWrapper(`
    <p>Hi ${name || "there"},</p>
    <p>Just following up on your audit request from yesterday. We haven't received access to your Google Ads account yet, so wanted to check if you need a hand setting it up.</p>
    <p>It only takes 2 minutes and we can walk you through it if you'd prefer. Just reply to this email or book a quick call and we'll do it together.</p>
    ${getSpendBlock(data.monthlySpend)}
    <p>No pressure at all. If you've decided not to proceed, that's completely fine too.</p>
    <p><span class="signature">Peter and the Optimise Digi team</span></p>
  `);

  return { subject, html };
}

function buildEmail2_Consultation(data: AuditLeadData): { subject: string; html: string } {
  const name = escapeHtml(data.name);
  const subject = `Quick question, ${data.name || "there"}`;

  const html = emailWrapper(`
    <p>Hi ${name || "there"},</p>
    <p>Just following up on your enquiry from yesterday. I know things get busy, so just wanted to make sure my calendar link came through.</p>
    <p>Would a 15-minute call work? We can go through whether Google Ads makes sense for your business, what budget you'd need, and what kind of results to realistically expect. No fluff, just straight answers.</p>
    <p style="text-align: center; margin: 24px 0;">
      <a href="${BOOKING_LINK}" class="cta-link">Pick a time that works</a>
    </p>
    <p>If you'd rather start over email, that works too - just reply with your questions and I'll get back to you today.</p>
    <p><span class="signature">Peter and the Optimise Digi team</span></p>
  `);

  return { subject, html };
}

function buildEmail2_WebsiteAudit(data: AuditLeadData): { subject: string; html: string } {
  const name = escapeHtml(data.name);
  const subject = `Want to walk through your audit, ${data.name || "there"}?`;

  const html = emailWrapper(`
    <p>Hi ${name || "there"},</p>
    <p>Just following up on your website audit. Wanted to check - did the audit make sense? Sometimes it's easier to walk through the findings on a quick call rather than just reading through a report.</p>
    <p>If you'd like to go through it together, you can book a 15-minute call here:</p>
    <p style="text-align: center; margin: 24px 0;">
      <a href="${BOOKING_LINK}" class="cta-link">Book a call to walk through your audit</a>
    </p>
    <p>We can cover the key findings, answer any questions, and talk through what the best next steps would be for getting your Google Ads campaigns set up properly.</p>
    <p>Or if you have questions, just reply to this email.</p>
    <p><span class="signature">Peter and the Optimise Digi team</span></p>
  `);

  return { subject, html };
}

function buildEmail2(data: AuditLeadData): { subject: string; html: string } {
  if (isConsultation(data)) return buildEmail2_Consultation(data);
  if (isWebsiteAudit(data)) return buildEmail2_WebsiteAudit(data);
  return buildEmail2_ActiveSpender(data);
}

// ═════════════════════════════════════════════════════════════
// EMAIL 3
// ═════════════════════════════════════════════════════════════

function buildEmail3_ActiveSpender(data: AuditLeadData): { subject: string; html: string } {
  const name = escapeHtml(data.name);
  const subject = `Quick resource for you, ${data.name || "there"}`;
  const concernRelevant =
    data.biggestConcern === "agency-performance" ||
    data.biggestConcern === "agency-quality";

  const html = emailWrapper(`
    <p>Hi ${name || "there"},</p>
    <p>I know things get busy, so I wanted to share something useful regardless of whether you go ahead with the audit.</p>
    <p>We wrote a guide on <strong>how to tell if your Google Ads agency is actually doing a good job</strong>. It's a 13-step checklist you can run through yourself:</p>
    <p><a href="https://www.optimisedigital.online/digital-marketing-growth-hub/how-to-know-if-your-google-ads-agency-is-actually-doing-a-good-job-a-13-step-checklist">Read the 13-step checklist</a></p>
    ${concernRelevant
      ? `<p>Given what you mentioned about your agency, this might be particularly useful. It covers the specific things to look for in your account that most agencies hope you won't check.</p>`
      : ""}
    <p>If you'd still like the free audit, the offer stands. Just reply and we'll get you set up.</p>
    <p><span class="signature">Peter and the Optimise Digi team</span></p>
  `);

  return { subject, html };
}

function buildEmail3_NotSpending(data: AuditLeadData): { subject: string; html: string } {
  const name = escapeHtml(data.name);
  const subject = `Something useful for you, ${data.name || "there"}`;

  const html = emailWrapper(`
    <p>Hi ${name || "there"},</p>
    <p>I know things get busy, so I wanted to share a few things that might be useful as you think about Google Ads.</p>
    <p>Here are some free tools you can use right now - no account needed:</p>
    <ul>
      <li><a href="https://www.optimisedigital.online/ai-growth-tools/seo-audit"><strong>Free Website Audit</strong></a> - see how your site performs and what to fix before running ads</li>
      <li><a href="https://www.optimisedigital.online/ai-growth-tools/website-conversion-rate-audit"><strong>Free CRO Audit</strong></a> - check if your site is set up to convert ad traffic</li>
      <li><a href="https://www.optimisedigital.online/ai-growth-tools/free-simple-keyword-tracker"><strong>Free Keyword Tracker</strong></a> - see where you rank and where the opportunities are</li>
    </ul>
    <p>These will give you a clearer picture of where you stand before investing in ads. Getting your website right first means every dollar you spend on Google Ads works harder.</p>
    <p>If you want to chat through any of it, the offer still stands:</p>
    <p style="text-align: center; margin: 24px 0;">
      <a href="${BOOKING_LINK}" class="cta-link">Book a free 15-minute call</a>
    </p>
    <p><span class="signature">Peter and the Optimise Digi team</span></p>
  `);

  return { subject, html };
}

function buildEmail3(data: AuditLeadData): { subject: string; html: string } {
  if (isNotSpending(data)) return buildEmail3_NotSpending(data);
  return buildEmail3_ActiveSpender(data);
}

// ═════════════════════════════════════════════════════════════
// EMAIL 4
// ═════════════════════════════════════════════════════════════

function buildEmail4_ActiveSpender(data: AuditLeadData): { subject: string; html: string } {
  const name = escapeHtml(data.name);
  const subject = `Closing the loop, ${data.name || "there"}`;
  const isHighSpend =
    data.monthlySpend === "50k-plus" || data.monthlySpend === "15k-50k";

  const html = emailWrapper(`
    <p>Hi ${name || "there"},</p>
    <p>Last email from me on this. Just wanted to close the loop on your audit request from last week.</p>
    <p>If the timing wasn't right, no worries at all. The offer for a free audit is always open whenever you're ready.</p>
    <p>In the meantime, here are a few free tools you can use anytime:</p>
    <ul>
      <li><a href="https://www.optimisedigital.online/ai-growth-tools/free-simple-keyword-tracker"><strong>Free Keyword Tracker</strong></a> - track your keyword rankings for free</li>
      <li><a href="https://www.optimisedigital.online/ai-growth-tools/seo-audit"><strong>Free SEO Audit</strong></a> - comprehensive website SEO analysis</li>
      <li><a href="https://www.optimisedigital.online/ai-growth-tools/website-conversion-rate-audit"><strong>Free CRO Audit</strong></a> - website conversion rate analysis</li>
    </ul>
    ${isHighSpend
      ? `<p>We also published a piece on how some major brands waste millions on Google Ads that might be worth a read:</p>
         <p><a href="https://www.optimisedigital.online/digital-marketing-growth-hub/how-some-major-brands-waste-millions-on-google-ads">How some major brands waste millions on Google Ads</a></p>`
      : ""}
    <p>All the best,<br /><span class="signature">Peter and the Optimise Digi team</span></p>
  `);

  return { subject, html };
}

function buildEmail4_NotSpending(data: AuditLeadData): { subject: string; html: string } {
  const name = escapeHtml(data.name);
  const subject = `Closing the loop, ${data.name || "there"}`;

  const html = emailWrapper(`
    <p>Hi ${name || "there"},</p>
    <p>Last email from me on this. Just wanted to close the loop on your enquiry from last week.</p>
    <p>If the timing wasn't right, no worries at all. When you're ready to explore Google Ads, we're here.</p>
    <p>A couple of things that might be worth a read in the meantime:</p>
    <ul>
      <li><a href="https://www.optimisedigital.online/digital-marketing-growth-hub/how-to-know-if-your-google-ads-agency-is-actually-doing-a-good-job-a-13-step-checklist">13 things to look for in a Google Ads setup</a> - useful context before you start</li>
      <li><a href="https://www.optimisedigital.online/digital-marketing-growth-hub/how-some-major-brands-waste-millions-on-google-ads">How some major brands waste millions on Google Ads</a> - what to avoid from day one</li>
    </ul>
    <p>And a reminder - you can always book a free chat whenever the timing is right:</p>
    <p style="text-align: center; margin: 24px 0;">
      <a href="${BOOKING_LINK}" class="cta-link">Book a free call</a>
    </p>
    <p>All the best,<br /><span class="signature">Peter and the Optimise Digi team</span></p>
  `);

  return { subject, html };
}

function buildEmail4(data: AuditLeadData): { subject: string; html: string } {
  if (isNotSpending(data)) return buildEmail4_NotSpending(data);
  return buildEmail4_ActiveSpender(data);
}

// ═════════════════════════════════════════════════════════════

export function getEmailBuilder(
  emailNumber: number,
): ((data: AuditLeadData) => { subject: string; html: string }) | null {
  switch (emailNumber) {
    case 1: return buildEmail1;
    case 2: return buildEmail2;
    case 3: return buildEmail3;
    case 4: return buildEmail4;
    default: return null;
  }
}
