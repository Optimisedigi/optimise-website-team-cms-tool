import { describe, expect, it } from "vitest";
import { markdownLiteToHtml, renderDraftTableIfPresent } from "@/lib/email-draft-markdown";

describe("Gmail draft tables", () => {
  it("renders a screenshot transcription inside the email with styled header and escaped cells", () => {
    const html = markdownLiteToHtml("Hi Sam,\n\n| Item | Total |\n| --- | --- |\n| A <script> | £12 & tax |\n| B | **£15** |\n\nPlease review.");
    expect(html).toContain("<p>Hi Sam,</p>");
    expect(html).toContain('<table style="border-collapse:collapse;border:1px solid #000;');
    expect(html).toContain('background-color:#dbeafe');
    expect(html).toContain('<th scope="col" style="border:1px solid #000;background-color:#dbeafe;color:#000;font-weight:700;');
    expect(html).toContain('A &lt;script&gt;');
    expect(html).toContain('£12 &amp; tax');
    expect(html).toContain('<strong>£15</strong>');
    expect(html).toContain("<p>Please review.</p>");
    expect(html).not.toContain("<script>");
  });

  it("does not interpret pipes without a valid table separator or equal column counts", () => {
    const html = markdownLiteToHtml("A | B\n| -- | -- |\nnot a table");
    expect(html).not.toContain("<table");
    expect(markdownLiteToHtml("| A | B |\n| --- |\n| 1 | 2 |")).not.toContain("<table");
  });

  it("keeps surrounding HTML while converting a requested table", () => {
    const input = '<p>Hello</p>\n| Item | Value |\n| --- | --- |\n| Sales \\| VAT | £12 |\n<br>Thank you';
    const html = renderDraftTableIfPresent(input);
    expect(html).toContain('<p>Hello</p>');
    expect(html).toContain('<br>Thank you');
    expect(html).toContain('background-color:#dbeafe;color:#000;font-weight:700;');
    expect(html).toContain('Sales | VAT');
    expect(html).toContain('<td style="border:1px solid #000;padding:6px 10px;color:#000;">£12</td>');
    expect(html).not.toContain('Sales \\| VAT');
  });

  it("keeps escaped pipes in a cell rather than splitting the row", () => {
    const html = markdownLiteToHtml('| Label | Amount |\n| --- | --- |\n| East \\| West | £20 |');
    expect(html).toContain('East | West');
    expect(html).toContain('£20</td>');
    expect(html).not.toContain('<p>| East');
  });

  it("converts direct-tool text tables but preserves canonical report HTML", () => {
    expect(renderDraftTableIfPresent("| A | B |\n| --- | --- |\n| <script> | 2 |")).toContain("&lt;script&gt;");
    const report = '<div style="color:red">Report</div><table><tr><td>1</td></tr></table>';
    expect(renderDraftTableIfPresent(report)).toBe(report);
  });
});
