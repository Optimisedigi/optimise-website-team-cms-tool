export interface GoogleAdsStarterPreviewTemplates {
  googleAdsStarterSubjectTemplate?: string;
  googleAdsStarterOpening?: string;
  googleAdsStarterReadinessFragments?: Array<{ slug?: string; copy?: string }>;
  googleAdsStarterGoalFragments?: Array<{ slug?: string; copy?: string }>;
  googleAdsStarterWebsiteFragments?: Array<{ slug?: string; copy?: string }>;
  googleAdsStarterBudgetFragments?: Array<{ slug?: string; copy?: string }>;
  googleAdsStarterQuestionsIntro?: string;
  googleAdsStarterClosing?: string;
  signatureHtml?: string;
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
  opening: `Thanks for reaching out about Google Ads. We'll review your website first, then come back with the clearest next step for campaign setup, tracking and budget.`,
  readinessFragments: {
    'starting-soon': `Because you're planning to start soon, we'll help you avoid launching with weak tracking, pages or campaign structure.`,
  },
  goalFragments: {
    'more-phone-calls': `We'll keep phone call quality front and centre.`,
    'local-service-leads': `We'll pay close attention to service areas, intent and location targeting.`,
  },
  websiteFragments: {
    'needs-improvement': `If the website needs improvement first, we'll flag the priority fixes before more budget goes to traffic.`,
  },
  budgetFragments: {
    '2k-5k': `At that budget, there is room to test properly while keeping priorities clear.`,
  },
  questionsIntro: `Two quick questions that would help us:`,
  closing: `We'll review what you've shared and come back with practical next steps.`,
  signatureHtml: `<p><strong>Peter</strong><br />Optimise Digital</p>`,
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
  const signatureHtml = templates.signatureHtml || defaults.signatureHtml;

  const goalCopy = sampleLead.focusAreas
    .map((goal) => goalFragments[goal])
    .filter(Boolean)
    .join(' ');

  const content = [
    paragraph('Hi Sarah,'),
    paragraph(renderTemplate(opening)),
    paragraph(
      'From your answers: want to start running Google Ads soon / more phone calls and local service leads / your website may need improvement before ads / $2,000 to $5,000 per month.'
    ),
    paragraph(readinessFragments[sampleLead.growthJourney]),
    paragraph(websiteFragments[sampleLead.websiteConfidence]),
    paragraph(budgetFragments[sampleLead.paidBudget]),
    goalCopy ? paragraph(goalCopy) : '',
    paragraph(`You also mentioned: ${sampleLead.holdback}`),
    paragraph(questionsIntro),
    `<ul><li>Which services and locations should we prioritise first?</li><li>What is a good lead or customer worth?</li></ul>`,
    paragraph(closing),
    `<div class="signature">${signatureHtml}</div>`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    subject: renderTemplate(subjectTemplate),
    html: `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;line-height:1.6;margin:0;padding:24px;background:#fff}p{margin:0 0 16px;font-size:15px;color:#333}ul{margin:0 0 16px;padding-left:20px}li{margin-bottom:6px;font-size:15px;color:#333}.signature{margin-top:20px}</style></head><body>${content}</body></html>`,
  };
}
