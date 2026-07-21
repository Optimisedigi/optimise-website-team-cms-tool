import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  hashWorkingDocContent,
  loadWorkingDoc,
  saveWorkingDoc,
  WorkingDocValidationError,
} from "@/lib/working-doc-sync";

let directory = "";
let databaseUrl = "";
let client: Client;

async function createSchema(target: Client) {
  await target.executeMultiple(`
    CREATE TABLE shared_working_docs (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      slug text NOT NULL UNIQUE,
      title text NOT NULL,
      client_slug text NOT NULL,
      deck_slug text NOT NULL,
      content_markdown text NOT NULL,
      revision integer NOT NULL DEFAULT 1,
      last_edited_by text,
      last_saved_at text,
      updated_at text,
      created_at text
    );
    CREATE TABLE shared_working_docs_change_log (
      _order integer NOT NULL,
      _parent_id integer NOT NULL,
      id text PRIMARY KEY NOT NULL,
      saved_at text NOT NULL,
      saved_by text,
      summary text
    );
    CREATE TABLE shared_working_doc_revisions (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      working_doc_id integer NOT NULL,
      revision integer NOT NULL,
      content_markdown text NOT NULL,
      content_hash text NOT NULL,
      saved_by text NOT NULL,
      saved_at text NOT NULL,
      source text NOT NULL,
      updated_at text NOT NULL,
      created_at text NOT NULL
    );
    CREATE UNIQUE INDEX shared_working_doc_revisions_doc_revision_idx
      ON shared_working_doc_revisions (working_doc_id, revision);
  `);
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "working-doc-sync-"));
  databaseUrl = `file:${path.join(directory, "sync.db")}`;
  client = createClient({ url: databaseUrl });
  await createSchema(client);
  await loadWorkingDoc({
    slug: "cipher/patient-journey-review",
    seed: {
      title: "Patient journey",
      clientSlug: "cipher",
      deckSlug: "patient-journey-review",
      contentMarkdown: "# Original\n",
    },
    client,
  });
});

afterEach(async () => {
  client.close();
  await rm(directory, { recursive: true, force: true });
});

describe("working document revision synchronization", () => {
  it("loads revision and a server SHA-256 hash", async () => {
    const loaded = await loadWorkingDoc({ slug: "cipher/patient-journey-review", client });
    expect(loaded.revision).toBe(1);
    expect(loaded.contentHash).toBe(hashWorkingDocContent("# Original\n"));
  });

  it("increments once and stores an immutable full snapshot", async () => {
    const saved = await saveWorkingDoc({
      slug: "cipher/patient-journey-review",
      contentMarkdown: "# Accepted\n",
      savedBy: "Alice",
      baseRevision: 1,
      localSubmissionId: "alice-1",
      source: "public-editor",
      client,
    });
    expect(saved.ok && saved.doc.revision).toBe(2);
    const snapshots = await client.execute(
      "SELECT revision, content_markdown, content_hash FROM shared_working_doc_revisions ORDER BY revision",
    );
    expect(snapshots.rows).toHaveLength(2);
    expect(snapshots.rows[1]).toMatchObject({
      revision: 2,
      content_markdown: "# Accepted\n",
      content_hash: hashWorkingDocContent("# Accepted\n"),
    });
  });

  it("allows exactly one of two saves from the same base revision", async () => {
    const secondClient = createClient({ url: databaseUrl });
    const [first, second] = await Promise.all([
      saveWorkingDoc({
        slug: "cipher/patient-journey-review",
        contentMarkdown: "# Browser A\n",
        savedBy: "A",
        baseRevision: 1,
        localSubmissionId: "submission-a",
        source: "public-editor",
        client,
      }),
      saveWorkingDoc({
        slug: "cipher/patient-journey-review",
        contentMarkdown: "# Browser B\n",
        savedBy: "B",
        baseRevision: 1,
        localSubmissionId: "submission-b",
        source: "cms-editor",
        client: secondClient,
      }),
    ]);
    secondClient.close();
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    const conflict = first.ok ? second : first;
    expect(conflict).toMatchObject({ ok: false, conflict: true });
    const loaded = await loadWorkingDoc({ slug: "cipher/patient-journey-review", client });
    expect(loaded.revision).toBe(2);
    expect(loaded.contentMarkdown).toBe(first.ok ? "# Browser A\n" : "# Browser B\n");
  });

  it("rejects a stale save without changing canonical content", async () => {
    await saveWorkingDoc({
      slug: "cipher/patient-journey-review",
      contentMarkdown: "# Current\n",
      savedBy: "Alice",
      baseRevision: 1,
      localSubmissionId: "first",
      source: "public-editor",
      client,
    });
    const stale = await saveWorkingDoc({
      slug: "cipher/patient-journey-review",
      contentMarkdown: "# Stale\n",
      savedBy: "Bob",
      baseRevision: 1,
      localSubmissionId: "stale-id",
      source: "cms-editor",
      client,
    });
    expect(stale).toMatchObject({ ok: false, localSubmissionId: "stale-id" });
    const loaded = await loadWorkingDoc({ slug: "cipher/patient-journey-review", client });
    expect(loaded.contentMarkdown).toBe("# Current\n");
  });

  it("gates the temporary legacy handoff and snapshots the accepted result", async () => {
    await expect(
      saveWorkingDoc({
        slug: "cipher/patient-journey-review",
        contentMarkdown: "# Legacy\n",
        savedBy: "Old tab",
        localSubmissionId: "legacy-disabled",
        source: "public-editor",
        legacyHandoffEnabled: false,
        client,
      }),
    ).rejects.toBeInstanceOf(WorkingDocValidationError);

    const accepted = await saveWorkingDoc({
      slug: "cipher/patient-journey-review",
      contentMarkdown: "# Legacy\n",
      savedBy: "Old tab",
      localSubmissionId: "legacy-enabled",
      source: "public-editor",
      legacyHandoffEnabled: true,
      client,
    });
    expect(accepted).toMatchObject({ ok: true, source: "legacy-handoff" });
  });
});
