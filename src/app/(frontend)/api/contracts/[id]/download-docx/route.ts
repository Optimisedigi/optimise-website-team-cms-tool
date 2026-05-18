import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  TableLayoutType,
  WidthType,
  AlignmentType,
  BorderStyle,
  ImageRun,
  HeadingLevel,
  PageBreak,
} from "docx";
import {
  formatCurrency,
  formatDate,
} from "@/lib/contract-template";
import { parseTierTable } from "@/lib/tier-table";
import { getPrimaryClientEmail } from "@/lib/contract-emails";
import fs from "fs";
import path from "path";

// A4 width in DXA (twips) minus margins: 11906 - 720*2 = 10466
const PAGE_WIDTH_DXA = 10466;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let doc: any;
  try {
    doc = await payload.findByID({
      collection: "contracts",
      id,
      overrideAccess: true,
    });
  } catch {
    return NextResponse.json(
      { error: "Contract not found" },
      { status: 404 },
    );
  }

  try {
    // Resolve agency signature to buffer for embedding
    const sigBuffer = await resolveMediaBuffer(payload, doc.agencySignature);

    const buffer = await generateContractDocx(doc, sigBuffer);

    const slug =
      doc.contractTitle
        ?.toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "contract";

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${slug}.docx"`,
      },
    });
  } catch (e: any) {
    console.error("[download-docx] Error:", e.message);
    return NextResponse.json(
      { error: `Failed to generate Word document: ${e.message}` },
      { status: 500 },
    );
  }
}

async function generateContractDocx(doc: any, sigBuffer: Buffer | null): Promise<Buffer> {
  const agencyName = "Optimise Digital Pty Ltd";
  const contactName = doc.agencyContactName || "Peter Tu";
  const contactEmail = doc.agencyContactEmail || "peter@optimisedigital.online";
  const contactPhone = doc.agencyContactPhone || "0493053188";

  const currency = (doc.currency ?? "AUD") as Parameters<typeof formatCurrency>[1];
  const setupAmount = formatCurrency(doc.setupFee ?? 0, currency);
  const retainerAmount = formatCurrency(doc.monthlyRetainer ?? 0, currency);

  const children: (Paragraph | Table)[] = [];

  // Logo (15% smaller than original 252 → 214)
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    const logoBuffer = fs.readFileSync(logoPath);
    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: logoBuffer,
            transformation: { width: 214, height: 43 },
            type: "png",
          }),
        ],
        spacing: { after: 300 },
      }),
    );
  } catch {
    // skip logo
  }

  // Thick rule
  children.push(thickRule());

  // Cover
  children.push(
    textPara("Contract Agreement", 26),
    textPara("Between", 26),
    textPara(agencyName, 30, true),
    textPara("And", 26),
    textPara(doc.clientName, 30, true),
  );

  children.push(thickRule());

  // This contract is between
  children.push(
    new Paragraph({
      children: [new TextRun({ text: "This contract is between:", bold: true, italics: true })],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Client: ", bold: true }),
        new TextRun({ text: doc.clientName }),
      ],
      spacing: { after: 100 },
    }),
  );

  // Client details
  if (doc.clientContactName || doc.clientTitle || doc.clientEmail) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Name: ", bold: true }),
          new TextRun({ text: `${doc.clientContactName || ""}    ` }),
          new TextRun({ text: "Title: ", bold: true }),
          new TextRun({ text: `${doc.clientTitle || ""}    ` }),
          new TextRun({ text: "Email: ", bold: true }),
          new TextRun({ text: getPrimaryClientEmail(doc.clientEmail) }),
        ],
        spacing: { after: 50 },
      }),
    );
  }
  if (doc.clientPhone || doc.clientWebsite) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Phone: ", bold: true }),
          new TextRun({ text: `${doc.clientPhone || ""}    ` }),
          new TextRun({ text: "Website: ", bold: true }),
          new TextRun({ text: doc.clientWebsite || "" }),
        ],
        spacing: { after: 200 },
      }),
    );
  }

  // Service Provider. Mirrors the PDF cover — Title sits next to Contact
  // Person so the agency side carries the same information as the client
  // side above. Falls back to agencySignerTitle since the agency contact
  // and the agency signer are the same person in practice.
  const agencyContactTitle = (doc.agencySignerTitle as string | undefined) || "";
  children.push(
    labelValuePara("Service Provider", agencyName),
    labelValuePara("Address", "72A Yelverton St, Sydenham NSW 2044"),
    new Paragraph({
      children: [
        new TextRun({ text: "Contact Person: ", bold: true }),
        new TextRun({ text: `${contactName}    ` }),
        new TextRun({ text: "Title: ", bold: true }),
        new TextRun({ text: agencyContactTitle }),
      ],
      spacing: { after: 50 },
    }),
    labelValuePara("Email", contactEmail),
    labelValuePara("Phone", contactPhone, 200),
  );

  // Effective date — hide "(to be confirmed)" qualifier when the toggle is on.
  {
    const effectiveDateRuns = [
      new TextRun({ text: "Effective Date: ", bold: true }),
      new TextRun({ text: doc.contractDate ? formatDate(doc.contractDate) : "" }),
    ];
    if (!doc.effectiveDateConfirmed) {
      effectiveDateRuns.push(
        new TextRun({ text: " (to be confirmed with client)", italics: true, color: "666666" }),
      );
    }
    children.push(new Paragraph({ children: effectiveDateRuns, spacing: { after: 200 } }));
  }

  children.push(thickRule());

  // Scope of Work
  if (doc.scopeOfWork?.root?.children) {
    children.push(
      new Paragraph({ text: "Scope of Work", heading: HeadingLevel.HEADING_2, spacing: { after: 100 } }),
    );
    children.push(...lexicalToDocx(doc.scopeOfWork.root.children));
    children.push(thinRule());
  }

  // Pricing table — horizontal-rules-only style. Setup fee row always shown ($0 when missing).
  {
    children.push(
      new Paragraph({ text: "Pricing", heading: HeadingLevel.HEADING_2, spacing: { after: 80 } }),
    );

    // Pricing table is narrower than page width (~60%). 60/40 split inside that.
    const pricingTableWidth = Math.round(PAGE_WIDTH_DXA * 0.6);
    const labelWidth = Math.round(pricingTableWidth * 0.6);
    const valueWidth = pricingTableWidth - labelWidth;

    const noVerticalBorders = {
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    } as const;
    const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: "111111" } as const;
    const lightBorder = { style: BorderStyle.SINGLE, size: 1, color: "D4D4D4" } as const;

    // Cell margins (twips) — compact rows.
    const cellMargin = { top: 80, bottom: 80, left: 60, right: 60 } as const;

    const tableRows: TableRow[] = [
      new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "Service", bold: true })] })],
            width: { size: labelWidth, type: WidthType.DXA },
            margins: cellMargin,
            borders: { ...noVerticalBorders, top: thinBorder, bottom: thinBorder },
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: `Amount (${currency})`, bold: true })],
                alignment: AlignmentType.RIGHT,
              }),
            ],
            width: { size: valueWidth, type: WidthType.DXA },
            margins: cellMargin,
            borders: { ...noVerticalBorders, top: thinBorder, bottom: thinBorder },
          }),
        ],
      }),
    ];

    const bodyRow = (label: string, value: string) => new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: label })] })],
          width: { size: labelWidth, type: WidthType.DXA },
          margins: cellMargin,
          borders: { ...noVerticalBorders, bottom: lightBorder },
        }),
        new TableCell({
          children: [new Paragraph({ text: value, alignment: AlignmentType.RIGHT })],
          width: { size: valueWidth, type: WidthType.DXA },
          margins: cellMargin,
          borders: { ...noVerticalBorders, bottom: lightBorder },
        }),
      ],
    });

    // Row order (mirrors PDF / signing page):
    //   1. Additional Work projects (only rows with a non-empty projectName)
    //   2. One-time setup fee (unless hideSetupFee is ON)
    //   3. Monthly management retainer
    //   4. Monthly / annual hosting
    if (Array.isArray(doc.additionalWork)) {
      for (const item of doc.additionalWork) {
        const label = item?.projectName?.trim();
        if (!label) continue;
        tableRows.push(bodyRow(label, formatCurrency(item?.amount ?? 0, currency)));
      }
    }
    if (!doc.hideSetupFee) {
      tableRows.push(bodyRow("One-time setup fee", formatCurrency(doc.setupFee ?? 0, currency)));
    }
    if (doc.monthlyRetainer && doc.monthlyRetainer > 0) {
      tableRows.push(bodyRow("Monthly management retainer", `${formatCurrency(doc.monthlyRetainer, currency)}/month`));
    }
    if (doc.monthlyHosting && doc.monthlyHosting > 0) {
      tableRows.push(bodyRow("Monthly hosting", `${formatCurrency(doc.monthlyHosting, currency)}/month`));
    }
    if (doc.annualHosting && doc.annualHosting > 0) {
      tableRows.push(bodyRow("Annual hosting", `${formatCurrency(doc.annualHosting, currency)}/year`));
    }

    children.push(
      new Table({
        rows: tableRows,
        width: { size: pricingTableWidth, type: WidthType.DXA },
        // columnWidths + layout: FIXED so Mac Preview / Quick Look (and any
        // other renderer that doesn't auto-fit) respect the explicit DXA
        // widths instead of collapsing every column to a single character.
        columnWidths: [labelWidth, valueWidth],
        layout: TableLayoutType.FIXED,
        borders: {
          top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        },
      }),
    );

    // Pricing notes (rich text)
    if (doc.pricingNotes?.root?.children) {
      children.push(new Paragraph({ spacing: { before: 100 } }));
      children.push(...lexicalToDocx(doc.pricingNotes.root.children));
    }

    children.push(thinRule());
  }

  // Annual Review & Tier Adjustment (optional)
  if (doc.annualReviewEnabled) {
    children.push(
      new Paragraph({
        text: "Annual Review and Adjustment",
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 100 },
      }),
    );
    if (doc.annualReviewIntro?.root?.children) {
      children.push(...lexicalToDocx(doc.annualReviewIntro.root.children));
    }
    const tierTable = parseTierTable(doc.annualReviewTierTableText);
    if (tierTable) {
      const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: "111111" } as const;
      const lightBorder = { style: BorderStyle.SINGLE, size: 1, color: "D4D4D4" } as const;
      const noVerticalBorders = {
        left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      } as const;
      const cellMargin = { top: 80, bottom: 80, left: 60, right: 60 } as const;
      // Tier table is wide enough to fit long headers on one line (~90%).
      const tierTableWidth = Math.round(PAGE_WIDTH_DXA * 0.9);
      const colCount = tierTable.headers.length;
      const colWidth = Math.floor(tierTableWidth / Math.max(colCount, 1));
      const headerRow = new TableRow({
        tableHeader: true,
        children: tierTable.headers.map((header) => new TableCell({
          children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: header, bold: true })] })],
          width: { size: colWidth, type: WidthType.DXA },
          margins: cellMargin,
          borders: { ...noVerticalBorders, top: thinBorder, bottom: thinBorder },
        })),
      });
      const bodyRows = tierTable.rows.map((row) => new TableRow({
        children: row.map((cell) => new TableCell({
          children: [new Paragraph({ text: cell })],
          width: { size: colWidth, type: WidthType.DXA },
          margins: cellMargin,
          borders: { ...noVerticalBorders, bottom: lightBorder },
        })),
      }));
      children.push(new Paragraph({ spacing: { before: 80 } }));
      children.push(
        new Table({
          rows: [headerRow, ...bodyRows],
          width: { size: tierTableWidth, type: WidthType.DXA },
          // Same fix as the pricing table — explicit columnWidths + FIXED
          // layout so every renderer honours the cell widths.
          columnWidths: Array.from({ length: colCount }, () => colWidth),
          layout: TableLayoutType.FIXED,
          borders: {
            top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          },
        }),
      );
      children.push(new Paragraph({ spacing: { after: 100 } }));
    }
    if (doc.annualReviewNotice?.root?.children) {
      children.push(...lexicalToDocx(doc.annualReviewNotice.root.children));
    }
    if (doc.annualReviewGoodFaithReview?.root?.children) {
      children.push(
        new Paragraph({ heading: HeadingLevel.HEADING_4, children: [new TextRun({ text: "Good Faith Review", bold: true })], spacing: { before: 120, after: 60 } }),
      );
      children.push(...lexicalToDocx(doc.annualReviewGoodFaithReview.root.children));
    }
    if (doc.annualReviewAcceptance?.root?.children) {
      children.push(
        new Paragraph({ heading: HeadingLevel.HEADING_4, children: [new TextRun({ text: "Acceptance of Adjustment", bold: true })], spacing: { before: 120, after: 60 } }),
      );
      children.push(...lexicalToDocx(doc.annualReviewAcceptance.root.children));
    }
    children.push(thinRule());
  }

  // Payment Terms — starts on a new page so the legal terms read as a fresh section.
  children.push(
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ text: "Payment Terms:", heading: HeadingLevel.HEADING_2, spacing: { after: 100 } }),
  );
  if (doc.paymentTermsOverride?.root?.children) {
    children.push(...lexicalToDocx(doc.paymentTermsOverride.root.children));
  } else {
    const paymentBullets: string[] = [];
    if (!doc.hideSetupFee) {
      paymentBullets.push(`The one-time setup fee of ${setupAmount} is payable upon signing of this contract.`);
    }
    paymentBullets.push(
      `The monthly retainer of ${retainerAmount} will be invoiced on the first day of each month. If the engagement begins partway through a calendar month, the first month's retainer will be pro-rated based on the number of remaining days in that month. From the following month onward, the full monthly retainer will be invoiced on the 1st of each month.`,
      "Invoices are due within 14 days of issue.",
      "This contract will automatically renew on a rolling monthly basis unless terminated by either party with a 30-day written notice.",
    );
    for (const bullet of paymentBullets) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: bullet })],
          bullet: { level: 0 },
          spacing: { after: 40 },
        }),
      );
    }
  }

  children.push(thinRule());

  // Termination
  children.push(
    new Paragraph({ text: "Termination:", heading: HeadingLevel.HEADING_2, spacing: { after: 100 } }),
  );
  if (doc.terminationOverride?.root?.children) {
    children.push(...lexicalToDocx(doc.terminationOverride.root.children));
  } else {
    for (const bullet of [
      "Either party may terminate this contract with a 30-day written notice.",
      "Upon termination, the Client agrees to pay for all services rendered up to the termination date.",
      "Upon termination, Optimise Digital will provide the Client with full access to and ownership of all Google Ads campaigns, conversion tracking, and assets created during the engagement.",
    ]) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: bullet })],
          bullet: { level: 0 },
          spacing: { after: 40 },
        }),
      );
    }
  }

  children.push(thinRule());

  // Confidentiality
  children.push(
    new Paragraph({ text: "Confidentiality:", heading: HeadingLevel.HEADING_2, spacing: { after: 100 } }),
  );
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Either party may disclose Confidential Information to the other. "Confidential Information" includes all non-public information about the Disclosing Party's business, technology, structure, and strategies, whether conveyed orally or in tangible form, and whether or not marked as "confidential." The Recipient will keep the Confidential Information in trust, not disclose it to others, and ensure that its employees, agents, or any persons under its direction do the same, indefinitely.`,
        }),
      ],
      bullet: { level: 0 },
      spacing: { after: 200 },
    }),
  );

  children.push(thickRule());

  // Acceptance and Signature
  children.push(
    new Paragraph({ text: "Acceptance and Signature:", heading: HeadingLevel.HEADING_2, spacing: { after: 100 } }),
    new Paragraph({
      text: "By signing below, both parties agree to the terms and conditions outlined in this contract.",
      spacing: { after: 200 },
    }),
  );

  // Client signature block. "Client: <Company Name>" identifies the
  // contracting entity; the signer's personal name, title and date sit
  // beneath. Mirrors the PDF layout.
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Client", bold: true }),
        new TextRun({ text: `: ${doc.clientName}` }),
      ],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "Signature: ____________________________" })],
      spacing: { after: 50 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Name: ", bold: true }),
        new TextRun({ text: `${doc.clientSignerName || doc.clientContactName || "[Name]"}    ` }),
        new TextRun({ text: "Title: ", bold: true }),
        new TextRun({ text: `${doc.clientTitle || ""}    ` }),
        new TextRun({ text: "Date: ", bold: true }),
        new TextRun({ text: doc.clientSignedAt ? formatDate(doc.clientSignedAt) : "____________________" }),
      ],
      spacing: { after: 300 },
    }),
  );

  // Service Provider signature block
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Service Provider", bold: true }),
        new TextRun({ text: `: ${agencyName}` }),
      ],
      spacing: { after: 100 },
    }),
  );

  // Agency signature image
  if (sigBuffer) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "Signature:", bold: true })],
        spacing: { after: 50 },
      }),
      new Paragraph({
        children: [
          new ImageRun({
            data: sigBuffer,
            transformation: { width: 100, height: 30 },
            type: "png",
          }),
        ],
        spacing: { after: 50 },
      }),
    );
  } else {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "Signature: ____________________________" })],
        spacing: { after: 50 },
      }),
    );
  }

  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Name: ", bold: true }),
        new TextRun({ text: `${doc.agencySignerName || "Peter Tu"}    ` }),
        new TextRun({ text: "Title: ", bold: true }),
        new TextRun({ text: `${doc.agencySignerTitle || ""}    ` }),
        new TextRun({ text: "Date: ", bold: true }),
        new TextRun({ text: doc.agencySignedAt ? formatDate(doc.agencySignedAt) : "____________________" }),
      ],
      spacing: { after: 200 },
    }),
  );

  const docxDoc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(docxDoc);
  return Buffer.from(buffer);
}

// ── Lexical → docx rendering ──

function lexicalToDocx(nodes: any[], level?: number): Paragraph[] {
  const result: Paragraph[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "paragraph":
        result.push(
          new Paragraph({
            children: lexicalInlineRuns(node.children || []),
            spacing: { after: 80 },
          }),
        );
        break;

      case "heading": {
        const headingLevel =
          node.tag === "h1" ? HeadingLevel.HEADING_1
            : node.tag === "h2" ? HeadingLevel.HEADING_2
              : HeadingLevel.HEADING_3;
        result.push(
          new Paragraph({
            children: lexicalInlineRuns(node.children || []),
            heading: headingLevel,
            spacing: { before: 120, after: 80 },
          }),
        );
        break;
      }

      case "list": {
        const isOrdered = node.listType === "number";
        for (const item of node.children || []) {
          if (item.type === "listitem") {
            result.push(...lexicalListItemToDocx(item, isOrdered, level || 0));
          }
        }
        break;
      }

      default:
        if (node.children) {
          result.push(...lexicalToDocx(node.children, level));
        } else if (node.text !== undefined) {
          result.push(
            new Paragraph({
              children: [lexicalTextRun(node)],
              spacing: { after: 80 },
            }),
          );
        }
        break;
    }
  }
  return result;
}

function lexicalListItemToDocx(item: any, isOrdered: boolean, level: number): Paragraph[] {
  const result: Paragraph[] = [];
  const inlineChildren: any[] = [];
  const nestedLists: any[] = [];

  for (const child of item.children || []) {
    if (child.type === "list") {
      nestedLists.push(child);
    } else {
      inlineChildren.push(child);
    }
  }

  // The list item text
  if (inlineChildren.length > 0) {
    result.push(
      new Paragraph({
        children: lexicalInlineRuns(inlineChildren),
        bullet: { level },
        spacing: { after: 60 },
      }),
    );
  }

  // Nested lists
  for (const nested of nestedLists) {
    const nestedOrdered = nested.listType === "number";
    for (const nestedItem of nested.children || []) {
      if (nestedItem.type === "listitem") {
        result.push(...lexicalListItemToDocx(nestedItem, nestedOrdered, level + 1));
      }
    }
  }

  return result;
}

function lexicalInlineRuns(children: any[]): TextRun[] {
  const runs: TextRun[] = [];
  for (const child of children) {
    if (child.text !== undefined) {
      runs.push(lexicalTextRun(child));
    } else if (child.children) {
      runs.push(...lexicalInlineRuns(child.children));
    }
  }
  return runs;
}

function lexicalTextRun(node: any): TextRun {
  const isBold = !!(node.format & 1);
  const isItalic = !!(node.format & 2);
  return new TextRun({
    text: node.text || "",
    bold: isBold || undefined,
    italics: isItalic || undefined,
  });
}

// ── Helpers ──

function textPara(text: string, size: number, bold?: boolean): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size, bold })],
    spacing: { after: 100 },
  });
}

function labelValuePara(label: string, value: string, afterSpacing?: number): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true }),
      new TextRun({ text: value }),
    ],
    spacing: { after: afterSpacing || 50 },
  });
}

function thickRule(): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "111111" } },
    spacing: { after: 200 },
  });
}

function thinRule(): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } },
    spacing: { after: 200 },
  });
}

async function resolveMediaBuffer(
  payload: any,
  agencySignature: any,
): Promise<Buffer | null> {
  if (!agencySignature) return null;

  let url: string | null = null;

  if (typeof agencySignature === "object" && agencySignature?.url) {
    url = agencySignature.url;
  } else if (typeof agencySignature === "string" || typeof agencySignature === "number") {
    try {
      const media = await payload.findByID({
        collection: "media",
        id: agencySignature,
        overrideAccess: true,
      });
      url = media?.url || null;
    } catch {
      return null;
    }
  }

  if (!url) return null;

  try {
    let fetchUrl = url;
    if (url.startsWith("/")) {
      const baseUrl =
        process.env.NEXT_PUBLIC_SERVER_URL ||
        (process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
          : "http://localhost:3004");
      fetchUrl = `${baseUrl}${url}`;
    }
    const res = await fetch(fetchUrl);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}
