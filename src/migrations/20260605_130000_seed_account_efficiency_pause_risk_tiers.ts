import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

interface SqlRow<T = unknown> {
  rows: T[];
}

async function findTierIdByName(db: MigrateUpArgs["db"], name: string): Promise<number | null> {
  const result = (await db.run(
    sql`SELECT id FROM \`goal_risk_tiers\` WHERE name = ${name} LIMIT 1;`,
  )) as unknown as SqlRow<{ id: number }>;
  const row = Array.isArray(result.rows) ? result.rows[0] : undefined;
  return row && typeof row.id === "number" ? row.id : null;
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const rows = [
    {
      name: "Red — Account Efficiency ad-group-pause",
      tier: "red",
      actionType: "ad-group-pause",
      description: "Red tier for Account Efficiency ad-group pauses. Always requires explicit approval; goal handler enforces a hard approval lock.",
    },
    {
      name: "Yellow — Account Efficiency keyword-pause",
      tier: "yellow",
      actionType: "keyword-pause",
      description: "Yellow tier for Account Efficiency keyword pauses. Requires explicit approval by default because keyword-level rank diagnostics are not yet available in snapshots.",
    },
    {
      name: "Red — Account Efficiency campaign-target-cpa-update",
      tier: "red",
      actionType: "campaign-target-cpa-update",
      description: "Red tier for Account Efficiency target CPA changes. Requires approval because bid target changes can materially alter delivery and CPA.",
    },
    {
      name: "Red — Account Efficiency campaign-target-roas-update",
      tier: "red",
      actionType: "campaign-target-roas-update",
      description: "Red tier for Account Efficiency target ROAS changes. Seeded for future ROAS enablement; handler remains blocked until conversion-value snapshots and Growth Tools schema are verified.",
    },
    {
      name: "Red — Account Efficiency campaign-bid-strategy-change",
      tier: "red",
      actionType: "campaign-bid-strategy-change",
      description: "Red tier for Account Efficiency bid strategy recommendations. Proposal-only and always approval-gated before any future live handler is enabled.",
    },
  ];

  try {
    for (const row of rows) {
      const existing = await findTierIdByName(db, row.name);
      if (existing !== null) continue;
      await db.run(sql`
        INSERT INTO \`goal_risk_tiers\` (
          \`name\`, \`tier\`, \`max_budget_impact_dollars\`,
          \`requires_approval\`, \`auto_execute\`, \`description\`
        ) VALUES (
          ${row.name}, ${row.tier}, ${null}, ${1}, ${0}, ${row.description}
        );
      `);
      const newId = await findTierIdByName(db, row.name);
      if (newId === null) continue;
      await db.run(sql`
        INSERT INTO \`goal_risk_tiers_allowed_action_types\` (
          \`_order\`, \`_parent_id\`, \`id\`, \`action_type\`
        ) VALUES (${1}, ${newId}, ${newId * 1000 + 1}, ${row.actionType});
      `);
    }
  } catch {
    // Table may not exist on partially migrated local DBs; the base risk-tier
    // migration creates it and this seed is safe to rerun later.
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {}
