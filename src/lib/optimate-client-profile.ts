import type { Payload } from "payload";
import type { Client, Contract, InvoiceStatementDraft } from "@/payload-types";
import type { StatementInvoiceSnapshot, StatementSnapshot } from "@/lib/invoice-statement-email";

export type OptimateClientProfileFieldGroup =
  | "identity"
  | "contact"
  | "commercial"
  | "tracking"
  | "business"
  | "goals"
  | "locations"
  | "contracts"
  | "invoices"
  | "notes"
  | "timeline"
  | "all";

export type BuildOptimateClientProfileArgs = {
  id?: string | number;
  slug?: string;
  idOrSlug?: string | number;
  fields?: OptimateClientProfileFieldGroup[];
  limit?: number;
};

export type OptimateClientProfile = {
  id: number;
  name: string | null;
  slug: string | null;
  isActive: boolean | null;
  generatedAt: string;
  groupsReturned: OptimateClientProfileFieldGroup[];
  identity?: {
    websiteUrl: string | null;
    websiteType: Client["websiteType"] | null;
    services: Client["services"] | null;
    clientType: Client["clientType"] | null;
    isAgency: boolean | null;
  };
  contact?: {
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    additionalContacts: Array<{
      name: string | null;
      jobTitle: string | null;
      email: string | null;
      phone: string | null;
      responsibilities: string | null;
    }>;
    accountManagers: Array<{ name: string | null; email: string | null }>;
  };
  commercial?: {
    clientStartDate: string | null;
    retainerStartDate: string | null;
    monthlyRetainer: number | null;
    setupFee: number | null;
    revenueSharePercent: number | null;
    oneOffProjects: Array<{
      projectName: string | null;
      amount: number | null;
      date: string | null;
      countTowardsRetainer: boolean | null;
    }>;
    historicalRevenueByYear: Array<{ year: number | null; amount: number | null }>;
  };
  tracking?: {
    googleAdsCustomerId: string | null;
    ga4PropertyId: string | null;
    ga4MeasurementId: string | null;
    ga4Connected: boolean | null;
    gscConnected: boolean | null;
    gscPropertyUrl: string | null;
    gtmContainerId: string | null;
    expectedEvents: string | null;
    dashboardConversionActions: string | null;
    phoneCallConversionActions: string | null;
    formSubmitConversionActions: string | null;
    conversionActionCategories: Array<{
      label: string | null;
      color: string | null;
      actions: string | null;
    }>;
  };
  business?: {
    businessType: Client["businessType"] | null;
    targetLocation: string | null;
    acquisitionChannel: Client["acquisitionChannel"] | null;
    acquisitionDetail: string | null;
    referredBy: string | null;
    referredByContact: string | null;
    keywords: string | null;
    competitors: Array<{
      name: string | null;
      websiteUrl: string | null;
      googleMapsUrl: string | null;
    }>;
  };
  goals?: {
    conversionGoal: Client["conversionGoal"] | null;
    secondaryConversionGoal: Client["secondaryConversionGoal"] | null;
    clientGoals: string | null;
    leadConversionRate: number | null;
    leadToSaleConversionRate: number | null;
    averageOrderValue: number | null;
    annualPurchaseFrequency: number | null;
    newCustomersLast12Months: number | null;
  };
  locations?: {
    hasPhysicalLocations: boolean | null;
    numberOfLocations: number | null;
    googleMapsUrls: Array<{ url: string | null; label: string | null }>;
  };
  contracts?: {
    totalCount: number;
    returned: number;
    latest: OptimateContractSummary | null;
    items: OptimateContractSummary[];
  };
  invoices?: {
    source: "invoice-statement-drafts";
    totalDrafts: number;
    returned: number;
    latest: OptimateInvoiceDraftSummary | null;
    items: OptimateInvoiceDraftSummary[];
  };
  notes?: {
    totalCount: number;
    returned: number;
    items: Array<{
      category: string | null;
      date: string | null;
      author: string | null;
      content: string | null;
    }>;
  };
  timeline?: {
    totalCount: number;
    returned: number;
    entries: Array<{
      date: string | null;
      serviceArea: string | null;
      actionType: string | null;
      description: string | null;
    }>;
  };
};

export type OptimateContractSummary = {
  id: number;
  contractTitle: string | null;
  status: Contract["status"] | null;
  contractDate: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  effectiveDateConfirmed: boolean | null;
  effectiveDateOnDeposit: boolean | null;
  currency: Contract["currency"] | null;
  monthlyRetainer: number | null;
  setupFee: number | null;
  monthlyHosting: number | null;
  annualHosting: number | null;
  additionalWork: Array<{
    projectName: string | null;
    amount: number | null;
    countTowardsRetainer: boolean | null;
  }>;
  contractTerm: string | null;
  paymentTerms: string | null;
  clientName: string | null;
  clientContactName: string | null;
  clientEmail: string | null;
  clientSignedAt: string | null;
  sentAt: string | null;
  signedPdfUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type OptimateInvoiceDraftSummary = {
  id: number;
  status: InvoiceStatementDraft["status"];
  generatedAt: string | null;
  lastRefreshedAt: string | null;
  xeroContactId: string | null;
  contactName: string | null;
  recipientEmail: string | null;
  totalOutstanding: number;
  totalOverdue: number;
  unpaidCount: number;
  overdueCount: number;
  snapshotCapturedAt: string | null;
  unpaidInvoices: Array<Pick<StatementInvoiceSnapshot, "invoiceId" | "invoiceNumber" | "reference" | "date" | "dueDate" | "total" | "amountDue" | "status" | "onlineInvoiceUrl">>;
};

const DEFAULT_GROUPS: OptimateClientProfileFieldGroup[] = [
  "identity",
  "contact",
  "commercial",
  "tracking",
  "business",
  "goals",
];

const ALL_GROUPS: OptimateClientProfileFieldGroup[] = [
  "identity",
  "contact",
  "commercial",
  "tracking",
  "business",
  "goals",
  "locations",
  "contracts",
  "invoices",
  "notes",
  "timeline",
];

export async function buildOptimateClientProfile(
  payload: Payload,
  args: BuildOptimateClientProfileArgs,
): Promise<OptimateClientProfile | null> {
  const limit = clampLimit(args.limit);
  const groups = normaliseGroups(args.fields);
  const client = await findClient(payload, args);
  if (!client) return null;

  const [contracts, invoices] = await Promise.all([
    groups.includes("contracts")
      ? findClientContracts(payload, client.id, limit)
      : Promise.resolve({ docs: [], totalDocs: 0 }),
    groups.includes("invoices")
      ? findClientInvoiceDrafts(payload, client.id, limit)
      : Promise.resolve({ docs: [], totalDocs: 0 }),
  ]);

  return projectProfile(client, groups, limit, contracts, invoices);
}

function normaliseGroups(fields: OptimateClientProfileFieldGroup[] | undefined): OptimateClientProfileFieldGroup[] {
  if (!fields || fields.length === 0) return DEFAULT_GROUPS;
  const valid = new Set<OptimateClientProfileFieldGroup>([...ALL_GROUPS, "all"]);
  const requested = fields.filter((field) => valid.has(field));
  if (requested.includes("all")) return ALL_GROUPS;
  return requested.length > 0 ? Array.from(new Set(requested)) : DEFAULT_GROUPS;
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 10;
  return Math.max(1, Math.min(50, Math.floor(Number(limit))));
}

async function findClient(payload: Payload, args: BuildOptimateClientProfileArgs): Promise<Client | null> {
  const idOrSlug = args.id ?? args.slug ?? args.idOrSlug;
  if (idOrSlug === undefined || idOrSlug === null || idOrSlug === "") return null;

  const numericId = typeof idOrSlug === "number" || /^\d+$/.test(String(idOrSlug)) ? Number(idOrSlug) : null;
  if (numericId !== null && Number.isFinite(numericId)) {
    try {
      return (await payload.findByID({
        collection: "clients" as never,
        id: numericId as never,
        depth: 0,
        overrideAccess: true,
      })) as unknown as Client;
    } catch {
      return null;
    }
  }

  const slug = String(idOrSlug);
  const result = await payload.find({
    collection: "clients" as never,
    where: { slug: { equals: slug } } as never,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return (result.docs[0] as unknown as Client | undefined) ?? null;
}

type LimitedDocs<T> = {
  docs: T[];
  totalDocs: number;
};

async function findClientContracts(payload: Payload, clientId: number, limit: number): Promise<LimitedDocs<Contract>> {
  const result = await payload.find({
    collection: "contracts" as never,
    where: {
      and: [
        { client: { equals: clientId } },
        {
          or: [
            { deletedAt: { exists: false } },
            { deletedAt: { equals: null } },
          ],
        },
      ],
    } as never,
    sort: "-contractDate",
    limit,
    depth: 0,
    overrideAccess: true,
  });
  return {
    docs: result.docs as unknown as Contract[],
    totalDocs: result.totalDocs,
  };
}

async function findClientInvoiceDrafts(payload: Payload, clientId: number, limit: number): Promise<LimitedDocs<InvoiceStatementDraft>> {
  const result = await payload.find({
    collection: "invoice-statement-drafts" as never,
    where: { client: { equals: clientId } } as never,
    sort: "-generatedAt",
    limit,
    depth: 0,
    overrideAccess: true,
  });
  return {
    docs: result.docs as unknown as InvoiceStatementDraft[],
    totalDocs: result.totalDocs,
  };
}

function projectProfile(
  client: Client,
  groups: OptimateClientProfileFieldGroup[],
  limit: number,
  contracts: LimitedDocs<Contract>,
  invoices: LimitedDocs<InvoiceStatementDraft>,
): OptimateClientProfile {
  const want = (group: OptimateClientProfileFieldGroup): boolean => groups.includes(group);
  const out: OptimateClientProfile = {
    id: client.id,
    name: client.name ?? null,
    slug: client.slug ?? null,
    isActive: client.isActive ?? null,
    generatedAt: new Date().toISOString(),
    groupsReturned: groups,
  };

  if (want("identity")) {
    out.identity = {
      websiteUrl: client.websiteUrl ?? null,
      websiteType: client.websiteType ?? null,
      services: client.services ?? null,
      clientType: client.clientType ?? null,
      isAgency: client.isAgency ?? null,
    };
  }

  if (want("contact")) {
    out.contact = {
      contactName: client.contactName ?? null,
      contactEmail: client.contactEmail ?? null,
      contactPhone: client.contactPhone ?? null,
      additionalContacts: (client.additionalContacts ?? []).map((contact) => ({
        name: contact.name ?? null,
        jobTitle: contact.jobTitle ?? null,
        email: contact.email ?? null,
        phone: contact.phone ?? null,
        responsibilities: contact.responsibilities ?? null,
      })),
      accountManagers: (client.accountManagers ?? []).map((manager) => ({
        name: manager.name ?? null,
        email: manager.email ?? null,
      })),
    };
  }

  if (want("commercial")) {
    out.commercial = {
      clientStartDate: client.clientStartDate ?? null,
      retainerStartDate: client.retainerStartDate ?? null,
      monthlyRetainer: client.monthlyRetainer ?? null,
      setupFee: client.setupFee ?? null,
      revenueSharePercent: client.revenueSharePercent ?? null,
      oneOffProjects: (client.oneOffProjects ?? []).map((project) => ({
        projectName: project.projectName ?? null,
        amount: project.amount ?? null,
        date: project.date ?? null,
        countTowardsRetainer: project.countTowardsRetainer ?? null,
      })),
      historicalRevenueByYear: (client.historicalRevenueByYear ?? []).map((row) => ({
        year: row.year ?? null,
        amount: row.amount ?? null,
      })),
    };
  }

  if (want("tracking")) {
    out.tracking = {
      googleAdsCustomerId: client.googleAdsCustomerId ?? null,
      ga4PropertyId: client.ga4PropertyId ?? null,
      ga4MeasurementId: client.ga4MeasurementId ?? null,
      ga4Connected: client.ga4Connected ?? null,
      gscConnected: client.gscConnected ?? null,
      gscPropertyUrl: client.gscPropertyUrl ?? null,
      gtmContainerId: client.gtmContainerId ?? null,
      expectedEvents: client.expectedEvents ?? null,
      dashboardConversionActions: client.dashboardConversionActions ?? null,
      phoneCallConversionActions: client.phoneCallConversionActions ?? null,
      formSubmitConversionActions: client.formSubmitConversionActions ?? null,
      conversionActionCategories: (client.conversionActionCategories ?? []).map((category) => ({
        label: category.label ?? null,
        color: category.color ?? null,
        actions: category.actions ?? null,
      })),
    };
  }

  if (want("business")) {
    out.business = {
      businessType: client.businessType ?? null,
      targetLocation: client.targetLocation ?? null,
      acquisitionChannel: client.acquisitionChannel ?? null,
      acquisitionDetail: client.acquisitionDetail ?? null,
      referredBy: client.referredBy ?? null,
      referredByContact: client.referredByContact ?? null,
      keywords: client.keywords ?? null,
      competitors: (client.competitors ?? []).map((competitor) => ({
        name: competitor.name ?? null,
        websiteUrl: competitor.websiteUrl ?? null,
        googleMapsUrl: competitor.googleMapsUrl ?? null,
      })),
    };
  }

  if (want("goals")) {
    out.goals = {
      conversionGoal: client.conversionGoal ?? null,
      secondaryConversionGoal: client.secondaryConversionGoal ?? null,
      clientGoals: client.clientGoals ?? null,
      leadConversionRate: client.leadConversionRate ?? null,
      leadToSaleConversionRate: client.leadToSaleConversionRate ?? null,
      averageOrderValue: client.averageOrderValue ?? null,
      annualPurchaseFrequency: client.annualPurchaseFrequency ?? null,
      newCustomersLast12Months: client.newCustomersLast12Months ?? null,
    };
  }

  if (want("locations")) {
    out.locations = {
      hasPhysicalLocations: client.hasPhysicalLocations ?? null,
      numberOfLocations: client.numberOfLocations ?? null,
      googleMapsUrls: (client.googleMapsUrls ?? []).map((row) => ({
        url: row.url ?? null,
        label: row.label ?? null,
      })),
    };
  }

  if (want("contracts")) {
    const items = contracts.docs.map(projectContract);
    out.contracts = {
      totalCount: contracts.totalDocs,
      returned: items.length,
      latest: items[0] ?? null,
      items,
    };
  }

  if (want("invoices")) {
    const items = invoices.docs.map(projectInvoiceDraft);
    out.invoices = {
      source: "invoice-statement-drafts",
      totalDrafts: invoices.totalDocs,
      returned: items.length,
      latest: items[0] ?? null,
      items,
    };
  }

  if (want("notes")) {
    const notes = (client.clientNotes ?? [])
      .slice()
      .sort((a, b) => Date.parse(b.date ?? "") - Date.parse(a.date ?? ""));
    out.notes = {
      totalCount: notes.length,
      returned: Math.min(notes.length, limit),
      items: notes.slice(0, limit).map((note) => ({
        category: note.category ?? null,
        date: note.date ?? null,
        author: note.author ?? null,
        content: note.content ?? null,
      })),
    };
  }

  if (want("timeline")) {
    const timeline = (client.accountTimeline ?? [])
      .slice()
      .sort((a, b) => Date.parse(b.date ?? "") - Date.parse(a.date ?? ""));
    out.timeline = {
      totalCount: timeline.length,
      returned: Math.min(timeline.length, limit),
      entries: timeline.slice(0, limit).map((entry) => ({
        date: entry.date ?? null,
        serviceArea: entry.serviceArea ?? null,
        actionType: entry.actionType ?? null,
        description: entry.description ?? null,
      })),
    };
  }

  return out;
}

function projectContract(contract: Contract): OptimateContractSummary {
  return {
    id: contract.id,
    contractTitle: contract.contractTitle ?? null,
    status: contract.status ?? null,
    contractDate: contract.contractDate ?? null,
    contractStartDate: contract.contractStartDate ?? null,
    contractEndDate: contract.contractEndDate ?? null,
    effectiveDateConfirmed: contract.effectiveDateConfirmed ?? null,
    effectiveDateOnDeposit: contract.effectiveDateOnDeposit ?? null,
    currency: contract.currency ?? null,
    monthlyRetainer: contract.monthlyRetainer ?? null,
    setupFee: contract.setupFee ?? null,
    monthlyHosting: contract.monthlyHosting ?? null,
    annualHosting: contract.annualHosting ?? null,
    additionalWork: (contract.additionalWork ?? []).map((work) => ({
      projectName: work.projectName ?? null,
      amount: work.amount ?? null,
      countTowardsRetainer: work.countTowardsRetainer ?? null,
    })),
    contractTerm: contract.contractTerm ?? null,
    paymentTerms: contract.paymentTerms ?? null,
    clientName: contract.clientName ?? null,
    clientContactName: contract.clientContactName ?? null,
    clientEmail: contract.clientEmail ?? null,
    clientSignedAt: contract.clientSignedAt ?? null,
    sentAt: contract.sentAt ?? null,
    signedPdfUrl: contract.signedPdfUrl ?? null,
    createdAt: contract.createdAt ?? null,
    updatedAt: contract.updatedAt ?? null,
  };
}

function projectInvoiceDraft(draft: InvoiceStatementDraft): OptimateInvoiceDraftSummary {
  const snapshot = normaliseStatementSnapshot(draft.snapshot);
  return {
    id: draft.id,
    status: draft.status,
    generatedAt: draft.generatedAt ?? null,
    lastRefreshedAt: draft.lastRefreshedAt ?? null,
    xeroContactId: draft.xeroContactId ?? null,
    contactName: draft.contactName ?? null,
    recipientEmail: draft.recipientEmail ?? null,
    totalOutstanding: draft.totalOutstanding ?? 0,
    totalOverdue: draft.totalOverdue ?? 0,
    unpaidCount: draft.unpaidCount ?? 0,
    overdueCount: draft.overdueCount ?? 0,
    snapshotCapturedAt: snapshot?.capturedAt ?? null,
    unpaidInvoices: (snapshot?.unpaid ?? []).map((invoice) => ({
      invoiceId: invoice.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      reference: invoice.reference,
      date: invoice.date,
      dueDate: invoice.dueDate,
      total: invoice.total,
      amountDue: invoice.amountDue,
      status: invoice.status,
      onlineInvoiceUrl: invoice.onlineInvoiceUrl,
    })),
  };
}

function normaliseStatementSnapshot(value: InvoiceStatementDraft["snapshot"]): StatementSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const maybe = value as Partial<StatementSnapshot>;
  if (!Array.isArray(maybe.unpaid)) return null;
  return {
    contact: {
      contactId: maybe.contact?.contactId ?? "",
      contactName: maybe.contact?.contactName ?? "",
      firstName: maybe.contact?.firstName ?? "",
      lastName: maybe.contact?.lastName ?? "",
      emailAddress: maybe.contact?.emailAddress ?? "",
    },
    unpaid: maybe.unpaid.filter(isStatementInvoiceSnapshot),
    paid: Array.isArray(maybe.paid) ? maybe.paid.filter(isStatementInvoiceSnapshot) : [],
    totalOutstanding: Number(maybe.totalOutstanding) || 0,
    totalOverdue: Number(maybe.totalOverdue) || 0,
    unpaidCount: Number(maybe.unpaidCount) || 0,
    overdueCount: Number(maybe.overdueCount) || 0,
    capturedAt: maybe.capturedAt ?? "",
  };
}

function isStatementInvoiceSnapshot(value: unknown): value is StatementInvoiceSnapshot {
  if (!value || typeof value !== "object") return false;
  const invoice = value as Partial<StatementInvoiceSnapshot>;
  return typeof invoice.invoiceId === "string" && typeof invoice.invoiceNumber === "string";
}
