import { createServerFeature } from "@payloadcms/richtext-lexical";

/**
 * Server feature that registers a client-side plugin to handle
 * pasting markdown-style lists (- item, 1. item) into the Lexical editor.
 */
export const MarkdownPasteFeature = createServerFeature({
  key: "markdownPaste",
  feature: {
    ClientFeature: "./components/MarkdownPasteFeatureClient#MarkdownPasteFeatureClient",
  },
});
