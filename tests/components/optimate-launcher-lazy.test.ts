import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The launcher is mounted on every admin page. The chats it opens are most of
 * OptiMate's code (about 800 KB), so they must stay lazily loaded: a static
 * import would put them back into every admin page's JavaScript.
 */
describe("OptiMateLauncher keeps its chats out of every admin page", () => {
  it("imports the chat components only lazily", () => {
    const source = readFileSync("src/components/OptiMateLauncher.tsx", "utf8");
    for (const chat of ["OptiMateMultiChat", "InvoiceAssistantChat", "GmailReplyChat", "TaskMateChat", "AdminMateChat", "ContentMateChat"]) {
      expect(source).not.toMatch(new RegExp(`^import (?!type)[^\\n]*from ['"]\\./${chat}['"]`, "m"));
      expect(source).toContain(`import('./${chat}')`);
    }
  });
});

describe("admin components stay free of Node-only modules", () => {
  it("HostingSubscriptionField does not import hosting-billing (it pulls a browser crypto polyfill into every admin page)", () => {
    const source = readFileSync("src/components/HostingSubscriptionField.tsx", "utf8");
    expect(source).not.toMatch(/from ['"]@\/lib\/hosting-billing['"]/);
  });
});

describe("the audit chat field loads OptiMate only when it renders", () => {
  it("GoogleAdsChat imports OptiMateChatCore lazily", () => {
    const source = readFileSync("src/components/GoogleAdsChat.tsx", "utf8");
    expect(source).not.toMatch(/^import (?!type)[^\n]*from ['"]\.\/OptiMateChatCore['"]/m);
    expect(source).toContain("import('./OptiMateChatCore')");
  });
});
