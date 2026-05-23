import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Creates the `goal_risk_tiers` collection table + its
 * `goal_risk_tiers_allowed_action_types` sub-table (Payload's standard array
 * child-table convention), then seeds two Yellow-tier rows so the Account
 * Efficiency goal agent's `budget-update` + `budget-push-live` proposals
 * route through `checkRiskTier` correctly on first ship.
 *
 * Yellow tier in this build: `requiresApproval = true`, `autoExecute = false`.
 * The agent always queues these proposals for human approval. The
 * `maxBudgetImpactDollars` cap of $500 is a defence-in-depth ceiling \u2014 even
 * once the team enables `autoExecute: true`, any single goal-run iteration
 * with a total absolute budget shift over $500 will still escalate.
 *
 * All inserts are idempotent: skip when a row with the same `name` exists.
 * Safe to re-run on dev DBs where `payload migrate:fresh` may have already
 * pushed the table.
 *
 * @see src/collections/GoalRiskTiers.ts \u2014 collection config (slug, fields)
 * @see src/lib/goal-agents/check-risk-tier.ts \u2014 the consumer
 */

interface SqlRow<T = unknown> {
  rows: T[];
}

async function tableExists(db: MigrateUpArgs["db"], name: string): Promise<boolean> {
  const result = (await db.run(
    sql`SELECT name FROM sqlite_master WHERE type='table' AND name=${name};`,
  )) as unknown as SqlRow<{ name: string }>;
  return Array.isArray(result.rows) && result.rows.length > 0;
}

async function findTierIdByName(
  db: MigrateUpArgs["db"],
  name: string,
): Promise<number | null> {
  const result = (await db.run(
    sql`SELECT id FROM \`goal_risk_tiers\` WHERE name = ${name} LIMIT 1;`,
  )) as unknown as SqlRow<{ id: number }>;
  const row = Array.isArray(result.rows) ? result.rows[0] : undefined;
  return row && typeof row.id === "number" ? row.id : null;
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── 1. Create the parent table ─────────────────────────────────────────
  // Idempotent via IF NOT EXISTS \u2014 Payload's dev autosync may have already
  // pushed this table on developer machines; production DBs see the bare
  // CREATE statement.
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`goal_risk_tiers\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`name\` text NOT NULL,
      \`tier\` text NOT NULL,
      \`max_budget_impact_dollars\` real,
      \`requires_approval\` integer DEFAULT true,
      \`auto_execute\` integer DEFAULT false,
      \`description\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
    );
  `);

  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`goal_risk_tiers_tier_idx\` ON \`goal_risk_tiers\` (\`tier\`);`,
  );

  // ── 2. Create the array sub-table for allowedActionTypes ───────────────
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`goal_risk_tiers_allowed_action_types\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` integer PRIMARY KEY NOT NULL,
      \`action_type\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`goal_risk_tiers\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );
  `);

  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`goal_risk_tiers_allowed_action_types_order_idx\` ON \`goal_risk_tiers_allowed_action_types\` (\`_order\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`goal_risk_tiers_allowed_action_types_parent_idx\` ON \`goal_risk_tiers_allowed_action_types\` (\`_parent_id\`);`,
  );

  // ── 3. Wire payload_locked_documents_rels (best-effort) ────────────────
  // Required so the admin lock UI doesn't crash when the new collection
  // gets its first row. Try/catch because the column may already exist.
  try {
    await db.run(
      sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`goal_risk_tiers_id\` integer;`,
    );
  } catch {
    // Column already exists.
  }

  // ── 4. Seed Yellow-tier rows ───────────────────────────────────────────
  // Done only if (a) the table is real and (b) the named row doesn't exist.
  // We guard with table-existence because a hostile autosync state could
  // leave the table half-created on dev machines; we don't want to throw.
  if (!(await tableExists(db, "goal_risk_tiers"))) return;

  const rows: Array<{
    name: string;
    description: string;
    actionType: string;
  }> = [
    {
      name: "Yellow \u2014 Account Efficiency budget-update",
      description:
        "Yellow tier for Account Efficiency agent budget allocation saves. Requires approval. maxBudgetImpactDollars of $500 caps the total absolute budget shift per goal-run iteration.",
      actionType: "budget-update",
    },
    {
      name: "Yellow \u2014 Account Efficiency budget-push-live",
      description:
        "Yellow tier for pushing the approved Account Efficiency budget changes to Google Ads. Requires approval. maxBudgetImpactDollars of $500.",
      actionType: "budget-push-live",
    },
  ];

  for (const row of rows) {
    const existing = await findTierIdByName(db, row.name);
    if (existing !== null) continue;

    await db.run(sql`
      INSERT INTO \`goal_risk_tiers\` (
        \`name\`, \`tier\`, \`max_budget_impact_dollars\`,
        \`requires_approval\`, \`auto_execute\`, \`description\`
      ) VALUES (
        ${row.name}, ${"yellow"}, ${500},
        ${1}, ${0}, ${row.description}
      );
    `);

    const newId = await findTierIdByName(db, row.name);
    if (newId === null) {
      // Defensive: if the insert silently no-op'd, skip the child row.
      continue;
    }

    await db.run(sql`
      INSERT INTO \`goal_risk_tiers_allowed_action_types\` (
        \`_order\`, \`_parent_id\`, \`id\`, \`action_type\`
      ) VALUES (
        ${1}, ${newId},
        ${newId * 1000 + 1},
        ${row.actionType}
      );
    `);
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // No-op: matches the convention used by recent migrations in this repo.
  // Dropping the goal_risk_tiers table on rollback would orphan the
  // collection config and break the admin UI.
}
