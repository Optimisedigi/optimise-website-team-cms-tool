import { describe, expect, it } from "vitest";
import { attributeChannel } from "@/lib/lead-channel";

describe("attributeChannel", () => {
  it("tags ChatGPT referrers as AI chat", () => {
    expect(
      attributeChannel({ referrerUrl: "https://chatgpt.com/" }).channel,
    ).toBe("ai_chat");
    expect(
      attributeChannel({ referrerUrl: "https://chat.openai.com/c/abc" }).channel,
    ).toBe("ai_chat");
  });

  it("tags Gemini before organic Google search", () => {
    expect(
      attributeChannel({ referrerUrl: "https://gemini.google.com/app" }).channel,
    ).toBe("ai_chat");
    expect(
      attributeChannel({ referrerUrl: "https://www.google.com/search?q=od" }).channel,
    ).toBe("organic_search");
  });

  it("does not treat chatgpt.com in a query string as AI chat", () => {
    expect(
      attributeChannel({
        referrerUrl: "https://example.com/?utm_source=chatgpt.com",
      }).channel,
    ).toBe("website_other");
  });

  it("tags known AI UTM sources as AI chat", () => {
    expect(attributeChannel({ utmSource: "chatgpt" }).channel).toBe("ai_chat");
    expect(attributeChannel({ utmSource: "perplexity" }).channel).toBe("ai_chat");
  });

  it("tags the contact-form ChatGPT or AI answer as AI chat", () => {
    expect(attributeChannel({ heardAbout: "chatgpt-or-ai" }).channel).toBe("ai_chat");
  });

  it("keeps paid search ahead of an AI referrer when gclid is present", () => {
    expect(
      attributeChannel({
        gclid: "abc123",
        referrerUrl: "https://chatgpt.com/",
      }).channel,
    ).toBe("paid_search");
  });
});
