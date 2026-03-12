import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * POST /api/process-templates/seed
 *
 * Seeds example process templates. Skips any that already exist (by slug).
 * Auth: Payload session required.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: req.headers });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const results: { name: string; status: string; id?: number }[] = [];

    for (const template of SEED_TEMPLATES) {
      // Check if already exists
      const existing = await payload.find({
        collection: "process-templates" as any,
        where: { slug: { equals: template.slug } },
        limit: 1,
        overrideAccess: true,
      });

      if (existing.totalDocs > 0) {
        results.push({ name: template.name, status: "already_exists", id: existing.docs[0].id as number });
        continue;
      }

      const doc = await payload.create({
        collection: "process-templates" as any,
        data: template as any,
        overrideAccess: true,
      });

      results.push({ name: template.name, status: "created", id: doc.id as number });
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error("[process-templates/seed]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Seed failed" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/* Seed data                                                           */
/* ------------------------------------------------------------------ */

const SEED_TEMPLATES = [
  {
    name: "Website + SEO Retainer",
    slug: "website-seo-retainer",
    retainerType: "website_seo",
    description:
      "Full onboarding and delivery process for clients on a Website + SEO retainer. Covers discovery, website build, technical SEO setup, content strategy, and ongoing optimisation.",
    isDefault: true,
    isActive: true,
    phases: [
      {
        phaseName: "Discovery & Onboarding",
        phaseOrder: 1,
        phaseDescription:
          "Gather all information needed to kick off the project. Set expectations and get access to everything.",
        steps: [
          {
            stepName: "Send welcome email with onboarding checklist",
            stepOrder: 1,
            stepType: "communication",
            defaultAssignee: "account_manager",
            estimatedDuration: "15 mins",
            requiredBeforeNext: true,
            emailTemplateSubject: "Welcome to Optimise Digital — Next Steps",
            emailTemplateBody:
              "Hi {{clientName}},\n\nWelcome aboard! We're excited to get started.\n\nTo kick things off, we need a few things from you:\n\n1. Brand guidelines (logo, colours, fonts)\n2. Google Analytics access (add analytics@optimisedigital.online)\n3. Google Search Console access (add the same email)\n4. Domain registrar login (for DNS changes)\n5. Any existing content, copy, or imagery you'd like us to use\n6. Competitor websites you admire\n\nWe'll schedule a discovery call once we have these. Let us know if you have any questions.\n\nThanks,\nThe Optimise Digital Team",
          },
          {
            stepName: "Collect brand assets and logins",
            stepOrder: 2,
            stepType: "action",
            defaultAssignee: "account_manager",
            estimatedDuration: "1-3 days",
            stepDescription:
              "Chase client for brand guidelines, logo files, colour palette, fonts, and CMS/hosting/domain logins.",
            reminderDays: 3,
          },
          {
            stepName: "Get Google Analytics access",
            stepOrder: 3,
            stepType: "action",
            defaultAssignee: "account_manager",
            estimatedDuration: "1 day",
            stepDescription:
              "Ensure analytics@optimisedigital.online has Editor access to the GA4 property. Create a GA4 property if none exists.",
          },
          {
            stepName: "Get Google Search Console access",
            stepOrder: 4,
            stepType: "action",
            defaultAssignee: "account_manager",
            estimatedDuration: "1 day",
            stepDescription:
              "Add analytics@optimisedigital.online as a Full user on the GSC property. Verify the property if not already done.",
          },
          {
            stepName: "Discovery call with client",
            stepOrder: 5,
            stepType: "communication",
            defaultAssignee: "strategist",
            estimatedDuration: "45 mins",
            requiredBeforeNext: true,
            stepDescription:
              "Discuss business goals, target audience, key services/products, competitors, tone of voice, and any must-haves for the website. Record notes for the brief.",
          },
          {
            stepName: "Create project brief",
            stepOrder: 6,
            stepType: "action",
            defaultAssignee: "strategist",
            estimatedDuration: "1 hour",
            requiredBeforeNext: true,
            stepDescription:
              "Document sitemap, page list, target keywords per page, design preferences, functionality requirements, and timeline. Share with team.",
          },
        ],
      },
      {
        phaseName: "SEO Audit & Strategy",
        phaseOrder: 2,
        phaseDescription:
          "Run a full SEO audit on any existing site and build the keyword/content strategy for the new site.",
        steps: [
          {
            stepName: "Run SEO audit on existing site",
            stepOrder: 1,
            stepType: "action",
            defaultAssignee: "strategist",
            estimatedDuration: "2 hours",
            stepDescription:
              "Use the CMS proposal audit pipeline (SEO + CRO + keywords + competitors + content research). Document current rankings, technical issues, and opportunities.",
            isAutomatable: true,
            automationNotes:
              "Can be triggered via /api/proposals/[id]/run-audits once a proposal exists.",
          },
          {
            stepName: "Keyword research and mapping",
            stepOrder: 2,
            stepType: "action",
            defaultAssignee: "strategist",
            estimatedDuration: "3 hours",
            requiredBeforeNext: true,
            stepDescription:
              "Research primary and secondary keywords for each page. Map keywords to URLs. Identify content gaps and blog opportunities.",
          },
          {
            stepName: "Competitor analysis",
            stepOrder: 3,
            stepType: "action",
            defaultAssignee: "strategist",
            estimatedDuration: "1 hour",
            stepDescription:
              "Analyse top 3-5 competitors: what they rank for, their site structure, content strategy, and backlink profile.",
          },
          {
            stepName: "Create SEO strategy document",
            stepOrder: 4,
            stepType: "action",
            defaultAssignee: "strategist",
            estimatedDuration: "2 hours",
            requiredBeforeNext: true,
            stepDescription:
              "Combine audit findings, keyword map, and competitor insights into a clear SEO strategy. Include: target keywords per page, meta title/description templates, internal linking plan, content calendar outline.",
          },
          {
            stepName: "Present strategy to client",
            stepOrder: 5,
            stepType: "communication",
            defaultAssignee: "strategist",
            estimatedDuration: "30 mins",
            requiredBeforeNext: true,
            stepDescription:
              "Walk the client through the SEO strategy. Get sign-off on target keywords and content direction before starting the build.",
          },
        ],
      },
      {
        phaseName: "Website Design & Build",
        phaseOrder: 3,
        phaseDescription:
          "Design and develop the website with SEO baked in from the start.",
        steps: [
          {
            stepName: "Create wireframes/mockups",
            stepOrder: 1,
            stepType: "action",
            defaultAssignee: "developer",
            estimatedDuration: "1-2 days",
            requiredBeforeNext: true,
            stepDescription:
              "Design homepage and key page layouts. Include header, footer, CTA placement, and mobile views. Share via mockup link.",
          },
          {
            stepName: "Client design approval",
            stepOrder: 2,
            stepType: "decision",
            defaultAssignee: "client",
            estimatedDuration: "2-3 days",
            requiredBeforeNext: true,
            stepDescription:
              "Client reviews mockups and provides feedback. May require 1-2 revision rounds. Get written sign-off before build.",
            reminderDays: 3,
          },
          {
            stepName: "Build website pages",
            stepOrder: 3,
            stepType: "action",
            defaultAssignee: "developer",
            estimatedDuration: "1-2 weeks",
            stepDescription:
              "Develop all pages per approved designs. Implement SEO-optimised headings (H1/H2/H3), meta titles, meta descriptions, schema markup, image alt text, and internal links per the SEO strategy.",
          },
          {
            stepName: "Write and add page content",
            stepOrder: 4,
            stepType: "action",
            defaultAssignee: "strategist",
            estimatedDuration: "3-5 days",
            stepDescription:
              "Write SEO-optimised copy for each page using the keyword map. Include primary keyword in H1, secondary keywords in H2s, and natural keyword usage throughout. Aim for 500+ words on service pages.",
          },
          {
            stepName: "Set up contact forms and CTAs",
            stepOrder: 5,
            stepType: "action",
            defaultAssignee: "developer",
            estimatedDuration: "2 hours",
            stepDescription:
              "Configure contact forms with email notifications. Add CTAs to key pages. Set up thank-you/confirmation pages with conversion tracking.",
          },
          {
            stepName: "Mobile and cross-browser testing",
            stepOrder: 6,
            stepType: "action",
            defaultAssignee: "developer",
            estimatedDuration: "2 hours",
            stepDescription:
              "Test all pages on mobile, tablet, and desktop. Check Chrome, Safari, Firefox, and Edge. Fix any layout or functionality issues.",
          },
          {
            stepName: "Client content review",
            stepOrder: 7,
            stepType: "decision",
            defaultAssignee: "client",
            estimatedDuration: "2-3 days",
            requiredBeforeNext: true,
            stepDescription:
              "Client reviews the staging site. Check copy accuracy, imagery, contact details, and overall feel. Provide feedback for final tweaks.",
            reminderDays: 3,
          },
        ],
      },
      {
        phaseName: "Technical SEO Setup",
        phaseOrder: 4,
        phaseDescription:
          "Configure all technical SEO elements before launch.",
        steps: [
          {
            stepName: "Set up XML sitemap",
            stepOrder: 1,
            stepType: "action",
            defaultAssignee: "developer",
            estimatedDuration: "30 mins",
            stepDescription:
              "Generate and verify XML sitemap. Ensure all indexable pages are included and noindex pages are excluded.",
          },
          {
            stepName: "Configure robots.txt",
            stepOrder: 2,
            stepType: "action",
            defaultAssignee: "developer",
            estimatedDuration: "15 mins",
            stepDescription:
              "Set up robots.txt with sitemap reference. Block admin/staging URLs. Allow all public pages.",
          },
          {
            stepName: "Implement schema markup",
            stepOrder: 3,
            stepType: "action",
            defaultAssignee: "developer",
            estimatedDuration: "1 hour",
            stepDescription:
              "Add LocalBusiness, Organization, and page-specific schema (FAQ, Service, BreadcrumbList). Validate with Google's Rich Results Test.",
          },
          {
            stepName: "Set up 301 redirects",
            stepOrder: 4,
            stepType: "action",
            defaultAssignee: "developer",
            estimatedDuration: "1 hour",
            stepDescription:
              "Map all old URLs to new URLs. Implement 301 redirects to preserve link equity. Check for redirect chains or loops.",
          },
          {
            stepName: "Page speed optimisation",
            stepOrder: 5,
            stepType: "action",
            defaultAssignee: "developer",
            estimatedDuration: "2 hours",
            stepDescription:
              "Optimise images (WebP, lazy loading), minify CSS/JS, enable compression, set up caching. Target 90+ on PageSpeed Insights for mobile.",
          },
          {
            stepName: "Install and configure GA4",
            stepOrder: 6,
            stepType: "action",
            defaultAssignee: "developer",
            estimatedDuration: "30 mins",
            stepDescription:
              "Install GA4 tracking code. Set up conversion events for form submissions and phone clicks. Verify data is flowing.",
          },
          {
            stepName: "Verify Google Search Console",
            stepOrder: 7,
            stepType: "action",
            defaultAssignee: "developer",
            estimatedDuration: "15 mins",
            stepDescription:
              "Verify the new domain in GSC. Submit the sitemap. Connect GSC in the CMS for monitoring.",
          },
        ],
      },
      {
        phaseName: "Launch",
        phaseOrder: 5,
        phaseDescription:
          "Go live with the new website. Final checks and DNS cutover.",
        steps: [
          {
            stepName: "Pre-launch checklist",
            stepOrder: 1,
            stepType: "action",
            defaultAssignee: "developer",
            estimatedDuration: "1 hour",
            requiredBeforeNext: true,
            stepDescription:
              "Final check: all pages live, forms working, analytics firing, SSL certificate active, favicon set, social meta tags (OG) configured, no lorem ipsum, no broken links, 404 page set up.",
          },
          {
            stepName: "DNS cutover / go live",
            stepOrder: 2,
            stepType: "action",
            defaultAssignee: "developer",
            estimatedDuration: "30 mins",
            requiredBeforeNext: true,
            stepDescription:
              "Point DNS to new hosting. Verify SSL. Confirm site loads on the live domain. Remove any staging robots noindex.",
          },
          {
            stepName: "Submit sitemap to Google",
            stepOrder: 3,
            stepType: "action",
            defaultAssignee: "developer",
            estimatedDuration: "10 mins",
            stepDescription:
              "Submit the sitemap in GSC. Request indexing for key pages. Ping the sitemap URL.",
            isAutomatable: true,
            automationNotes:
              "Can be automated via the GSC indexing helper in the CMS.",
          },
          {
            stepName: "Send launch email to client",
            stepOrder: 4,
            stepType: "communication",
            defaultAssignee: "account_manager",
            estimatedDuration: "15 mins",
            emailTemplateSubject: "Your New Website is Live!",
            emailTemplateBody:
              "Hi {{clientName}},\n\nGreat news — your new website is now live at {{websiteUrl}}!\n\nHere's a quick summary of what's been set up:\n- Fully responsive, SEO-optimised website\n- Google Analytics 4 tracking\n- Google Search Console monitoring\n- XML sitemap submitted to Google\n- All 301 redirects in place\n\nNext steps: We'll begin the ongoing SEO work this month, starting with your first blog post and link building. We'll send you a monthly report showing progress.\n\nLet us know if you spot anything that needs adjusting.\n\nThanks,\nThe Optimise Digital Team",
          },
          {
            stepName: "Post-launch smoke test",
            stepOrder: 5,
            stepType: "action",
            defaultAssignee: "developer",
            estimatedDuration: "30 mins",
            stepDescription:
              "24 hours after launch: check GA4 is receiving data, forms are delivering emails, no crawl errors in GSC, SSL working on all pages, page speed scores acceptable.",
          },
        ],
      },
      {
        phaseName: "Ongoing SEO & Optimisation",
        phaseOrder: 6,
        phaseDescription:
          "Monthly recurring SEO activities to grow organic traffic and rankings.",
        steps: [
          {
            stepName: "Monthly keyword ranking check",
            stepOrder: 1,
            stepType: "action",
            defaultAssignee: "strategist",
            estimatedDuration: "30 mins",
            stepDescription:
              "Review GSC data in the CMS. Check ranking movements for target keywords. Identify quick wins and declining pages.",
            isAutomatable: true,
            automationNotes:
              "GSC cron already captures monthly snapshots. Could auto-generate a ranking report.",
          },
          {
            stepName: "Publish SEO blog post",
            stepOrder: 2,
            stepType: "action",
            defaultAssignee: "strategist",
            estimatedDuration: "3 hours",
            stepDescription:
              "Write and publish 1 SEO-optimised blog post per month targeting a keyword from the content calendar. 1000+ words, internal links to service pages, optimised meta tags.",
            isAutomatable: true,
            automationNotes:
              "Blog prompt generator in CMS can create the brief. Content still needs human review.",
          },
          {
            stepName: "Internal linking updates",
            stepOrder: 3,
            stepType: "action",
            defaultAssignee: "strategist",
            estimatedDuration: "30 mins",
            stepDescription:
              "Add internal links from new blog posts to service pages and vice versa. Use the CMS internal link suggestions feature.",
          },
          {
            stepName: "Technical health check",
            stepOrder: 4,
            stepType: "action",
            defaultAssignee: "developer",
            estimatedDuration: "30 mins",
            stepDescription:
              "Check for crawl errors in GSC, broken links, page speed regressions, and indexing issues. Run the CMS indexing audit.",
            isAutomatable: true,
            automationNotes:
              "GSC indexing audit can be triggered from the CMS search console page.",
          },
          {
            stepName: "Monthly performance report",
            stepOrder: 5,
            stepType: "communication",
            defaultAssignee: "account_manager",
            estimatedDuration: "1 hour",
            stepDescription:
              "Compile monthly report: organic traffic, keyword rankings, conversions, work completed, next month's plan. Send to client.",
            emailTemplateSubject: "Monthly SEO Report — {{month}} {{year}}",
            emailTemplateBody:
              "Hi {{clientName}},\n\nHere's your monthly SEO performance summary.\n\nKey highlights:\n- Organic sessions: {{sessions}} ({{changePercent}} vs last month)\n- Keywords in top 10: {{top10Count}}\n- Blog posts published: {{blogCount}}\n- Technical issues fixed: {{issuesFixed}}\n\nFull report attached. Let us know if you have any questions.\n\nThanks,\nThe Optimise Digital Team",
          },
          {
            stepName: "Quarterly strategy review",
            stepOrder: 6,
            stepType: "communication",
            defaultAssignee: "strategist",
            estimatedDuration: "30 mins",
            stepDescription:
              "Every 3 months: review overall SEO progress with the client. Adjust keyword targets, content calendar, and strategy based on results. Set goals for next quarter.",
          },
        ],
      },
    ],
  },
];
