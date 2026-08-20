import { describe, expect, it } from "vitest";
import { Clients } from "@/collections/Clients";

/**
 * Every platform account ID an admin can type must live on the Integrations
 * tab, next to the Test connection controls that validate it.
 *
 * Before consolidation the three IDs sat on three different tabs (Google Ads on
 * Business, GA4 on Google Analytics, Meta on Integrations), so the tab that
 * tested an ID was never the tab that set it — which is how a client could show
 * "Not configured" next to a customer ID the user had just entered.
 *
 * These assertions read the real collection config, so moving a field back to
 * another tab fails here rather than in the admin UI.
 */

type AnyField = Record<string, unknown>;

/**
 * Every field nested anywhere under `field` — rows, collapsibles, groups and
 * nested tab sets alike. Tabs hang off `.tabs`, not `.fields`; missing that
 * would silently hide fields (and undercount duplicates) in these assertions.
 */
function descendants(field: AnyField): AnyField[] {
  const nested = [
    ...((field.fields as AnyField[] | undefined) ?? []),
    ...((field.tabs as AnyField[] | undefined) ?? []),
  ];
  return nested.flatMap((f) => [f, ...descendants(f)]);
}

function tabNamed(label: string): AnyField {
  const tabsField = (Clients.fields as AnyField[]).find((f) => f.type === "tabs");
  const tabs = (tabsField?.tabs as AnyField[] | undefined) ?? [];
  const tab = tabs.find((t) => t.label === label);
  if (!tab) throw new Error(`No "${label}" tab on the Clients collection`);
  return tab;
}

const fieldNamesIn = (label: string) =>
  descendants(tabNamed(label))
    .map((f) => f.name)
    .filter((n): n is string => typeof n === "string");

const fieldIn = (label: string, name: string) =>
  descendants(tabNamed(label)).find((f) => f.name === name);

const EDITABLE_IDS = ["googleAdsCustomerId", "ga4PropertyId", "metaAdAccountId"] as const;

describe("platform account IDs live on the Integrations tab", () => {
  it.each(EDITABLE_IDS)("houses %s on Integrations", (name) => {
    expect(fieldNamesIn("Integrations")).toContain(name);
  });

  it.each(EDITABLE_IDS)("gives %s an explicit label", (name) => {
    // Without a label Payload renders the custom Google Ads input with no field
    // name at all — the bug that started this.
    expect(fieldIn("Integrations", name)?.label).toBeTruthy();
  });

  it.each(EDITABLE_IDS)("keeps %s defined exactly once across the collection", (name) => {
    const tabsField = (Clients.fields as AnyField[]).find((f) => f.type === "tabs");
    const everyField = ((tabsField?.tabs as AnyField[]) ?? []).flatMap(descendants);
    expect(everyField.filter((f) => f.name === name)).toHaveLength(1);
  });

  it("no longer carries the Google Ads ID on the Business tab", () => {
    expect(fieldNamesIn("Business")).not.toContain("googleAdsCustomerId");
  });

  it("no longer carries the GA4 property ID on the Google Analytics tab", () => {
    expect(fieldNamesIn("Google Analytics")).not.toContain("ga4PropertyId");
  });

  it("leaves the conversion goals behind on Business", () => {
    // Moving the ID must not drag the unrelated goal selects with it.
    expect(fieldNamesIn("Business")).toEqual(
      expect.arrayContaining(["conversionGoal", "secondaryConversionGoal"]),
    );
  });

  it("keeps the OAuth-populated GSC property URL read-only where OAuth writes it", () => {
    // Deliberately NOT moved: nothing to type, so it stays under Search.
    const gsc = fieldIn("Search", "gscPropertyUrl") as { admin?: { readOnly?: boolean } } | undefined;
    expect(gsc).toBeDefined();
    expect(gsc?.admin?.readOnly).toBe(true);
  });

  it("still normalises the Google Ads ID to 10 digits after the move", () => {
    const field = fieldIn("Integrations", "googleAdsCustomerId") as {
      hooks?: { beforeChange?: Array<(args: { value: unknown }) => unknown> };
    };
    const hook = field.hooks?.beforeChange?.[0];
    expect(hook).toBeDefined();
    expect(hook!({ value: "342-535-3766" })).toBe("3425353766");
    expect(hook!({ value: "48948966669999" })).toBe("4894896666");
  });
});
