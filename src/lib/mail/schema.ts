/**
 * Additive SQL for the Mail view (2026-10-14): four new tables, no change to
 * any existing table (the collections set lockDocuments: false, so Payload
 * expects no payload_locked_documents_rels columns). Matches Payload's own
 * pushed schema for these collections. Shared by runMigrations()
 * and src/migrations/20261014_150000_mail_client_emails.ts.
 * Every statement is idempotent or fails with "duplicate column"/"already exists".
 */
const ts = "text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL";

function stamps(table: string): Array<[string, string]> {
  return [
    [`${table}_updated_at_idx`, `CREATE INDEX IF NOT EXISTS \`${table}_updated_at_idx\` ON \`${table}\` (\`updated_at\`)`],
    [`${table}_created_at_idx`, `CREATE INDEX IF NOT EXISTS \`${table}_created_at_idx\` ON \`${table}\` (\`created_at\`)`],
  ];
}

function index(table: string, column: string, field: string, unique = false): [string, string] {
  const name = `${table}_${field}_idx`;
  return [name, `CREATE ${unique ? "UNIQUE " : ""}INDEX IF NOT EXISTS \`${name}\` ON \`${table}\` (\`${column}\`)`];
}

/**
 * Emails composed in the Mail view to be sent later (2026-10-19). Gmail's API
 * has no scheduled send, so the CMS keeps the email (body, inline images and
 * attachments as JSON in `content`) and a cron sends it when `scheduled_for`
 * passes. Additive; shared with src/migrations/20261019_120000_scheduled_emails.ts.
 */
export const SCHEDULED_EMAILS_SCHEMA: Array<[string, string]> = [
  ["scheduled_emails", `CREATE TABLE IF NOT EXISTS \`scheduled_emails\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`owner_id\` integer NOT NULL,
    \`status\` text DEFAULT 'pending' NOT NULL,
    \`scheduled_for\` text NOT NULL,
    \`to\` text,
    \`cc\` text,
    \`subject\` text,
    \`reply_to_message_id\` text,
    \`content\` text,
    \`attempts\` numeric DEFAULT 0,
    \`last_error\` text,
    \`sent_at\` text,
    \`sent_message_id\` text,
    \`updated_at\` ${ts},
    \`created_at\` ${ts},
    FOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`],
  index("scheduled_emails", "owner_id", "owner"),
  index("scheduled_emails", "status", "status"),
  index("scheduled_emails", "scheduled_for", "scheduled_for"),
  ...stamps("scheduled_emails"),
];

/**
 * Mail AI requests that opted in to client data (2026-10-21) record which
 * client's CMS facts were sent to the model. Additive; shared with
 * src/migrations/20261021_120000_mail_ai_client_and_follow_ups.ts.
 */
export const MAIL_AI_CLIENT_SCHEMA: Array<[string, string]> = [
  ["mail_ai_requests.client_id", "ALTER TABLE `mail_ai_requests` ADD `client_id` integer REFERENCES clients(id)"],
  index("mail_ai_requests", "client_id", "client"),
];

/**
 * Follow-up reminders (2026-10-21): sent emails the user wants a nudge on if
 * nobody replies. A cron checks the Gmail thread and raises one notification
 * when `remind_at` passes. Additive; shared with
 * src/migrations/20261021_120000_mail_ai_client_and_follow_ups.ts.
 */
export const FOLLOW_UPS_SCHEMA: Array<[string, string]> = [
  ["mail_follow_ups", `CREATE TABLE IF NOT EXISTS \`mail_follow_ups\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`owner_id\` integer NOT NULL,
    \`client_id\` integer,
    \`gmail_thread_id\` text,
    \`sent_message_id\` text,
    \`to\` text,
    \`subject\` text,
    \`sent_at\` text,
    \`remind_at\` text,
    \`status\` text DEFAULT 'waiting',
    \`notified_at\` text,
    \`last_checked_at\` text,
    \`updated_at\` ${ts},
    \`created_at\` ${ts},
    FOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`],
  index("mail_follow_ups", "owner_id", "owner"),
  index("mail_follow_ups", "client_id", "client"),
  index("mail_follow_ups", "gmail_thread_id", "gmail_thread_id"),
  index("mail_follow_ups", "sent_message_id", "sent_message_id", true),
  index("mail_follow_ups", "remind_at", "remind_at"),
  index("mail_follow_ups", "status", "status"),
  ...stamps("mail_follow_ups"),
];

/**
 * Extra Gmail accounts (2026-10-22): each Mail user can connect more Gmail
 * addresses besides the one on their user record, and switch between them in
 * the Mail breadcrumb. Tokens and each account's own sync cursor live here.
 * Scheduled emails and follow-up reminders record which account they belong
 * to ('' or NULL = the user's main Gmail). Additive; shared with
 * src/migrations/20261022_120000_mail_accounts.ts.
 */
export const MAIL_ACCOUNTS_SCHEMA: Array<[string, string]> = [
  ["mail_accounts", `CREATE TABLE IF NOT EXISTS \`mail_accounts\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`owner_id\` integer NOT NULL,
    \`email\` text NOT NULL,
    \`access_token\` text,
    \`refresh_token\` text,
    \`token_expiry\` text,
    \`history_id\` text,
    \`last_sync_at\` text,
    \`last_error\` text,
    \`updated_at\` ${ts},
    \`created_at\` ${ts},
    FOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`],
  index("mail_accounts", "owner_id", "owner"),
  index("mail_accounts", "email", "email"),
  ...stamps("mail_accounts"),
];

/** Which Gmail account a scheduled email sends from (2026-10-22, see MAIL_ACCOUNTS_SCHEMA). */
export const SCHEDULED_EMAILS_ACCOUNT_SCHEMA: Array<[string, string]> = [
  ["scheduled_emails.account", "ALTER TABLE `scheduled_emails` ADD `account` text"],
];

/** Which Gmail account a follow-up reminder's email was sent from (2026-10-22). */
export const FOLLOW_UPS_ACCOUNT_SCHEMA: Array<[string, string]> = [
  ["mail_follow_ups.account", "ALTER TABLE `mail_follow_ups` ADD `account` text"],
];

export const MAIL_SCHEMA: Array<[string, string]> = [
  ["client_emails", `CREATE TABLE IF NOT EXISTS \`client_emails\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`gmail_message_id\` text NOT NULL,
    \`gmail_thread_id\` text NOT NULL,
    \`client_id\` integer NOT NULL,
    \`owner_id\` integer,
    \`direction\` text DEFAULT 'inbound',
    \`matched_by\` text DEFAULT 'auto',
    \`matched_on\` text,
    \`from\` text,
    \`to\` text,
    \`cc\` text,
    \`subject\` text,
    \`date\` text,
    \`body\` text,
    \`gmail_link\` text,
    \`updated_at\` ${ts},
    \`created_at\` ${ts},
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`],
  index("client_emails", "gmail_message_id", "gmail_message_id", true),
  index("client_emails", "gmail_thread_id", "gmail_thread_id"),
  index("client_emails", "client_id", "client"),
  index("client_emails", "owner_id", "owner"),
  index("client_emails", "date", "date"),
  ...stamps("client_emails"),

  ["client_email_summaries", `CREATE TABLE IF NOT EXISTS \`client_email_summaries\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`client_id\` integer NOT NULL,
    \`email_id\` integer NOT NULL,
    \`owner_id\` integer,
    \`summary\` text NOT NULL,
    \`email_date\` text,
    \`model\` text,
    \`updated_at\` ${ts},
    \`created_at\` ${ts},
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`email_id\`) REFERENCES \`client_emails\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`],
  index("client_email_summaries", "client_id", "client"),
  index("client_email_summaries", "email_id", "email"),
  index("client_email_summaries", "owner_id", "owner"),
  index("client_email_summaries", "email_date", "email_date"),
  ...stamps("client_email_summaries"),

  ["mail_ai_requests", `CREATE TABLE IF NOT EXISTS \`mail_ai_requests\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`user_id\` integer,
    \`action\` text NOT NULL,
    \`gmail_message_id\` text,
    \`email_count\` numeric NOT NULL,
    \`model\` text,
    \`status\` text DEFAULT 'ok',
    \`error\` text,
    \`updated_at\` ${ts},
    \`created_at\` ${ts},
    FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`],
  index("mail_ai_requests", "user_id", "user"),
  index("mail_ai_requests", "gmail_message_id", "gmail_message_id"),
  ...stamps("mail_ai_requests"),

  ["mail_sync_states", `CREATE TABLE IF NOT EXISTS \`mail_sync_states\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`user_id\` integer NOT NULL,
    \`gmail_address\` text,
    \`history_id\` text,
    \`last_sync_at\` text,
    \`last_error\` text,
    \`updated_at\` ${ts},
    \`created_at\` ${ts},
    FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`],
  index("mail_sync_states", "user_id", "user", true),
  ...stamps("mail_sync_states"),

  ...SCHEDULED_EMAILS_SCHEMA,
  ...MAIL_AI_CLIENT_SCHEMA,
  ...FOLLOW_UPS_SCHEMA,
  ...MAIL_ACCOUNTS_SCHEMA,
  ...SCHEDULED_EMAILS_ACCOUNT_SCHEMA,
  ...FOLLOW_UPS_ACCOUNT_SCHEMA,
];
