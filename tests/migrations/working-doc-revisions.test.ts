import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { describe, expect, it } from "vitest";

import {
  up,
  workingDocContentHash,
} from "@/migrations/20260809_120000_add_working_doc_revisions";

describe("working document revision migration", () => {
  it("preserves canonical Markdown exactly and seeds revision 1 with the same hash", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "working-doc-migration-"));
    const client = createClient({ url: `file:${path.join(directory, "migration.db")}` });
    const db = drizzle(client);
    await client.executeMultiple(`
      CREATE TABLE shared_working_docs (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        slug text NOT NULL,
        title text NOT NULL,
        client_slug text NOT NULL,
        deck_slug text NOT NULL,
        content_markdown text NOT NULL,
        last_edited_by text,
        last_saved_at text,
        updated_at text,
        created_at text
      );
    `);
    const exactContent = "# Exact\n\nTrailing spaces stay.  \n";
    await client.execute({
      sql: `INSERT INTO shared_working_docs
        (slug, title, client_slug, deck_slug, content_markdown, last_edited_by, last_saved_at, updated_at, created_at)
        VALUES (?, 'Title', 'cipher', 'doc', ?, 'Editor', '2026-07-20T01:00:00.000Z', '2026-07-20T01:00:00.000Z', '2026-07-20T01:00:00.000Z')`,
      args: ["cipher/doc", exactContent],
    });

    await up({ db } as unknown as Parameters<typeof up>[0]);

    const canonical = await client.execute(
      "SELECT content_markdown, revision FROM shared_working_docs LIMIT 1",
    );
    const snapshot = await client.execute(
      "SELECT content_markdown, content_hash, revision, source FROM shared_working_doc_revisions LIMIT 1",
    );
    expect(canonical.rows[0]).toMatchObject({ content_markdown: exactContent, revision: 1 });
    expect(snapshot.rows[0]).toMatchObject({
      content_markdown: exactContent,
      content_hash: workingDocContentHash(exactContent),
      revision: 1,
      source: "migration-seed",
    });
    client.close();
    await rm(directory, { recursive: true, force: true });
  });
});
