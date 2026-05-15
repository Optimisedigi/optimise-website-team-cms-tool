import { describe, expect, it } from "vitest";
import { parseTierTable } from "../../src/lib/tier-table";

describe("parseTierTable", () => {
  it("returns null for empty or whitespace input", () => {
    expect(parseTierTable("")).toBeNull();
    expect(parseTierTable("   \n  \n\t")).toBeNull();
    expect(parseTierTable(null)).toBeNull();
    expect(parseTierTable(undefined)).toBeNull();
  });

  it("returns null when only headers are present (no body rows)", () => {
    expect(parseTierTable("Spend\tRetainer")).toBeNull();
  });

  it("parses tab-separated headers and rows", () => {
    const input = [
      "Spend\tRetainer",
      "Up to $60,000\t$4,800 (base)",
      "$60,001 – $80,000\t$5,520",
    ].join("\n");
    expect(parseTierTable(input)).toEqual({
      headers: ["Spend", "Retainer"],
      rows: [
        ["Up to $60,000", "$4,800 (base)"],
        ["$60,001 – $80,000", "$5,520"],
      ],
    });
  });

  it("parses multi-space-separated cells as a fallback for PDF-style paste", () => {
    const input = ["Spend   Retainer", "Up to $60,000   $4,800"].join("\n");
    expect(parseTierTable(input)).toEqual({
      headers: ["Spend", "Retainer"],
      rows: [["Up to $60,000", "$4,800"]],
    });
  });

  it("preserves single spaces inside cells", () => {
    const input = ["Trailing 3-month spend\tMonthly retainer", "Up to $60,000\t$4,800 (base)"].join(
      "\n",
    );
    expect(parseTierTable(input)).toEqual({
      headers: ["Trailing 3-month spend", "Monthly retainer"],
      rows: [["Up to $60,000", "$4,800 (base)"]],
    });
  });

  it("normalises Windows CRLF line endings", () => {
    const input = "A\tB\r\n1\t2\r\n3\t4";
    expect(parseTierTable(input)).toEqual({
      headers: ["A", "B"],
      rows: [
        ["1", "2"],
        ["3", "4"],
      ],
    });
  });

  it("skips blank lines between rows", () => {
    const input = "A\tB\n\n1\t2\n   \n3\t4";
    expect(parseTierTable(input)).toEqual({
      headers: ["A", "B"],
      rows: [
        ["1", "2"],
        ["3", "4"],
      ],
    });
  });

  it("pads short rows with empty cells to match header column count", () => {
    const input = "A\tB\tC\n1\t2";
    expect(parseTierTable(input)).toEqual({
      headers: ["A", "B", "C"],
      rows: [["1", "2", ""]],
    });
  });

  it("truncates over-long rows to header column count", () => {
    const input = "A\tB\n1\t2\t3\t4";
    expect(parseTierTable(input)).toEqual({
      headers: ["A", "B"],
      rows: [["1", "2"]],
    });
  });

  it("supports three-column tables (e.g. GBP / USD currency variants)", () => {
    const input = [
      "Spend\tRetainer (AUD)\tRetainer (USD)",
      "Up to $60k\t$4,800\t$3,150",
      "$60k–$80k\t$5,520\t$3,620",
    ].join("\n");
    expect(parseTierTable(input)).toEqual({
      headers: ["Spend", "Retainer (AUD)", "Retainer (USD)"],
      rows: [
        ["Up to $60k", "$4,800", "$3,150"],
        ["$60k–$80k", "$5,520", "$3,620"],
      ],
    });
  });
});
