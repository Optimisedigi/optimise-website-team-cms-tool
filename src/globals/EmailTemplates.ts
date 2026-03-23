import type { GlobalConfig } from "payload";

export const EmailTemplates: GlobalConfig = {
  slug: "email-templates",
  label: "Email Templates",
  admin: {
    group: "Clients",
    description:
      "Auto-reply email template fragments sent to new leads. Edit any field to customise; leave blank to use the default.",
  },
  access: {
    read: ({ req }) => !!req.user,
    update: ({ req }) => req.user?.role === "admin",
  },
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
      ],
    },
  ],
};
