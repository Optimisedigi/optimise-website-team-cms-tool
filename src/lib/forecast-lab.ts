export interface ScenarioAssumptions {
  monthlyAdSpend?: number | null;
  targetMonthlyAdSpend?: number | null;
  currentCpa?: number | null;
  targetCpa?: number | null;
  conversionRate?: number | null;
  averageOrderValue?: number | null;
  leadCloseRate?: number | null;
  averageClientValue?: number | null;
  organicClickGrowthPct?: number | null;
  baselineOrganicClicks?: number | null;
  baselineOrganicImpressions?: number | null;
}

export interface ScenarioBand {
  leads: number;
  revenue: number;
  cpa?: number;
  roas?: number;
  organicClicks?: number;
  organicImpressions?: number;
}

export interface ScenarioOutput {
  conservative: ScenarioBand;
  base: ScenarioBand;
  optimistic: ScenarioBand;
  assumptions: {
    conservativeModifier: number;
    baseModifier: number;
    optimisticModifier: number;
  };
  caveats: string[];
}

const DEFAULT_MODIFIERS = {
  conservative: 0.75,
  base: 1,
  optimistic: 1.25,
} as const;

function finiteNumber(value: number | null | undefined, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positiveNumber(value: number | null | undefined, fallback = 0): number {
  const n = finiteNumber(value, fallback);
  return n > 0 ? n : fallback;
}

function revenueFromLeads(leads: number, input: ScenarioAssumptions): number {
  const closeRate = positiveNumber(input.leadCloseRate, 1);
  const clientValue = positiveNumber(input.averageClientValue, 0);
  const aov = positiveNumber(input.averageOrderValue, 0);
  if (clientValue > 0) return leads * closeRate * clientValue;
  return leads * aov;
}

function buildBands(base: ScenarioBand, input: ScenarioAssumptions, caveats: string[]): ScenarioOutput {
  const scale = (modifier: number): ScenarioBand => {
    const leads = base.leads * modifier;
    const revenue = revenueFromLeads(leads, input);
    const organicClicks = base.organicClicks == null ? undefined : base.organicClicks * modifier;
    const organicImpressions = base.organicImpressions == null ? undefined : base.organicImpressions * modifier;
    const spend = positiveNumber(input.targetMonthlyAdSpend ?? input.monthlyAdSpend, 0);
    const roas = spend > 0 ? revenue / spend : undefined;
    return {
      leads: round(leads),
      revenue: round(revenue),
      cpa: base.cpa == null ? undefined : round(base.cpa),
      roas: roas == null ? undefined : round(roas),
      organicClicks: organicClicks == null ? undefined : round(organicClicks),
      organicImpressions: organicImpressions == null ? undefined : round(organicImpressions),
    };
  };

  return {
    conservative: scale(DEFAULT_MODIFIERS.conservative),
    base: scale(DEFAULT_MODIFIERS.base),
    optimistic: scale(DEFAULT_MODIFIERS.optimistic),
    assumptions: {
      conservativeModifier: DEFAULT_MODIFIERS.conservative,
      baseModifier: DEFAULT_MODIFIERS.base,
      optimisticModifier: DEFAULT_MODIFIERS.optimistic,
    },
    caveats,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculatePaidScenario(input: ScenarioAssumptions): ScenarioOutput {
  const spend = positiveNumber(input.targetMonthlyAdSpend ?? input.monthlyAdSpend, 0);
  const cpa = positiveNumber(input.targetCpa ?? input.currentCpa, 0);
  const caveats: string[] = ["Paid forecast uses spend ÷ CPA and deterministic bands; it is not a media mix model."];
  if (spend <= 0) caveats.push("No target monthly ad spend was supplied.");
  if (cpa <= 0) caveats.push("No CPA was supplied, so paid leads resolve to zero.");
  const leads = cpa > 0 ? spend / cpa : 0;
  return buildBands({ leads, revenue: revenueFromLeads(leads, input), cpa }, input, caveats);
}

export function calculateOrganicScenario(input: ScenarioAssumptions): ScenarioOutput {
  const baselineClicks = positiveNumber(input.baselineOrganicClicks, 0);
  const growthPct = finiteNumber(input.organicClickGrowthPct, 0);
  const conversionRate = positiveNumber(input.conversionRate, 0);
  const projectedClicks = baselineClicks * (1 + growthPct / 100);
  const leads = projectedClicks * conversionRate;
  const baselineImpressions = positiveNumber(input.baselineOrganicImpressions, 0);
  const projectedImpressions = baselineImpressions > 0 ? baselineImpressions * (1 + growthPct / 100) : undefined;
  const caveats = [
    "Organic forecast uses projected clicks × conversion rate with deterministic bands.",
  ];
  if (baselineClicks <= 0) caveats.push("No baseline organic clicks were supplied.");
  if (conversionRate <= 0) caveats.push("No conversion rate was supplied, so organic leads resolve to zero.");
  return buildBands(
    { leads, revenue: revenueFromLeads(leads, input), organicClicks: projectedClicks, organicImpressions: projectedImpressions },
    input,
    caveats,
  );
}

export function calculateBlendedScenario(input: ScenarioAssumptions): ScenarioOutput {
  const paid = calculatePaidScenario(input).base;
  const organic = calculateOrganicScenario(input).base;
  const leads = paid.leads + organic.leads;
  const caveats = [
    "Blended forecast adds paid and organic projections; channel interaction effects are not modelled.",
  ];
  return buildBands(
    {
      leads,
      revenue: revenueFromLeads(leads, input),
      cpa: paid.cpa,
      organicClicks: organic.organicClicks,
      organicImpressions: organic.organicImpressions,
    },
    input,
    caveats,
  );
}

export function formatScenarioBands(output: ScenarioOutput): string[] {
  return (["conservative", "base", "optimistic"] as const).map((key) => {
    const band = output[key];
    const leadLabel = band.leads === 1 ? "lead" : "leads";
    const revenue = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(band.revenue);
    return `${key}: ${band.leads} ${leadLabel}, ${revenue} revenue`;
  });
}
