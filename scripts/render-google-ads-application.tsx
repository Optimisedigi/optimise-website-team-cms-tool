/**
 * scripts/render-google-ads-application.tsx
 *
 * Renders docs/google-ads-api-application.md to a PDF using @react-pdf/renderer.
 * Pulls the three embedded screenshots from docs/google-ads-api-application/images/
 * and appends them on the final page.
 *
 * Run with: npx tsx scripts/render-google-ads-application.tsx
 */

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import React from "react";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToFile,
} from "@react-pdf/renderer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DOC_DIR = path.join(ROOT, "docs", "google-ads-api-application");
const IMAGES_DIR = path.join(DOC_DIR, "images");
const MD_PATH = path.join(ROOT, "docs", "google-ads-api-application.md");
const OUT_PATH = path.join(DOC_DIR, "google-ads-api-application.pdf");

const COLORS = {
  ink: "#0F172A",
  muted: "#475569",
  accent: "#1D4ED8",
  rule: "#CBD5E1",
  panel: "#F8FAFC",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 56,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    lineHeight: 1.45,
    color: COLORS.ink,
  },
  pageLandscape: {
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    lineHeight: 1.4,
    color: COLORS.ink,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 56,
    right: 56,
    flexDirection: "row",
    justifyContent: "flex-end",
    fontSize: 9,
    color: COLORS.muted,
  },
  h1: {
    fontSize: 20,
    fontWeight: 700,
    marginTop: 0,
    marginBottom: 8,
  },
  h2: {
    fontSize: 13,
    fontWeight: 700,
    marginTop: 12,
    marginBottom: 4,
    color: COLORS.ink,
  },
  h3: {
    fontSize: 11.5,
    fontWeight: 700,
    marginTop: 10,
    marginBottom: 4,
  },
  p: {
    marginBottom: 6,
  },
  bulletItem: {
    flexDirection: "row",
    marginBottom: 3,
  },
  bulletDot: {
    width: 10,
    color: COLORS.muted,
  },
  bulletText: {
    flex: 1,
  },
  numItem: {
    flexDirection: "row",
    marginBottom: 3,
  },
  numLabel: {
    width: 16,
    color: COLORS.muted,
  },
  panel: {
    backgroundColor: COLORS.panel,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    padding: 8,
    marginVertical: 8,
  },
  code: {
    fontFamily: "Courier",
    fontSize: 9.5,
    color: "#0B3B8C",
  },
  caption: {
    fontSize: 9,
    color: COLORS.muted,
    marginTop: 6,
  },
  image: {
    width: "100%",
    height: 430,
    objectFit: "contain",
    marginBottom: 4,
  },
  rule: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.rule,
    marginVertical: 8,
  },
});

// --- minimal markdown parser (no deps) -------------------------------------

type Block =
  | { kind: "h1" | "h2" | "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ol" | "ul"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "hr" };

function inline(text: string): React.ReactNode {
  // very small: **bold**, *italic*, `code`
  const parts: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  const push = (n: React.ReactNode) => parts.push(<React.Fragment key={key++}>{n}</React.Fragment>);
  while (i < text.length) {
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end > -1) {
        push(<Text style={{ fontWeight: 700 }}>{text.slice(i + 2, end)}</Text>);
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > -1) {
        push(<Text style={styles.code}>{text.slice(i + 1, end)}</Text>);
        i = end + 1;
        continue;
      }
    }
    // find next special
    const next = text.slice(i).search(/(\*\*|`)/);
    if (next === -1) {
      push(text.slice(i));
      break;
    }
    push(text.slice(i, i + next));
    i += next;
  }
  return parts;
}

function parseMarkdown(md: string): { blocks: Block[]; raw: string } {
  const lines = md.split(/\r?\n/);
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (line.startsWith("---")) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push({ kind: "h1", text: line.slice(2) });
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push({ kind: "h2", text: line.slice(3) });
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      blocks.push({ kind: "h3", text: line.slice(4) });
      i++;
      continue;
    }
    if (/^\s*-\s+/.test(line) || /^\s*\*\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }
    if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        buf.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ kind: "quote", text: buf.join(" ") });
      continue;
    }
    // paragraph: gather until blank or special start
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("---") &&
      !lines[i].startsWith("> ") &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ kind: "p", text: buf.join(" ") });
  }
  return { blocks, raw: md };
}

// --- document components ----------------------------------------------------

function Footer({ page }: { page: number }) {
  return (
    <View style={styles.footer} fixed>
      <Text>Page {page}</Text>
    </View>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "h1":
      return <Text style={styles.h1}>{inline(block.text)}</Text>;
    case "h2":
      return <Text style={styles.h2}>{inline(block.text)}</Text>;
    case "h3":
      return <Text style={styles.h3}>{inline(block.text)}</Text>;
    case "p":
      return <Text style={styles.p}>{inline(block.text)}</Text>;
    case "ul":
      return (
        <View>
          {block.items.map((it, idx) => (
            <View key={idx} style={styles.bulletItem}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{inline(it)}</Text>
            </View>
          ))}
        </View>
      );
    case "ol":
      return (
        <View>
          {block.items.map((it, idx) => (
            <View key={idx} style={styles.numItem}>
              <Text style={styles.numLabel}>{idx + 1}.</Text>
              <Text style={styles.bulletText}>{inline(it)}</Text>
            </View>
          ))}
        </View>
      );
    case "quote":
      return (
        <View style={styles.panel}>
          <Text>{inline(block.text)}</Text>
        </View>
      );
    case "hr":
      return <View style={styles.rule} />;
  }
}

function ScreenshotPage({
  src,
  caption,
  pageNumber,
}: {
  src: string;
  caption: string;
  pageNumber: number;
}) {
  return (
    <Page size="A4" orientation="landscape" style={styles.pageLandscape}>
      <View style={{ width: 483, alignSelf: "center" }}>
        <Image src={src} style={styles.image} />
        <Text style={styles.caption}>{caption}</Text>
      </View>
      <Footer page={pageNumber + 1} />
    </Page>
  );
}

function Doc({ blocks }: { blocks: Block[] }) {
  return (
    <Page size="A4" style={styles.page}>
      {blocks.map((b, idx) => (
        <View key={idx} style={idx === 0 ? { marginTop: 12 } : undefined}>
          <BlockView block={b} />
        </View>
      ))}
      <Footer page={1} />
    </Page>
  );
}

// --- main -------------------------------------------------------------------

async function main() {
  const md = await fs.readFile(MD_PATH, "utf8");
  const { blocks } = parseMarkdown(md);

  const doc = (
    <Document
      title="Google Ads API Access Application"
      author="Optimise Digital"
      subject="Google Ads API developer token application"
    >
      <Doc blocks={blocks} />
      <ScreenshotPage
        src={path.join(IMAGES_DIR, "01-dashboard.png")}
        caption="The Google Ads dashboard, as it appears to our team and to clients on a PIN gated link. KPI tiles, monthly performance, conversion split, and top campaign table, served from the CMS database synced from the Google Ads API."
        pageNumber={1}
      />
      <ScreenshotPage
        src={path.join(IMAGES_DIR, "02-account-structure.png")}
        caption="The account structure view, showing a drill down from customer to campaign to ad group to keyword, with health coded rows derived from CPA thresholds."
        pageNumber={2}
      />
      <ScreenshotPage
        src={path.join(IMAGES_DIR, "03-ad-copy.png")}
        caption="The ad copy editor. Generated RSA headlines per ad group, live Google Ads preview, and a PIN gated publish toggle whose deploy calls AdGroupAdService."
        pageNumber={3}
      />
    </Document>
  );

  await renderToFile(doc, OUT_PATH);
  const stat = await fs.stat(OUT_PATH);
  console.log(`Wrote ${OUT_PATH} (${(stat.size / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
