import { describe, expect, it, vi } from "vitest";
import { up } from "@/migrations/20260802_120000_add_search_target_languages";

function statementText(statement: unknown): string {
  const chunks = (statement as { queryChunks?: unknown[] })?.queryChunks ?? [];
  return chunks.map((chunk) => {
    if (typeof chunk === "string") return chunk;
    const value = (chunk as { value?: unknown })?.value;
    return Array.isArray(value) ? value.join("") : String(value ?? "");
  }).join("");
}

describe("search-target language migration", () => {
  it("adds nullable language snapshots and normalizes both Vietnam spellings", async () => {
    const statements: string[] = [];
    const db = {
      run: vi.fn(async (statement: unknown) => {
        statements.push(statementText(statement));
      }),
    };

    await up({ db } as never);

    expect(statements.join("\n")).toContain("client_proposals` ADD `search_language` text");
    expect(statements.join("\n")).toContain("seo_audit_proposals` ADD `search_language` text");
    expect(statements.join("\n")).toContain("proposal_search_language");
    expect(statements.join("\n")).toContain("'vietnam', 'viet nam'");
    expect(statements.join("\n")).not.toContain("target_location` = 'us'");
  });
});
