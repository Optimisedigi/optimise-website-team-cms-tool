import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import {
  generateContractSections,
  type ContractData,
  type ContractSection,
} from "./contract-template";
import { getPrimaryClientEmail } from "./contract-emails";
import path from "path";
import fs from "fs";

const styles = StyleSheet.create({
  page: {
    padding: 50,
    fontSize: 10,
    fontFamily: "Helvetica",
    lineHeight: 1.6,
    color: "#111",
  },
  // Cover
  logo: {
    width: 214,
    marginBottom: 20,
  },
  coverText: {
    fontSize: 13,
    marginBottom: 6,
  },
  coverNameBold: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    marginTop: 10,
    marginBottom: 18,
  },
  contractBetweenLine: {
    fontSize: 11,
    marginBottom: 6,
  },
  contractBetweenItalicBold: {
    fontFamily: "Helvetica-BoldOblique",
  },
  fieldRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  fieldLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  fieldValue: {
    fontSize: 10,
  },
  providerBlock: {
    marginTop: 14,
    marginBottom: 6,
  },
  effectiveDate: {
    fontSize: 10,
    marginTop: 14,
  },
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    marginVertical: 16,
  },
  hrThick: {
    borderBottomWidth: 2,
    borderBottomColor: "#111",
    marginVertical: 20,
  },
  // Sections (body fontsize 9pt from Scope of Work down per design spec)
  sectionHeading: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 16,
    marginBottom: 6,
  },
  sectionSubHeading: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginTop: 10,
    marginBottom: 4,
  },
  paragraph: {
    fontSize: 9,
    marginBottom: 6,
    lineHeight: 1.5,
  },
  bulletItem: {
    flexDirection: "row",
    marginBottom: 0,
    paddingLeft: 8,
  },
  bulletDot: {
    width: 12,
    fontSize: 9,
  },
  bulletText: {
    flex: 1,
    fontSize: 9,
    lineHeight: 1.2,
  },
  // Tables — horizontal-lines-only look (no outer border, no vertical dividers).
  // Bold header row with a thin black bottom rule; light grey rule between body rows.
  table: {
    marginVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#111",
    width: "60%",
  },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#111",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#d4d4d4",
  },
  tableRowLast: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#d4d4d4",
  },
  tableCellLabel: {
    width: "60%",
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontSize: 9,
  },
  tableCellValue: {
    width: "40%",
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontSize: 9,
    textAlign: "right",
  },
  tableHeaderLabel: {
    width: "60%",
    paddingVertical: 6,
    paddingHorizontal: 4,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  tableHeaderValue: {
    width: "40%",
    paddingVertical: 6,
    paddingHorizontal: 4,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },
  // Tier table (N-column, used by Annual Review section) — same horizontal-lines look.
  // Wide enough to fit long headers like "Trailing 3-month avg. monthly spend (AUD)"
  // on a single line; header text centered.
  tierTable: {
    marginVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#111",
    width: "90%",
  },
  tierTableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#111",
  },
  tierTableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#d4d4d4",
  },
  tierTableRowLast: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#d4d4d4",
  },
  tierTableHeaderCell: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "left",
  },
  tierTableHeaderCellLast: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "left",
  },
  tierTableCell: {
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontSize: 9,
  },
  tierTableCellLast: {
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontSize: 9,
  },
  // Signatures
  signatureBlock: {
    marginTop: 20,
  },
  signaturePartyLine: {
    fontSize: 11,
    marginBottom: 10,
  },
  signatureImage: {
    width: 150,
    height: 45,
    marginBottom: 4,
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#999",
    width: 200,
    height: 40,
    marginBottom: 4,
  },
  signatureFieldRow: {
    flexDirection: "row",
    marginBottom: 2,
  },
  signatureFieldLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    width: 70,
  },
  signatureFieldValue: {
    fontSize: 10,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 50,
    right: 50,
    textAlign: "center",
    fontSize: 8,
    color: "#999",
  },
});

function getLogoDataUri(): string | null {
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    const buffer = fs.readFileSync(logoPath);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function renderSection(section: ContractSection, index: number, logoUri: string | null) {
  switch (section.type) {
    case "cover": {
      const c = section.cover!;
      return (
        <View key={index}>
          {logoUri && <Image style={styles.logo} src={logoUri} />}
          <View style={styles.hrThick} />

          <Text style={styles.coverText}>Contract Agreement</Text>
          <Text style={[styles.coverText, { marginTop: 6 }]}>Between</Text>
          <Text style={styles.coverNameBold}>Optimise Digital Pty Ltd</Text>
          <Text style={[styles.coverText, { marginTop: 4 }]}>And</Text>
          <Text style={styles.coverNameBold}>{c.clientName}</Text>

          <View style={styles.hrThick} />

          {/* This contract is between - Client section */}
          <Text style={{ fontFamily: "Helvetica-BoldOblique", fontSize: 10, marginBottom: 4 }}>
            This contract is between:
          </Text>
          <View style={{ flexDirection: "row", marginBottom: 6 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10 }}>Client: </Text>
            <Text style={{ fontSize: 10 }}>{c.clientName}</Text>
          </View>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Name: </Text>
            <Text style={styles.fieldValue}>{c.clientContactName || ""}    </Text>
            <Text style={styles.fieldLabel}>Title: </Text>
            <Text style={styles.fieldValue}>{c.clientTitle || ""}    </Text>
            <Text style={styles.fieldLabel}>Email</Text>
            <Text style={styles.fieldValue}>: {getPrimaryClientEmail(c.clientEmail)}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Phone</Text>
            <Text style={styles.fieldValue}>: {c.clientPhone || ""}    </Text>
            <Text style={styles.fieldLabel}>Website </Text>
            <Text style={{ fontSize: 10 }}>{c.clientWebsite || ""}</Text>
          </View>

          {/* Service Provider - clearly separated */}
          <View style={{ marginTop: 24, marginBottom: 6 }}>
            <View style={{ flexDirection: "row", marginBottom: 3 }}>
              <Text style={styles.fieldLabel}>Service Provider</Text>
              <Text style={styles.fieldValue}>: Optimise Digital Pty Ltd</Text>
            </View>
            <View style={{ flexDirection: "row", marginBottom: 3 }}>
              <Text style={styles.fieldLabel}>ACN</Text>
              <Text style={styles.fieldValue}>: 651 821 180</Text>
            </View>
            <View style={{ flexDirection: "row", marginBottom: 3 }}>
              <Text style={styles.fieldLabel}>Address</Text>
              <Text style={styles.fieldValue}>: 72A Yelverton St, Sydenham NSW 2044</Text>
            </View>
            <View style={{ flexDirection: "row", marginBottom: 3 }}>
              <Text style={styles.fieldLabel}>Contact Person: </Text>
              <Text style={styles.fieldValue}>{c.agencyContactName || "Peter Tu"}    </Text>
              {/* Title sits next to the contact person to mirror the client
                  section above (which already shows Name + Title + Email).
                  Falls back to agencySignerTitle since the agency contact and
                  agency signer are the same person in practice. */}
              <Text style={styles.fieldLabel}>Title: </Text>
              <Text style={styles.fieldValue}>{c.agencySignerTitle || ""}</Text>
            </View>
            <View style={{ flexDirection: "row", marginBottom: 3 }}>
              <Text style={styles.fieldLabel}>Email</Text>
              <Text style={styles.fieldValue}>: {c.agencyContactEmail || ""}</Text>
            </View>
            <View style={{ flexDirection: "row" }}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <Text style={styles.fieldValue}>: {c.agencyContactPhone || ""}</Text>
            </View>
          </View>

          <Text style={styles.effectiveDate}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>Effective Date:</Text>
            {" "}{c.effectiveDate}
            {/* Precedence: deposit qualifier wins when ON; otherwise show the
                "to be confirmed" qualifier unless the date is confirmed. */}
            {c.effectiveDateOnDeposit ? (
              <>
                {" "}
                <Text style={{ color: "#666", fontFamily: "Helvetica-Oblique" }}>(the date on which Optimise Digital receives the signed Agreement and the initial 50% deposit)</Text>
              </>
            ) : !c.effectiveDateConfirmed ? (
              <>
                {" "}
                <Text style={{ color: "#666", fontFamily: "Helvetica-Oblique" }}>(to be confirmed with client)</Text>
              </>
            ) : null}
          </Text>
          <View style={styles.hrThick} />
        </View>
      );
    }

    case "heading":
      return (
        <Text key={index} style={styles.sectionHeading}>
          {section.heading}
        </Text>
      );

    case "pageBreak":
      // Empty view that forces the next render onto a new page.
      return <View key={index} break />;

    case "paragraph":
      return (
        <Text key={index} style={styles.paragraph}>
          {section.content}
        </Text>
      );

    case "richtext":
      if (section.lexicalNodes && section.lexicalNodes.length > 0) {
        return (
          <View key={index}>
            {section.subHeading && (
              <Text style={styles.sectionSubHeading}>{section.subHeading}</Text>
            )}
            {section.lexicalNodes.map((node: any, ni: number) =>
              renderLexicalNode(node, ni),
            )}
          </View>
        );
      }
      // Plain text fallback
      return (
        <View key={index}>
          {section.subHeading && (
            <Text style={styles.sectionSubHeading}>{section.subHeading}</Text>
          )}
          <Text style={styles.paragraph}>{section.content}</Text>
        </View>
      );

    case "bullets":
      return (
        <View key={index}>
          {section.items!.map((item, i) => (
            <View key={i} style={styles.bulletItem} wrap={false}>
              <Text style={styles.bulletDot}>{"\u2022"}</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
        </View>
      );

    case "table": {
      const headerLabel = section.tableHeaders?.label ?? "";
      const headerValue = section.tableHeaders?.value ?? "Amount";
      return (
        <View key={index} style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.tableHeaderLabel}>{headerLabel || " "}</Text>
            <Text style={styles.tableHeaderValue}>{headerValue}</Text>
          </View>
          {section.rows!.map((row, i) => (
            <View
              key={i}
              style={i < section.rows!.length - 1 ? styles.tableRow : styles.tableRowLast}
            >
              <Text style={styles.tableCellLabel}>{row.label}</Text>
              <Text style={styles.tableCellValue}>{row.value}</Text>
            </View>
          ))}
        </View>
      );
    }

    case "pricingBlock": {
      if (!section.pricingBlock) return null;
      const { heading, rows, tableHeaders } = section.pricingBlock;
      // wrap={false} keeps the heading + entire table on the same page so the
      // pricing table never breaks across a page boundary.
      return (
        <View key={index} wrap={false}>
          <Text style={styles.sectionHeading}>{heading}</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={styles.tableHeaderLabel}>{tableHeaders.label || " "}</Text>
              <Text style={styles.tableHeaderValue}>{tableHeaders.value}</Text>
            </View>
            {rows.map((row, i) => (
              <View
                key={i}
                style={i < rows.length - 1 ? styles.tableRow : styles.tableRowLast}
              >
                <Text style={styles.tableCellLabel}>{row.label}</Text>
                <Text style={styles.tableCellValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        </View>
      );
    }

    case "tierTable": {
      if (!section.tierTable) return null;
      const { headers, rows } = section.tierTable;
      const colCount = headers.length;
      const colWidth = `${100 / Math.max(colCount, 1)}%`;
      return (
        <View key={index} style={styles.tierTable} wrap={false}>
          <View style={styles.tierTableHeaderRow}>
            {headers.map((header, i) => (
              <Text
                key={i}
                style={[
                  i < headers.length - 1
                    ? styles.tierTableHeaderCell
                    : styles.tierTableHeaderCellLast,
                  { width: colWidth },
                ]}
              >
                {header}
              </Text>
            ))}
          </View>
          {rows.map((row, ri) => (
            <View
              key={ri}
              style={ri < rows.length - 1 ? styles.tierTableRow : styles.tierTableRowLast}
            >
              {row.map((cell, ci) => (
                <Text
                  key={ci}
                  style={[
                    ci < row.length - 1 ? styles.tierTableCell : styles.tierTableCellLast,
                    { width: colWidth },
                  ]}
                >
                  {cell}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
    }

    case "signatures": {
      const sigs = section.signatures!;
      // "Client: <Company Name>" — the heading row identifies the contracting
      // entity, not the individual signer. The signer's personal name +
      // title + date sit under the signature image. Falls back to the
      // signer's personal name only if no company name was passed.
      const clientHeader = sigs.client.companyName || sigs.client.name || "";
      const providerHeader = sigs.provider.companyName || "Optimise Digital Pty Ltd";
      return (
        <View key={index} style={styles.signatureBlock}>
          {/* Client */}
          <View style={{ flexDirection: "row", marginBottom: 4 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11 }}>Client</Text>
            <Text style={{ fontSize: 11 }}>: {clientHeader}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 8 }}>
            <View>
              <Text style={styles.fieldLabel}>Signature: </Text>
              {sigs.client.signature ? (
                <Image style={styles.signatureImage} src={sigs.client.signature} />
              ) : (
                <View style={styles.signatureLine} />
              )}
            </View>
            <View style={{ marginLeft: 20 }}>
              <View style={styles.signatureFieldRow}>
                <Text style={styles.signatureFieldLabel}>Name: </Text>
                <Text style={styles.signatureFieldValue}>{sigs.client.name || "[Name]"}</Text>
              </View>
              {/* Title row added so the signer's role on the page mirrors
                  the Title shown in the cover-page client block. */}
              <View style={styles.signatureFieldRow}>
                <Text style={styles.signatureFieldLabel}>Title: </Text>
                <Text style={styles.signatureFieldValue}>{sigs.client.title || ""}</Text>
              </View>
              <View style={styles.signatureFieldRow}>
                <Text style={styles.signatureFieldLabel}>Date: </Text>
                <Text style={styles.signatureFieldValue}>{sigs.client.date || ""}</Text>
              </View>
            </View>
          </View>

          {/* Service Provider */}
          <View style={{ flexDirection: "row", marginBottom: 4, marginTop: 16 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11 }}>Service Provider</Text>
            <Text style={{ fontSize: 11 }}>: {providerHeader}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
            <View>
              <Text style={styles.fieldLabel}>Signature: </Text>
              {sigs.provider.signature ? (
                <Image style={styles.signatureImage} src={sigs.provider.signature} />
              ) : (
                <View style={styles.signatureLine} />
              )}
            </View>
            <View style={{ marginLeft: 20 }}>
              <View style={styles.signatureFieldRow}>
                <Text style={styles.signatureFieldLabel}>Name: </Text>
                <Text style={styles.signatureFieldValue}>{sigs.provider.name || "Peter Tu"}</Text>
              </View>
              <View style={styles.signatureFieldRow}>
                <Text style={styles.signatureFieldLabel}>Title: </Text>
                <Text style={styles.signatureFieldValue}>{sigs.provider.title || ""}</Text>
              </View>
              <View style={styles.signatureFieldRow}>
                <Text style={styles.signatureFieldLabel}>Date: </Text>
                <Text style={styles.signatureFieldValue}>{sigs.provider.date || ""}</Text>
              </View>
            </View>
          </View>
        </View>
      );
    }

    default:
      return null;
  }
}

// ── Lexical → react-pdf rendering ──

function renderLexicalNode(node: any, index: number): React.ReactNode {
  if (!node) return null;

  switch (node.type) {
    case "paragraph":
      return (
        <Text key={index} style={styles.paragraph}>
          {renderLexicalInline(node.children || [])}
        </Text>
      );

    case "heading": {
      // h1/h2/h3/h4 mapped to PDF sizes (one step smaller than legacy values).
      const level =
        node.tag === "h1"
          ? 14
          : node.tag === "h2"
            ? 12
            : node.tag === "h3"
              ? 11
              : 10;
      return (
        <Text
          key={index}
          style={{
            fontSize: level,
            fontFamily: "Helvetica-Bold",
            marginTop: 10,
            marginBottom: 4,
          }}
        >
          {renderLexicalInline(node.children || [])}
        </Text>
      );
    }

    case "list": {
      const isOrdered = node.listType === "number";
      return (
        <View key={index} style={{ marginBottom: 6 }}>
          {(node.children || []).map((item: any, i: number) =>
            renderLexicalListItem(item, i, isOrdered, i + (node.start || 1)),
          )}
        </View>
      );
    }

    default:
      // Unknown node type — try rendering children
      if (node.children) {
        return (
          <View key={index}>
            {node.children.map((child: any, ci: number) =>
              renderLexicalNode(child, ci),
            )}
          </View>
        );
      }
      // Text node at top level
      if (node.text !== undefined) {
        return (
          <Text key={index} style={styles.paragraph}>
            {renderLexicalTextRun(node)}
          </Text>
        );
      }
      return null;
  }
}

function renderLexicalListItem(
  item: any,
  index: number,
  isOrdered: boolean,
  ordinalNumber: number,
): React.ReactNode {
  if (item.type !== "listitem") return null;

  // Check for nested lists inside this list item
  const inlineChildren: any[] = [];
  const nestedLists: any[] = [];
  for (const child of item.children || []) {
    if (child.type === "list") {
      nestedLists.push(child);
    } else {
      inlineChildren.push(child);
    }
  }

  return (
    <View key={index} wrap={false}>
      <View style={styles.bulletItem}>
        <Text style={styles.bulletDot}>
          {isOrdered ? `${ordinalNumber}.` : "\u2022"}
        </Text>
        <Text style={styles.bulletText}>
          {renderLexicalInline(inlineChildren)}
        </Text>
      </View>
      {nestedLists.map((nestedList: any, ni: number) => (
        <View key={`nested-${ni}`} style={{ paddingLeft: 16 }}>
          {(nestedList.children || []).map((nestedItem: any, nii: number) =>
            renderLexicalListItem(
              nestedItem,
              nii,
              nestedList.listType === "number",
              nii + (nestedList.start || 1),
            ),
          )}
        </View>
      ))}
    </View>
  );
}

function renderLexicalInline(children: any[]): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.text !== undefined) {
      result.push(renderLexicalTextRun(child, i));
    } else if (child.children) {
      // Inline element with children (e.g. link)
      result.push(...renderLexicalInline(child.children));
    }
  }
  return result;
}

function renderLexicalTextRun(node: any, key?: number): React.ReactNode {
  const isBold = !!(node.format & 1);
  const isItalic = !!(node.format & 2);

  let fontFamily = "Helvetica";
  if (isBold && isItalic) fontFamily = "Helvetica-BoldOblique";
  else if (isBold) fontFamily = "Helvetica-Bold";
  else if (isItalic) fontFamily = "Helvetica-Oblique";

  return (
    <Text key={key} style={{ fontFamily }}>
      {node.text}
    </Text>
  );
}

interface ContractPDFProps {
  data: ContractData;
}

const ContractPDF: React.FC<ContractPDFProps> = ({ data }) => {
  const sections = generateContractSections(data);
  const logoUri = getLogoDataUri();

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {sections.map((section, i) => renderSection(section, i, logoUri))}

        <Text style={styles.footer}>
          This document was digitally signed via Optimise Digital&apos;s contract
          management system. A SHA-256 hash of this document is stored for
          integrity verification. Signed documents are retained for a minimum
          of 7 years in accordance with Australian record-keeping requirements.
        </Text>
      </Page>
    </Document>
  );
};

export async function generateContractPdf(
  data: ContractData,
): Promise<Buffer> {
  const buffer = await renderToBuffer(<ContractPDF data={data} />);
  return Buffer.from(buffer);
}
