vi.mock("@payloadcms/richtext-lexical", () => ({
  lexicalEditor: vi.fn((config) => ({
    _type: "lexical-editor",
    _config: config,
  })),
  TextStateFeature: vi.fn((opts) => ({
    _type: "text-state-feature",
    _opts: opts,
  })),
}));

import { proposalEditor } from "@/lib/proposalEditor";
import { lexicalEditor, TextStateFeature } from "@payloadcms/richtext-lexical";

const mockLexicalEditor = vi.mocked(lexicalEditor);
const mockTextStateFeature = vi.mocked(TextStateFeature);

describe("proposalEditor", () => {
  it("calls lexicalEditor to create the editor", () => {
    expect(mockLexicalEditor).toHaveBeenCalledOnce();
  });

  it("returns the result of lexicalEditor()", () => {
    expect(proposalEditor).toEqual(
      expect.objectContaining({ _type: "lexical-editor" }),
    );
  });

  it("passes a features function to lexicalEditor", () => {
    const config = mockLexicalEditor.mock.calls[0][0] as any;
    expect(typeof config.features).toBe("function");
  });

  it("features function includes default features plus TextStateFeature", () => {
    const config = mockLexicalEditor.mock.calls[0][0] as any;
    const defaultFeatures = ["bold-feature", "italic-feature"];
    const result = config.features({ defaultFeatures });

    // Should spread defaultFeatures and add TextStateFeature result
    expect(result).toHaveLength(defaultFeatures.length + 1);
    expect(result[0]).toBe("bold-feature");
    expect(result[1]).toBe("italic-feature");
  });

  it("calls TextStateFeature with fontSize state config", () => {
    expect(mockTextStateFeature).toHaveBeenCalledOnce();

    const opts = mockTextStateFeature.mock.calls[0][0] as any;
    expect(opts.state).toHaveProperty("fontSize");
  });

  it("defines five font size options", () => {
    const opts = mockTextStateFeature.mock.calls[0][0] as any;
    const fontSizes = opts.state.fontSize;
    const keys = Object.keys(fontSizes);

    expect(keys).toHaveLength(5);
    expect(keys).toEqual(["size-sm", "size-base", "size-lg", "size-xl", "size-2xl"]);
  });

  it("each font size has a label and css property", () => {
    const opts = mockTextStateFeature.mock.calls[0][0] as any;
    const fontSizes = opts.state.fontSize;

    for (const key of Object.keys(fontSizes)) {
      expect(fontSizes[key]).toHaveProperty("label");
      expect(fontSizes[key]).toHaveProperty("css");
      expect(typeof fontSizes[key].label).toBe("string");
      expect(fontSizes[key].css).toHaveProperty("font-size");
    }
  });

  it("size-sm maps to 14px", () => {
    const opts = mockTextStateFeature.mock.calls[0][0] as any;
    expect(opts.state.fontSize["size-sm"].css["font-size"]).toBe("14px");
    expect(opts.state.fontSize["size-sm"].label).toContain("14px");
  });

  it("size-base maps to 16px", () => {
    const opts = mockTextStateFeature.mock.calls[0][0] as any;
    expect(opts.state.fontSize["size-base"].css["font-size"]).toBe("16px");
  });

  it("size-lg maps to 20px", () => {
    const opts = mockTextStateFeature.mock.calls[0][0] as any;
    expect(opts.state.fontSize["size-lg"].css["font-size"]).toBe("20px");
  });

  it("size-xl maps to 24px", () => {
    const opts = mockTextStateFeature.mock.calls[0][0] as any;
    expect(opts.state.fontSize["size-xl"].css["font-size"]).toBe("24px");
  });

  it("size-2xl maps to 32px", () => {
    const opts = mockTextStateFeature.mock.calls[0][0] as any;
    expect(opts.state.fontSize["size-2xl"].css["font-size"]).toBe("32px");
  });
});
