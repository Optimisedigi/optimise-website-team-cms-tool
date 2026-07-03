type ProposalKeyword = {
  text: string;
  matchType?: "PHRASE" | "EXACT" | "BROAD";
  monthlySearchVolume?: number;
  competition?: string;
  competitionIndex?: number;
  lowCpcMicros?: number;
  highCpcMicros?: number;
  existingCampaign?: string;
  existingAdGroup?: string;
  existingClicks?: number;
  existingImpressions?: number;
  existingCost?: number;
  existingConversions?: number;
};

type ProposedAdGroup = {
  name: string;
  theme?: string;
  keywords?: ProposalKeyword[];
  keywordIdeas?: ProposalKeyword[];
  keywordsUsed?: ProposalKeyword[];
  seedKeywords?: string[];
  targetKeywords?: string[];
  totalMonthlyVolume?: number;
  landingPage: {
    url: string | null;
    status: "exists" | "needs-improvement" | "create";
  };
};

type ProposedCampaign = {
  name: string;
  campaignType?: "brand" | "generic";
  channelType?: "SEARCH";
  adGroups?: ProposedAdGroup[];
  totalMonthlyVolume?: number;
};

type ImportedKeyword = {
  text: string;
  existingCampaign: string;
  existingAdGroup: string;
  existingClicks: number;
  existingImpressions: number;
  existingCost: number;
  existingConversions: number;
  monthlySearchVolume: number;
};

function getExportKeywords(adGroup: ProposedAdGroup): ProposalKeyword[] {
  const keywordRows = [
    adGroup.keywords,
    adGroup.keywordIdeas,
    adGroup.keywordsUsed,
  ].find((keywords): keywords is ProposalKeyword[] => Array.isArray(keywords) && keywords.length > 0);

  if (keywordRows) return keywordRows.filter((keyword) => keyword?.text?.trim());

  const seedKeyword = [
    ...(Array.isArray(adGroup.targetKeywords) ? adGroup.targetKeywords : []),
    ...(Array.isArray(adGroup.seedKeywords) ? adGroup.seedKeywords : []),
  ].find((keyword) => typeof keyword === "string" && keyword.trim());

  return [{
    text: seedKeyword?.trim() || "",
    matchType: "PHRASE",
    monthlySearchVolume: adGroup.totalMonthlyVolume,
  }];
}

function escapeCsvValue(val: string) {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { fields.push(current); current = ""; }
      else { current += ch; }
    }
  }
  fields.push(current);
  return fields;
}

export function buildCampaignProposalCsv(proposal: { proposedCampaigns?: ProposedCampaign[] }): string {
  const headers = [
    "Proposed Campaign", "Proposed Ad Group", "Keyword", "Monthly Searches", "Proposed Landing Page",
    "Current Campaign", "Current Ad Group", "Clicks", "Impressions",
    "Cost ($)", "Conversions", "Mapped", "Landing Page Status",
  ];
  const rows: string[] = [headers.join(",")];

  for (const campaign of proposal.proposedCampaigns || []) {
    for (const adGroup of campaign.adGroups || []) {
      for (const keyword of getExportKeywords(adGroup)) {
        const mapped = keyword.existingCampaign || keyword.existingAdGroup;
        rows.push([
          escapeCsvValue(campaign.name),
          escapeCsvValue(adGroup.name),
          escapeCsvValue(keyword.text),
          keyword.monthlySearchVolume?.toString() || adGroup.totalMonthlyVolume?.toString() || "",
          escapeCsvValue(adGroup.landingPage.url || ""),
          escapeCsvValue(keyword.existingCampaign || ""),
          escapeCsvValue(keyword.existingAdGroup || ""),
          keyword.existingClicks?.toString() || "",
          keyword.existingImpressions?.toString() || "",
          keyword.existingCost != null ? keyword.existingCost.toFixed(2) : "",
          keyword.existingConversions?.toString() || "",
          mapped ? "Yes" : "No",
          escapeCsvValue(adGroup.landingPage.status),
        ].join(","));
      }
    }
  }

  return rows.join("\n");
}

export function buildImportedCampaignsFromCsv(csvContent: string) {
  const lines = csvContent.split("\n").filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headerFields = parseCsvLine(lines[0]).map((field) => field.trim().toLowerCase());
  const columnIndex = (name: string, fallback: number) => {
    const index = headerFields.indexOf(name.toLowerCase());
    return index >= 0 ? index : fallback;
  };
  const columns = {
    campaign: columnIndex("Proposed Campaign", 0),
    adGroup: columnIndex("Proposed Ad Group", 1),
    keyword: columnIndex("Keyword", 2),
    monthlySearches: columnIndex("Monthly Searches", -1),
    landingPage: columnIndex("Proposed Landing Page", 3),
    currentCampaign: columnIndex("Current Campaign", 4),
    currentAdGroup: columnIndex("Current Ad Group", 5),
    clicks: columnIndex("Clicks", 6),
    impressions: columnIndex("Impressions", 7),
    cost: columnIndex("Cost ($)", 8),
    conversions: columnIndex("Conversions", 9),
    landingPageStatus: columnIndex("Landing Page Status", 11),
  };
  const readColumn = (fields: string[], index: number) => (index >= 0 ? fields[index]?.trim() : "");
  const campaignMap = new Map<string, Map<string, { keywords: ImportedKeyword[]; landingPage: string; status: string; monthlySearchVolume: number }>>();

  for (const line of lines.slice(1)) {
    const fields = parseCsvLine(line);
    const campaign = readColumn(fields, columns.campaign);
    const adGroup = readColumn(fields, columns.adGroup);
    const keyword = readColumn(fields, columns.keyword);
    const landingPage = readColumn(fields, columns.landingPage) || "";
    const existingCampaign = readColumn(fields, columns.currentCampaign) || "";
    const existingAdGroup = readColumn(fields, columns.currentAdGroup) || "";
    const clicks = parseFloat(readColumn(fields, columns.clicks)) || 0;
    const impressions = parseFloat(readColumn(fields, columns.impressions)) || 0;
    const cost = parseFloat(readColumn(fields, columns.cost)) || 0;
    const conversions = parseFloat(readColumn(fields, columns.conversions)) || 0;
    const monthlySearchVolume = parseFloat(readColumn(fields, columns.monthlySearches)) || 0;
    const status = readColumn(fields, columns.landingPageStatus) || "exists";
    if (!campaign || !adGroup) continue;

    if (!campaignMap.has(campaign)) campaignMap.set(campaign, new Map());
    const adGroupMap = campaignMap.get(campaign)!;
    if (!adGroupMap.has(adGroup)) adGroupMap.set(adGroup, { keywords: [], landingPage, status, monthlySearchVolume: 0 });
    const adGroupData = adGroupMap.get(adGroup)!;
    adGroupData.monthlySearchVolume += monthlySearchVolume;
    if (keyword) {
      adGroupData.keywords.push({
        text: keyword,
        existingCampaign,
        existingAdGroup,
        existingClicks: clicks,
        existingImpressions: impressions,
        existingCost: cost,
        existingConversions: conversions,
        monthlySearchVolume,
      });
    }
  }

  return Array.from(campaignMap.entries()).map(([campaignName, adGroupMap]) => ({
    name: campaignName,
    campaignType: campaignName.toLowerCase().includes("brand") ? "brand" as const : "generic" as const,
    channelType: "SEARCH" as const,
    adGroups: Array.from(adGroupMap.entries()).map(([adGroupName, data]) => ({
      name: adGroupName,
      theme: adGroupName,
      keywords: data.keywords.map((keyword) => ({
        text: keyword.text,
        matchType: "PHRASE" as const,
        monthlySearchVolume: keyword.monthlySearchVolume,
        competition: "UNKNOWN",
        competitionIndex: 0,
        lowCpcMicros: 0,
        highCpcMicros: 0,
        ...(keyword.existingCampaign ? { existingCampaign: keyword.existingCampaign } : {}),
        ...(keyword.existingAdGroup ? { existingAdGroup: keyword.existingAdGroup } : {}),
        ...(keyword.existingClicks ? { existingClicks: keyword.existingClicks } : {}),
        ...(keyword.existingImpressions ? { existingImpressions: keyword.existingImpressions } : {}),
        ...(keyword.existingCost ? { existingCost: keyword.existingCost } : {}),
        ...(keyword.existingConversions ? { existingConversions: keyword.existingConversions } : {}),
      })),
      totalMonthlyVolume: data.keywords.length > 0
        ? data.keywords.reduce((sum, keyword) => sum + keyword.monthlySearchVolume, 0)
        : data.monthlySearchVolume,
      landingPage: {
        url: data.landingPage || null,
        status: (data.status || "exists") as "exists" | "needs-improvement" | "create",
      },
      sourcePageUrl: null,
    })),
    totalMonthlyVolume: Array.from(adGroupMap.values()).reduce(
      (sum, data) => sum + (data.keywords.length > 0
        ? data.keywords.reduce((keywordSum, keyword) => keywordSum + keyword.monthlySearchVolume, 0)
        : data.monthlySearchVolume),
      0,
    ),
  }));
}
