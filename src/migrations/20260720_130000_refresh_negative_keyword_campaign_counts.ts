import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

interface SqlRows<T> {
  rows: T[];
}

interface NegativeKeywordListRow {
  id: number;
  campaignRegex: string | null;
  customerId: string | null;
}

function matchesPattern(name: string, campaignRegex: string | null | undefined): boolean {
  const target = String(name ?? "");
  const raw = String(campaignRegex ?? "").trim();
  if (!raw) return false;

  let regexStr = raw;
  if (/^[a-zA-Z0-9 _-]+$/.test(regexStr)) {
    regexStr = `.*${regexStr}.*`;
  }

  try {
    return new RegExp(regexStr, "i").test(target);
  } catch {
    return target.toLowerCase().includes(raw.toLowerCase());
  }
}

async function fetchCampaignNames(customerId: string): Promise<string[] | null> {
  const growthToolsUrl = process.env.GROWTH_TOOLS_URL;
  const internalApiKey = process.env.INTERNAL_API_KEY;
  if (!growthToolsUrl || !internalApiKey) return null;

  try {
    const res = await fetch(`${growthToolsUrl}/api/google-ads/campaigns?customerId=${customerId}`, {
      headers: { "x-internal-key": internalApiKey },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const campaigns: Array<{ name?: string }> = Array.isArray(data?.campaigns) ? data.campaigns : [];
    return campaigns.map((campaign) => campaign.name).filter(Boolean) as string[];
  } catch {
    return null;
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db
    .run(sql`ALTER TABLE \`negative_keyword_lists\` ADD \`campaign_count\` numeric DEFAULT 0;`)
    .catch(() => undefined);

  await db.run(sql`
    UPDATE \`negative_keyword_lists\`
    SET \`campaign_count\` = CASE
      WHEN COALESCE(TRIM(\`campaign_regex\`), '') = '' THEN 0
      ELSE COALESCE((
        SELECT COUNT(*)
        FROM \`negative_keyword_lists_campaigns\`
        WHERE \`negative_keyword_lists_campaigns\`.\`_parent_id\` = \`negative_keyword_lists\`.\`id\`
      ), 0)
    END;
  `);

  const result = (await db.run(sql`
    SELECT
      nkl.\`id\`,
      nkl.\`campaign_regex\` as campaignRegex,
      clients.\`google_ads_customer_id\` as customerId
    FROM \`negative_keyword_lists\` nkl
    LEFT JOIN \`clients\` clients ON clients.\`id\` = nkl.\`client_id\`
    WHERE COALESCE(TRIM(nkl.\`campaign_regex\`), '') != '';
  `)) as unknown as SqlRows<NegativeKeywordListRow>;

  const campaignCache = new Map<string, string[] | null>();

  for (const list of result.rows || []) {
    const customerId = String(list.customerId ?? "").replace(/\D/g, "");
    if (!customerId) continue;

    if (!campaignCache.has(customerId)) {
      campaignCache.set(customerId, await fetchCampaignNames(customerId));
    }

    const accountCampaigns = campaignCache.get(customerId);
    if (!accountCampaigns) continue;

    const matched = accountCampaigns.filter((name) => matchesPattern(name, list.campaignRegex));

    await db.run(sql`DELETE FROM \`negative_keyword_lists_campaigns\` WHERE \`_parent_id\` = ${list.id};`);

    for (const [index, campaignName] of matched.entries()) {
      await db.run(sql`
        INSERT INTO \`negative_keyword_lists_campaigns\` (\`_order\`, \`_parent_id\`, \`id\`, \`campaign_name\`)
        VALUES (${index + 1}, ${list.id}, ${`refresh-${list.id}-${index}`}, ${campaignName});
      `);
    }

    await db.run(sql`
      UPDATE \`negative_keyword_lists\`
      SET \`campaign_count\` = ${matched.length}
      WHERE \`id\` = ${list.id};
    `);
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db
    .run(sql`ALTER TABLE \`negative_keyword_lists\` DROP COLUMN \`campaign_count\`;`)
    .catch(() => undefined);
}
