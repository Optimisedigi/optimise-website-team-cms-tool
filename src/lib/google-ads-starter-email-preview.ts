export interface GoogleAdsStarterPreviewTemplates {
  googleAdsStarterSubjectTemplate?: string;
  googleAdsStarterOpening?: string;
  googleAdsStarterReadinessFragments?: Array<{ slug?: string; copy?: string }>;
  googleAdsStarterGoalFragments?: Array<{ slug?: string; copy?: string }>;
  googleAdsStarterWebsiteFragments?: Array<{ slug?: string; copy?: string }>;
  googleAdsStarterBudgetFragments?: Array<{ slug?: string; copy?: string }>;
  googleAdsStarterQuestionsIntro?: string;
  googleAdsStarterClosing?: string;
}

const sampleLead = {
  name: 'Sarah Nguyen',
  website: 'exampleplumbing.com.au',
  growthJourney: 'starting-soon',
  focusAreas: ['more-phone-calls', 'local-service-leads'],
  websiteConfidence: 'needs-improvement',
  paidBudget: '2k-5k',
  holdback: 'We are not sure which suburbs and services to prioritise first.',
};

const defaults = {
  subjectTemplate: `{firstName}, next steps for your Google Ads setup`,
  opening: `Thanks for reaching out about Google Ads. We can see you're looking at getting campaigns started or relaunched properly, so the first thing we'll do is review your website before recommending any spend, setup, or campaign structure.`,
  readinessFragments: {
    'starting-soon': `Because you're planning to start soon, we'll help you avoid the common early mistakes: sending paid traffic to weak pages, launching without conversion tracking, or spreading the budget too thin.`,
  },
  goalFragments: {
    'more-phone-calls': `We'll keep phone call quality front and centre when thinking through keywords, landing pages, and tracking.`,
    'local-service-leads': `We'll pay close attention to service areas, intent, and location targeting so spend is focused where it can realistically create leads.`,
  },
  websiteFragments: {
    'needs-improvement': `If the website needs improvement first, we'll flag the changes most likely to lift conversion before you commit more budget to traffic.`,
  },
  budgetFragments: {
    '2k-5k': `At that budget range, there is room to test properly while still keeping the account structured around clear priorities.`,
  },
  questionsIntro: `Two quick questions that would help us come back with a sharper recommendation:`,
  closing: `We'll review what you've shared and come back with practical next steps for your Google Ads setup. In the meantime, just reply to this email if there's anything else we should know.\n\nPeter\nOptimise Digital`,
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function mergeFragments(
  fallback: Record<string, string>,
  fragments: Array<{ slug?: string; copy?: string }> | undefined
): Record<string, string> {
  if (!fragments?.length) return fallback;
  return fragments.reduce<Record<string, string>>((acc, fragment) => {
    if (fragment.slug && fragment.copy) acc[fragment.slug] = fragment.copy;
    return acc;
  }, { ...fallback });
}

function renderTemplate(template: string): string {
  return template
    .replaceAll('{firstName}', 'Sarah')
    .replaceAll('{name}', sampleLead.name)
    .replaceAll('{website}', sampleLead.website);
}

function paragraph(text: string): string {
  return `<p>${escapeHtml(text).replaceAll('\n', '<br />')}</p>`;
}

export function buildGoogleAdsStarterEmailPreview(templates: GoogleAdsStarterPreviewTemplates): {
  subject: string;
  html: string;
} {
  const subjectTemplate = templates.googleAdsStarterSubjectTemplate || defaults.subjectTemplate;
  const opening = templates.googleAdsStarterOpening || defaults.opening;
  const readinessFragments = mergeFragments(
    defaults.readinessFragments,
    templates.googleAdsStarterReadinessFragments
  );
  const goalFragments = mergeFragments(defaults.goalFragments, templates.googleAdsStarterGoalFragments);
  const websiteFragments = mergeFragments(
    defaults.websiteFragments,
    templates.googleAdsStarterWebsiteFragments
  );
  const budgetFragments = mergeFragments(defaults.budgetFragments, templates.googleAdsStarterBudgetFragments);
  const questionsIntro = templates.googleAdsStarterQuestionsIntro || defaults.questionsIntro;
  const closing = templates.googleAdsStarterClosing || defaults.closing;

  const content = [
    paragraph('Hi Sarah,'),
    paragraph(renderTemplate(opening)),
    paragraph(
      'From your answers, it sounds like you want to start running Google Ads soon, your main lead goals are more phone calls and local service leads, your website may need improvement before ads, and your budget range is $2,000 to $5,000 per month.'
    ),
    paragraph(readinessFragments[sampleLead.growthJourney]),
    ...sampleLead.focusAreas.map((goal) => paragraph(goalFragments[goal])).filter(Boolean),
    paragraph(websiteFragments[sampleLead.websiteConfidence]),
    paragraph(budgetFragments[sampleLead.paidBudget]),
    paragraph(
      `We'll check website conversion readiness, whether a dedicated landing page is needed, campaign structure, conversion tracking, and what a realistic starting budget should look like.`
    ),
    paragraph(`You also mentioned: ${sampleLead.holdback}`),
    paragraph(questionsIntro),
    `<ul><li>Which services and locations should we prioritise first?</li><li>What is a good lead or new customer worth to your business?</li></ul>`,
    paragraph(closing).replace('Peter<br />Optimise Digital', '<strong>Peter</strong><br />Optimise Digital'),
  ].join('\n');

  return {
    subject: renderTemplate(subjectTemplate),
    html: `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;line-height:1.6;margin:0;padding:24px;background:#fff}p{margin:0 0 16px;font-size:15px;color:#333}ul{margin:0 0 16px;padding-left:20px}li{margin-bottom:6px;font-size:15px;color:#333}</style></head><body>${content}</body></html>`,
  };
}
