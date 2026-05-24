import type { GlobalConfig } from "payload";
import { globalAccess, hideGlobalUnlessFeature } from "../lib/access";

const SIGNATURE_LOGO_URL =
  "https://juwpahlvaq1o5ivu.public.blob.vercel-storage.com/email-signatures/optimise-digital-logo-rocket-animation.gif";
const SIGNATURE_GOOGLE_BADGE_URL =
  "https://juwpahlvaq1o5ivu.public.blob.vercel-storage.com/email-signatures/google-partner.png";
const SIGNATURE_META_BADGE_URL =
  "https://juwpahlvaq1o5ivu.public.blob.vercel-storage.com/email-signatures/meta-partner.png";

/**
 * Default brand-only signature block. Intentionally contains no name, no
 * phone, no email, no sign-off — those live in the template that's appending
 * the signature so each email can have its own sender ("Maria" for invoices,
 * "Peter" for proposals, etc.) while reusing this brand block verbatim.
 */
// Logo is 200px wide. We centre "Growth that compounds" within that 200px
// block (text-align:center on a 200px-wide cell). Partner badges sit below
// with Meta on the left of Google.
const DEFAULT_SIGNATURE_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;">
  <tr>
    <td style="padding-bottom:4px;width:200px;">
      <a href="https://optimisedigital.online/?utm_source=email&amp;utm_medium=sig" style="text-decoration:none;">
        <img src="${SIGNATURE_LOGO_URL}" width="200" height="19" alt="Optimise Digital" style="display:block;border:0;outline:none;text-decoration:none;" />
      </a>
    </td>
  </tr>
  <tr>
    <td style="padding:0 70px 8px 0;width:200px;text-align:center;">
      <font face="Verdana" size="1"><b>Growth that compounds</b></font>
    </td>
  </tr>
  <tr>
    <td style="width:200px;">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding-right:8px;">
            <img src="${SIGNATURE_META_BADGE_URL}" width="96" height="14" alt="Meta Business Partner" style="display:block;border:0;outline:none;text-decoration:none;" />
          </td>
          <td>
            <img src="${SIGNATURE_GOOGLE_BADGE_URL}" width="96" height="15" alt="Google Best Practices" style="display:block;border:0;outline:none;text-decoration:none;" />
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

const DEFAULT_PAYMENT_METHODS_HTML = `<p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.55;">
  Bank deposit:<br />
  &nbsp;&nbsp;Account: <strong>Optimise Digital Pty Ltd</strong><br />
  &nbsp;&nbsp;BSB: <strong>062-692</strong><br />
  &nbsp;&nbsp;Account number: <strong>45576894</strong><br />
  &nbsp;&nbsp;Reference: your invoice number(s)
</p>
<p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.55;">
  Or click any <strong>View &amp; pay</strong> link above to pay online via card.
</p>`;

export const EmailTemplates: GlobalConfig = {
  slug: "email-templates",
  label: "Email Templates",
  admin: {
    group: "Settings",
    description:
      "Reusable email fragments: lead-response auto-replies, brand signature block, and invoice statement template.",
    hidden: hideGlobalUnlessFeature("email-templates"),
  },
  access: globalAccess("email-templates"),
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "📧 Lead Responses",
          description:
            "Auto-reply email template fragments sent to new leads. Edit any field to customise; leave blank to use the default.",
          fields: [
            {
              type: "tabs",
              tabs: [
                {
                  label: "Service Openers",
                  description:
                    "Opening paragraph(s) tailored to the service(s) the lead selected.",
                  fields: [
                    {
                      name: "seoOpener",
                      label: "SEO",
                      type: "textarea",
                      defaultValue: `SEO is a smart focus and it's clear you're thinking long-term. We'll take a look at your site and come back with some initial findings around your technical setup, heading structure, content and search visibility. We also have an SEO audit tool and a competitor analysis tool we can run to give you a full picture of where the gaps and opportunities are.`,
                    },
                    {
                      name: "croOpener",
                      label: "CRO",
                      type: "textarea",
                      defaultValue: `CRO is a great place to start because getting more out of the traffic you already have is one of the highest leverage moves you can make. We'll review your site and share some initial thoughts on your user journey, page layout and conversion flow. We also have a conversion audit tool that can give us a detailed breakdown of friction points and specific recommendations.`,
                    },
                    {
                      name: "googleAdsOpener",
                      label: "Google Ads",
                      type: "textarea",
                      defaultValue: `Google Ads can be one of the most reliable revenue drivers when it's set up well. We have a 13 step Google Ads audit that covers everything from campaign structure to search term quality to budget allocation. If you'd like us to run that we just need view access to your account and we'll take care of the rest.`,
                    },
                    {
                      name: "facebookAdsOpener",
                      label: "Facebook / Meta Ads",
                      type: "textarea",
                      defaultValue: `Meta Ads is a great channel for reaching people before they even know they need you. To give you the best advice on your paid social setup we'd want to understand how your landing pages and funnel are performing first. We have SEO and conversion audit tools that can help us get a read on that.`,
                    },
                    {
                      name: "aiAutomationOpener",
                      label: "AI & Automation",
                      type: "textarea",
                      defaultValue: `There's a lot of opportunity right now with AI and automation to free up time and improve consistency across your marketing and operations. We'll take a look at your current setup and come back with some thoughts on where automation could have the most impact.`,
                    },
                    {
                      name: "aiSearchOpener",
                      label: "AI Search Optimisation",
                      type: "textarea",
                      defaultValue: `AI search optimisation is still early days for most businesses so there's a real advantage in getting ahead of it now. We'll take a look at your site's content structure and come back with some initial thoughts on how you're positioned for AI generated search results. We also have content research and SEO audit tools that can give us a deeper view.`,
                    },
                    {
                      name: "integratedStrategyOpener",
                      label: "Integrated Digital Growth Strategy",
                      type: "textarea",
                      defaultValue: `Getting all your channels working together rather than in silos is where the real compounding happens. We'll take a look across the board and come back with some thoughts on where things stand. We have SEO audit, conversion audit and competitor analysis tools that can help us map out which channels deserve the most attention.`,
                    },
                    {
                      name: "openToRecommendationsOpener",
                      label: "Open to Recommendations",
                      type: "textarea",
                      defaultValue: `You mentioned you're open to recommendations which is a great starting point. We'll take a look at your site and come back with some thoughts on where things stand and which channels are likely to have the biggest impact. We have SEO and conversion audit tools that can help us get a clear baseline.`,
                    },
                    {
                      name: "multiServiceOpener",
                      label: "Multiple Services",
                      type: "textarea",
                      admin: {
                        description:
                          'Used when the lead selects more than one service. Use {serviceList} as a placeholder for the comma-separated list of service names.',
                      },
                      defaultValue: `You're looking at {serviceList} and the fact that you're thinking across multiple channels tells us you understand real growth rarely comes from one place. We'll take a look at your site and come back with some initial thoughts across those areas. We have SEO audit, conversion audit and competitor analysis tools that can help us go deeper once we know more about what you're working with.`,
                    },
                  ],
                },
                {
                  label: "Growth Journey",
                  description:
                    "Fragment appended after the service opener, based on the lead's growth stage.",
                  fields: [
                    {
                      name: "gettingStarted",
                      label: "Getting Started",
                      type: "textarea",
                      defaultValue: `Since you're still early in the journey, the most important thing is getting the foundations right so you're not wasting budget figuring things out the hard way.`,
                    },
                    {
                      name: "growingSteadily",
                      label: "Growing Steadily",
                      type: "textarea",
                      defaultValue: `It sounds like the fundamentals are working and you're ready to find the next gear, which is a great position to be in.`,
                    },
                    {
                      name: "scaling",
                      label: "Scaling",
                      type: "textarea",
                      defaultValue: `At the stage you're at, it's really about making sure your cost per acquisition stays healthy as you push for more volume.`,
                    },
                    {
                      name: "investingHeavily",
                      label: "Investing Heavily",
                      type: "textarea",
                      defaultValue: `With the level you're already investing at, even small improvements can have a significant dollar impact, so it's worth going deep on where the gaps are.`,
                    },
                  ],
                },
                {
                  label: "Focus Areas",
                  description:
                    "Short fragments joined into a sentence like: 'We can see that {focus} is a priority for you…'",
                  fields: [
                    {
                      name: "qualifiedLeads",
                      label: "Qualified Leads",
                      type: "textarea",
                      defaultValue: `pulling in better quality leads`,
                    },
                    {
                      name: "conversionRate",
                      label: "Conversion Rate",
                      type: "textarea",
                      defaultValue: `improving conversion rates from the traffic you already have`,
                    },
                    {
                      name: "lowerCac",
                      label: "Lower CAC",
                      type: "textarea",
                      defaultValue: `bringing down acquisition costs`,
                    },
                    {
                      name: "growthStrategy",
                      label: "Growth Strategy",
                      type: "textarea",
                      defaultValue: `getting a clearer strategy across your channels`,
                    },
                    {
                      name: "measurement",
                      label: "Measurement",
                      type: "textarea",
                      defaultValue: `tightening up your measurement and reporting`,
                    },
                    {
                      name: "focusSentenceTemplate",
                      label: "Focus Sentence Template",
                      type: "textarea",
                      admin: {
                        description:
                          "Wrapping sentence. Use {focus} as the placeholder for the joined focus fragments.",
                      },
                      defaultValue: `We can see that {focus} is a priority for you, and that's exactly the kind of thing we help with every day.`,
                    },
                  ],
                },
                {
                  label: "Current Setup",
                  description:
                    "Line describing the lead's current marketing situation.",
                  fields: [
                    {
                      name: "notSure",
                      label: "Not Sure",
                      type: "textarea",
                      defaultValue: `We know it can be hard to tell what's actually working when you don't have the right tracking in place, so that'll be one of the first things we look at.`,
                    },
                    {
                      name: "inconsistent",
                      label: "Inconsistent",
                      type: "textarea",
                      defaultValue: `Inconsistent results usually mean there's something working under the surface that just needs to be identified and made repeatable.`,
                    },
                    {
                      name: "knowWhatWorks",
                      label: "Know What Works",
                      type: "textarea",
                      defaultValue: `Since you already know what's working, we can skip the discovery phase and focus on how to scale it without breaking what's already performing.`,
                    },
                    {
                      name: "needEfficiency",
                      label: "Need Efficiency",
                      type: "textarea",
                      defaultValue: `When performance is already strong, it's about finding the marginal gains that separate good from great, and we're built for exactly that.`,
                    },
                  ],
                },
                {
                  label: "Qualifying Questions",
                  description:
                    "2–3 tailored questions appended to the email based on the lead's answers.",
                  fields: [
                    {
                      name: "questionsIntro",
                      label: "Questions Intro",
                      type: "textarea",
                      defaultValue: `To help us come back with something actually useful, a couple of quick questions:`,
                    },
                    {
                      name: "serviceQuestions",
                      label: "Service Questions",
                      type: "array",
                      admin: {
                        description:
                          "One question per service slug. Themes are used to avoid asking duplicate questions on the same topic.",
                      },
                      fields: [
                        {
                          name: "serviceSlug",
                          label: "Service",
                          type: "select",
                          options: [
                            { label: "SEO", value: "seo" },
                            { label: "CRO", value: "cro" },
                            { label: "Google Ads", value: "google-ads" },
                            { label: "Facebook Ads", value: "facebook-ads" },
                            { label: "AI & Automation", value: "ai-automation" },
                            {
                              label: "AI Search Optimisation",
                              value: "ai-search-optimisation",
                            },
                            {
                              label: "Integrated Strategy",
                              value: "integrated-digital-growth-strategy",
                            },
                            {
                              label: "Open to Recommendations",
                              value: "open-to-recommendations",
                            },
                          ],
                        },
                        {
                          name: "theme",
                          label: "Theme",
                          type: "text",
                          admin: {
                            description:
                              "De-duplication key. Questions with the same theme won't both appear.",
                          },
                        },
                        {
                          name: "question",
                          label: "Question",
                          type: "textarea",
                        },
                      ],
                    },
                    {
                      name: "focusQuestions",
                      label: "Focus Area Questions",
                      type: "array",
                      admin: {
                        description: "One question per focus area slug.",
                      },
                      fields: [
                        {
                          name: "focusSlug",
                          label: "Focus Area",
                          type: "select",
                          options: [
                            { label: "Qualified Leads", value: "qualified-leads" },
                            { label: "Conversion Rate", value: "conversion-rate" },
                            { label: "Lower CAC", value: "lower-cac" },
                            { label: "Growth Strategy", value: "growth-strategy" },
                            { label: "Measurement", value: "measurement" },
                          ],
                        },
                        {
                          name: "theme",
                          label: "Theme",
                          type: "text",
                        },
                        {
                          name: "question",
                          label: "Question",
                          type: "textarea",
                        },
                      ],
                    },
                    {
                      name: "setupQuestions",
                      label: "Setup Questions",
                      type: "array",
                      admin: {
                        description: "One question per current-setup slug.",
                      },
                      fields: [
                        {
                          name: "setupSlug",
                          label: "Setup",
                          type: "select",
                          options: [
                            { label: "Not Sure", value: "not-sure" },
                            { label: "Inconsistent", value: "inconsistent" },
                            { label: "Know What Works", value: "know-what-works" },
                            { label: "Need Efficiency", value: "need-efficiency" },
                          ],
                        },
                        {
                          name: "theme",
                          label: "Theme",
                          type: "text",
                        },
                        {
                          name: "question",
                          label: "Question",
                          type: "textarea",
                        },
                      ],
                    },
                  ],
                },
                {
                  label: "Closing & Subject",
                  description: "Closing paragraph and email subject line.",
                  fields: [
                    {
                      name: "closingParagraph",
                      label: "Closing Paragraph",
                      type: "textarea",
                      defaultValue: `We'll take a look at everything you've shared and come back with some specific thoughts for your business. In the meantime if any of the above sparks questions, just reply to this email.`,
                    },
                    {
                      name: "subjectTemplate",
                      label: "Subject Line",
                      type: "text",
                      admin: {
                        description:
                          "Use {firstName} as a placeholder for the lead's first name.",
                      },
                      defaultValue: `{firstName}, here's what we're thinking`,
                    },
                  ],
                },
                {
                  label: "Google Ads Starter",
                  description:
                    "Dedicated auto-reply for the Ready to get started with Google Ads? form.",
                  fields: [
                    {
                      name: "googleAdsStarterPreview",
                      type: "ui",
                      admin: {
                        components: {
                          Field: "/components/GoogleAdsStarterEmailPreviewField",
                        },
                      },
                    },
                    {
                      name: "googleAdsStarterSubjectTemplate",
                      label: "Subject Line",
                      type: "text",
                      admin: {
                        description:
                          "Use {firstName}, {name}, or {website} as placeholders.",
                      },
                      defaultValue: `{firstName}, next steps for your Google Ads setup`,
                    },
                    {
                      name: "googleAdsStarterOpening",
                      label: "Opening Paragraph",
                      type: "textarea",
                      defaultValue: `Thanks for reaching out about Google Ads. We can see you're looking at getting campaigns started or relaunched properly, so the first thing we'll do is review your website before recommending any spend, setup, or campaign structure.`,
                    },
                    {
                      name: "googleAdsStarterReadinessFragments",
                      label: "Readiness / Stage Fragments",
                      type: "array",
                      defaultValue: [
                        {
                          slug: "never-run-ads",
                          copy: `Because you haven't run Google Ads before, the priority is getting the foundations right before any budget goes live. That means clear offers, sensible campaign structure, conversion tracking, and a starting budget that matches the opportunity.`,
                        },
                        {
                          slug: "tried-before",
                          copy: `Because Google Ads has been tried before without the result you wanted, we'll look closely at whether the issue was the website, tracking, search terms, budget, or account structure before recommending the next move.`,
                        },
                        {
                          slug: "starting-soon",
                          copy: `Because you're planning to start soon, we'll help you avoid the common early mistakes: sending paid traffic to weak pages, launching without conversion tracking, or spreading the budget too thin.`,
                        },
                        {
                          slug: "relaunching",
                          copy: `Because you're looking at a relaunch, we'll treat this as a chance to rebuild the account around what should actually drive enquiries rather than simply switching old campaigns back on.`,
                        },
                      ],
                      fields: [
                        { name: "slug", label: "Answer Slug", type: "text", required: true },
                        { name: "copy", label: "Copy", type: "textarea", required: true },
                      ],
                    },
                    {
                      name: "googleAdsStarterGoalFragments",
                      label: "Lead Goal Fragments",
                      type: "array",
                      defaultValue: [
                        { slug: "more-phone-calls", copy: `We'll keep phone call quality front and centre when thinking through keywords, landing pages, and tracking.` },
                        { slug: "more-form-enquiries", copy: `We'll look at whether the website makes it easy enough for the right people to enquire after they click.` },
                        { slug: "bookings-or-appointments", copy: `We'll consider how the campaign and landing page can move people smoothly from search to booking.` },
                        { slug: "local-service-leads", copy: `We'll pay close attention to service areas, intent, and location targeting so spend is focused where it can realistically create leads.` },
                        { slug: "sales-or-quotes", copy: `We'll think through the path from search intent to quote, demo, or sale so the campaign is built around commercial outcomes rather than just clicks.` },
                      ],
                      fields: [
                        { name: "slug", label: "Answer Slug", type: "text", required: true },
                        { name: "copy", label: "Copy", type: "textarea", required: true },
                      ],
                    },
                    {
                      name: "googleAdsStarterWebsiteFragments",
                      label: "Website / Landing Page Fragments",
                      type: "array",
                      defaultValue: [
                        { slug: "converts-well", copy: `If the site is already converting well, we'll look for the highest intent traffic and make sure tracking captures the enquiries that matter.` },
                        { slug: "needs-improvement", copy: `If the website needs improvement first, we'll flag the changes most likely to lift conversion before you commit more budget to traffic.` },
                        { slug: "not-sure", copy: `If you're not sure how ready the site is, we'll review the conversion path and give you a practical view on whether it can support paid traffic now.` },
                        { slug: "need-landing-page", copy: `If a landing page is needed, we'll outline what that page should cover before campaigns are launched.` },
                      ],
                      fields: [
                        { name: "slug", label: "Answer Slug", type: "text", required: true },
                        { name: "copy", label: "Copy", type: "textarea", required: true },
                      ],
                    },
                    {
                      name: "googleAdsStarterBudgetFragments",
                      label: "Budget Fragments",
                      type: "array",
                      defaultValue: [
                        { slug: "under-1k", copy: `With a smaller starting budget, the structure needs to be tight and focused so the spend is not diluted across too many campaigns.` },
                        { slug: "1k-2k", copy: `At that budget range, the best approach is usually a focused launch around the highest intent services and locations first.` },
                        { slug: "2k-5k", copy: `At that budget range, there is room to test properly while still keeping the account structured around clear priorities.` },
                        { slug: "5k-plus", copy: `With that level of budget, we'll want tracking, landing pages, and campaign structure in place from day one so scaling decisions are based on clean data.` },
                        { slug: "not-sure", copy: `If the budget is still open, we'll recommend a realistic starting range after reviewing demand, competition, and website readiness.` },
                      ],
                      fields: [
                        { name: "slug", label: "Answer Slug", type: "text", required: true },
                        { name: "copy", label: "Copy", type: "textarea", required: true },
                      ],
                    },
                    {
                      name: "googleAdsStarterQuestionsIntro",
                      label: "Questions Intro",
                      type: "textarea",
                      defaultValue: `Two quick questions that would help us come back with a sharper recommendation:`,
                    },
                    {
                      name: "googleAdsStarterClosing",
                      label: "Closing",
                      type: "textarea",
                      defaultValue: `We'll review what you've shared and come back with practical next steps for your Google Ads setup. In the meantime, just reply to this email if there's anything else we should know.\n\nPeter\nOptimise Digital`,
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: "✍️ Signature",
          description:
            "Shared brand-block signature appended to outgoing emails (invoice statements, etc.). Intentionally brand-only — name, phone, email, and sign-off live on the individual template tabs so each email can have its own sender while reusing this block.",
          fields: [
            {
              name: "signatureHtml",
              label: "Signature HTML",
              type: "code",
              required: true,
              admin: {
                language: "html",
                description:
                  "Raw HTML block. Brand-only — no name, no contact details. Rendered below the per-template sign-off + sender name.",
                components: {
                  Field: "/components/SignaturePreviewField",
                },
              },
              defaultValue: DEFAULT_SIGNATURE_HTML,
            },
            {
              name: "signatureLogoImage",
              label: "Signature Logo Image",
              type: "upload",
              relationTo: "media",
              admin: {
                description:
                  "Optional convenience field — swap the main logo without editing HTML.",
              },
            },
            {
              name: "signatureGoogleBadge",
              label: "Signature Google Badge",
              type: "upload",
              relationTo: "media",
            },
            {
              name: "signatureMetaBadge",
              label: "Signature Meta Badge",
              type: "upload",
              relationTo: "media",
            },
          ],
        },
        {
          label: "💰 Invoice Statement",
          description:
            "Consolidated outstanding-invoice statement email. Used by the monthly sweep cron + admin approval queue. Placeholders: {totalOutstanding}, {totalOverdue}, {unpaidCount}, {contactName}, {contactFirstName}.",
          fields: [
            {
              name: "statementPreview",
              type: "ui",
              admin: {
                components: {
                  Field: "/components/InvoiceStatementPreviewField",
                },
              },
            },
            {
              name: "statementFromEmail",
              label: "From email",
              type: "text",
              required: true,
              defaultValue: "accounts@optimisedigital.online",
            },
            {
              name: "statementReplyToEmail",
              label: "Reply-to email",
              type: "text",
              admin: {
                description: "Defaults to From email if blank.",
              },
            },
            {
              name: "statementCcEmails",
              label: "CC list",
              type: "text",
              required: true,
              defaultValue: "peter@optimisedigital.online",
              admin: {
                description:
                  "Comma-separated. Always CC'd on every approved send.",
              },
            },
            {
              name: "statementSubjectTemplate",
              label: "Subject template",
              type: "text",
              required: true,
              defaultValue:
                "Your account with Optimise Digital — {totalOutstanding} outstanding across {unpaidCount} invoices",
            },
            {
              name: "statementGreeting",
              label: "Greeting",
              type: "textarea",
              required: true,
              defaultValue: "Hi {contactFirstName},",
            },
            {
              name: "statementOpeningLine",
              label: "Opening line",
              type: "textarea",
              required: true,
              defaultValue:
                "Quick consolidated summary of your account with us. Here's everything currently open in one place.",
            },
            {
              name: "statementSummaryTemplate",
              label: "Summary line",
              type: "text",
              required: true,
              defaultValue:
                "Total outstanding: {totalOutstanding} across {unpaidCount} invoices, with {totalOverdue} overdue.",
            },
            {
              name: "statementPaymentMethodsHtml",
              label: "Payment methods HTML",
              type: "code",
              required: true,
              admin: {
                language: "html",
                description:
                  "Block rendered between the invoice table and sign-off.",
              },
              defaultValue: DEFAULT_PAYMENT_METHODS_HTML,
            },
            {
              name: "statementClosingLine",
              label: "Closing line",
              type: "textarea",
              required: true,
              defaultValue: "Any questions, just reply to this email.",
            },
            {
              name: "statementSignOff",
              label: "Sign-off",
              type: "text",
              required: true,
              defaultValue: "Thanks,",
              admin: {
                description: "Line above the sender name (e.g. 'Thanks,').",
              },
            },
            {
              name: "statementSenderName",
              label: "Sender name",
              type: "text",
              required: true,
              defaultValue: "Maria",
              admin: {
                description:
                  "Rendered below the sign-off, above the brand signature.",
              },
            },
          ],
        },
      ],
    },
  ],
};
