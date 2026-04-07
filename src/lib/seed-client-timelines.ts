/**
 * Seed script for ClientTimelineTemplates + ClientTimelines.
 *
 * Seeds the "Google Ads 90-Day Onboarding" template, then creates
 * ClientTimeline instances for Berenson and MTP.
 *
 * Usage:
 *   await seedClientTimelines(payload);
 */

interface SeedPayload {
  find: (opts: any) => Promise<{ totalDocs: number; docs: any[] }>;
  findByID: (opts: any) => Promise<any>;
  create: (opts: any) => Promise<any>;
  update: (opts: any) => Promise<any>;
}

const GOOGLE_ADS_TEMPLATE = {
  name: "Google Ads 90-Day Onboarding",
  slug: "google-ads-90-day-onboarding",
  serviceType: "google_ads",
  durationDays: 90,
  description:
    "A 90-day onboarding programme for new Google Ads clients, covering quick wins, campaign restructure, and launch optimisation.",
  isDefault: true,
  isActive: true,
  phases: [
    {
      phaseName: "Quick Wins",
      phaseOrder: 1,
      weekRange: "Weeks 1–2",
      phaseDescription:
        "Fix conversion tracking and stop wasted spend immediately.",
      items: [
        {
          itemName: "Remove contact page view conversion action",
          itemOrder: 1,
          requiresApproval: false,
        },
        {
          itemName: "Fix form tracking",
          itemOrder: 2,
          requiresApproval: false,
        },
        {
          itemName: "Add phone call duration filter",
          itemOrder: 3,
          requiresApproval: false,
        },
        {
          itemName: "Add themed negative keyword lists to stop wasted spend",
          itemOrder: 4,
          requiresApproval: false,
        },
        {
          itemName: "Fix geo targeting, pause irrelevant keywords",
          itemOrder: 5,
          itemDescription:
            "Pause keywords that are clearly irrelevant or generating no value.",
          requiresApproval: true,
        },
        {
          itemName: "Submit geo-targeting changes for your approval",
          itemOrder: 6,
          itemDescription:
            "Proposed changes to targeting settings require your sign-off before we apply them.",
          requiresApproval: true,
        },
      ],
    },
    {
      phaseName: "Campaign Analysis + Structure Proposal",
      phaseOrder: 2,
      weekRange: "Weeks 1–3",
      phaseDescription:
        "Analyse your current account and propose a restructured campaign setup.",
      items: [
        {
          itemName: "Analyse landing pages and map out keyword themes",
          itemOrder: 1,
          requiresApproval: false,
        },
        {
          itemName: "Propose new campaign structure",
          itemOrder: 2,
          itemDescription:
            "Separate brand campaign, themed ad groups (emergency, service, maintenance), distributed brand campaigns (Grundfos, KSB).",
          requiresApproval: true,
        },
        {
          itemName: "Advise on brand-specific landing pages (topline)",
          itemOrder: 3,
          itemDescription:
            "Initial recommendations for dedicated brand landing pages to improve Quality Score and conversion rates.",
          requiresApproval: false,
        },
      ],
    },
    {
      phaseName: "Campaign Build + Ad Copy",
      phaseOrder: 3,
      weekRange: "Weeks 3–4",
      phaseDescription:
        "Build out the new campaign structure and draft ad creative.",
      items: [
        {
          itemName: "Build out campaigns, ad groups, keywords, audiences, extensions",
          itemOrder: 1,
          requiresApproval: false,
        },
        {
          itemName: "Create dedicated brand ads with brand messaging",
          itemOrder: 2,
          requiresApproval: false,
        },
        {
          itemName: "Share ad copy drafts for your review",
          itemOrder: 3,
          requiresApproval: true,
        },
        {
          itemName: "Negative keyword list deep dive",
          itemOrder: 4,
          requiresApproval: false,
        },
        {
          itemName: "Go live with new structure",
          itemOrder: 5,
          itemDescription:
            "Launch the new campaign structure and pause the old campaigns.",
          requiresApproval: true,
        },
      ],
    },
    {
      phaseName: "Launch + Monitor",
      phaseOrder: 4,
      weekRange: "Weeks 4–5",
      phaseDescription:
        "Daily monitoring post-launch to ensure stability and early optimisation.",
      items: [
        {
          itemName: "Daily monitoring for the first couple of weeks",
          itemOrder: 1,
          requiresApproval: false,
        },
        {
          itemName: "Ongoing ad copy optimisation",
          itemOrder: 2,
          requiresApproval: false,
        },
        {
          itemName: "Approve ad copy before launch",
          itemOrder: 3,
          itemDescription:
            "Final ad copy must be reviewed and approved before going live.",
          requiresApproval: true,
        },
        {
          itemName: "Monthly dashboard shared",
          itemOrder: 4,
          requiresApproval: false,
        },
      ],
    },
    {
      phaseName: "Ongoing Optimisations",
      phaseOrder: 5,
      weekRange: "Beyond Week 5",
      phaseDescription:
        "Continuous account improvements and scale opportunities.",
      items: [
        {
          itemName: "Ongoing account optimisations",
          itemOrder: 1,
          requiresApproval: false,
        },
        {
          itemName: "Ad copy A/B tests",
          itemOrder: 2,
          requiresApproval: false,
        },
        {
          itemName: "Testing placements",
          itemOrder: 3,
          requiresApproval: false,
        },
        {
          itemName: "Advise on brand-specific landing pages (in-depth)",
          itemOrder: 4,
          itemDescription:
            "Detailed analysis and recommendations for dedicated brand landing pages.",
          requiresApproval: false,
        },
        {
          itemName: "Dashboard refinements",
          itemOrder: 5,
          requiresApproval: false,
        },
        {
          itemName: "Generic to GA4 deep dives for scale",
          itemOrder: 6,
          requiresApproval: false,
        },
        {
          itemName: "Organic vs paid search analysis",
          itemOrder: 7,
          requiresApproval: false,
        },
      ],
    },
  ],
};

export async function seedClientTimelineTemplate(
  payload: SeedPayload,
): Promise<{ id: number }> {
  // Check if template already exists
  const existing = await payload.find({
    collection: "client-timeline-templates",
    where: { slug: { equals: GOOGLE_ADS_TEMPLATE.slug } },
    limit: 1,
  });

  if (existing.totalDocs > 0) {
    console.log(
      `[seed] Template "${GOOGLE_ADS_TEMPLATE.name}" already exists, skipping.`,
    );
    return { id: existing.docs[0].id };
  }

  const doc = await payload.create({
    collection: "client-timeline-templates",
    data: GOOGLE_ADS_TEMPLATE as any,
    overrideAccess: true,
  });

  console.log(`[seed] Created template: ${doc.id} — "${doc.name}"`);
  return { id: doc.id };
}

export async function seedClientTimelines(
  payload: SeedPayload,
): Promise<void> {
  // Seed template first
  const { id: templateId } = await seedClientTimelineTemplate(payload);

  // Find Berenson and MTP clients
  const clients = await payload.find({
    collection: "clients",
    where: {
      or: [
        { name: { like: "Berenson" } },
        { name: { like: "MTP" } },
      ],
    },
    limit: 10,
    depth: 0,
  });

  if (clients.totalDocs === 0) {
    console.warn(
      "[seed] No clients found matching 'Berenson' or 'MTP'. Skipping timeline creation.",
    );
    return;
  }

  const now = new Date();
  const endDate = new Date(now.getTime() + 90 * 86400000);

  for (const client of clients.docs) {
    const clientName =
      typeof client.name === "string" ? client.name : String(client.id);

    // Check if timeline already exists for this client + service type
    const existing = await payload.find({
      collection: "client-timelines",
      where: {
        and: [
          { client: { equals: client.id } },
          { serviceType: { equals: "google_ads" } },
        ],
      },
      limit: 1,
    });

    if (existing.totalDocs > 0) {
      console.log(
        `[seed] Timeline for ${clientName} already exists, skipping.`,
      );
      continue;
    }

    const doc = await payload.create({
      collection: "client-timelines",
      data: {
        title: `${clientName} — Google Ads 90-Day Timeline`,
        client: client.id,
        template: templateId,
        serviceType: "google_ads",
        overallStatus: "not_started",
        startDate: now.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
        sharedCount: 0,
        phases: GOOGLE_ADS_TEMPLATE.phases.map((phase) => ({
          phaseName: phase.phaseName,
          phaseOrder: phase.phaseOrder,
          weekRange: phase.weekRange,
          phaseDescription: phase.phaseDescription,
          items: phase.items.map((item) => ({
            itemName: item.itemName,
            itemOrder: item.itemOrder,
            itemDescription: item.itemDescription ?? null,
            itemStatus: "not_started",
            requiresApproval: item.requiresApproval,
            approvalStatus: item.requiresApproval ? "pending_approval" : "not_needed",
          })),
        })),
      } as any,
      overrideAccess: true,
    });

    console.log(
      `[seed] Created timeline: ${doc.id} — "${doc.title}"`,
    );
  }
}
