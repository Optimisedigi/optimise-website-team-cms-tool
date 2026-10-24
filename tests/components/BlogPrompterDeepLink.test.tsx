import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BlogPrompterPage from "@/components/BlogPrompterPage";

// VoiceField pulls in browser speech APIs; a plain textarea is enough here.
vi.mock("@/components/VoiceField", () => ({
  default: ({ value, onChange, placeholder, ariaLabel }: { value: string; onChange: (v: string) => void; placeholder?: string; ariaLabel?: string }) => (
    <textarea aria-label={ariaLabel ?? placeholder ?? "field"} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
import { briefHref } from "@/lib/content-map/paths";

const brief = {
  id: 7, client: 1, blogIdea: "Should you bid on your own brand name in Google Ads?", titleIdea: "Should you bid on your own brand name in Google Ads?",
  category: "", tag: "", mainPoint: "", keyPoints: "", primaryKeywords: "", secondaryKeywords: "", pointsToAvoid: "", targetAudience: "", supportingContent: "", generatedPrompt: "",
  source: "content-map", workflowStatus: "idea_phase",
};

function mockFetch() {
  const f = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.startsWith("/api/clients/list")) return new Response(JSON.stringify([{ id: 1, name: "Optimise Digital", blogCategories: "", blogTags: "", servicePages: "", blogTone: "" }]));
    if (u.startsWith("/api/blog-settings")) return new Response(JSON.stringify({ globalBlogRules: "", globalMarkdownRules: "" }));
    if (u.startsWith("/api/blog-prompts/7")) return new Response(JSON.stringify(brief));
    if (u.startsWith("/api/blog-prompts?clientId=1")) return new Response(JSON.stringify({ docs: [brief] }));
    if (u.startsWith("/api/blog-ideas")) return new Response(JSON.stringify({ docs: [] }));
    return new Response("{}");
  });
  vi.stubGlobal("fetch", f);
  return f;
}

afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

describe("Blog Prompter deep link", () => {
  it("builds /admin/blog/prompter?brief=&client= links", () => {
    expect(briefHref("7", "1")).toBe("/admin/blog/prompter?brief=7&client=1");
    expect(briefHref("7")).toBe("/admin/blog/prompter?brief=7");
  });

  it("?client=&brief= selects the client and opens that brief", async () => {
    window.history.replaceState(null, "", "/admin/blog/prompter?brief=7&client=1");
    const f = mockFetch();
    Element.prototype.scrollIntoView = vi.fn();
    render(<BlogPrompterPage />);
    await waitFor(() => expect(f).toHaveBeenCalledWith("/api/blog-prompts?clientId=1"));
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    expect(screen.getAllByText(/Should you bid on your own brand name in Google Ads\?/).length).toBeGreaterThan(0);
  });

  it("?brief= alone looks up the brief's client first", async () => {
    window.history.replaceState(null, "", "/admin/blog/prompter?brief=7");
    const f = mockFetch();
    render(<BlogPrompterPage />);
    await waitFor(() => expect(f).toHaveBeenCalledWith("/api/blog-prompts/7?depth=0"));
    await waitFor(() => expect(f).toHaveBeenCalledWith("/api/blog-prompts?clientId=1"));
  });
});
