import { getPayload } from "payload";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import config from "@/payload.config";
import EditablePresentation from "./EditablePresentation";

export const dynamic = "force-dynamic";

type ContentCluster = {
  label: string;
  questions: { question: string; source: string; modifier: string; searchVolume: number | null }[];
};

function domainFromUrl(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  }
}

export default async function ProposalEditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  // Auth check — redirect to admin login if not authenticated
  const headersList = await headers();
  const { user } = await payload.auth({ headers: headersList });
  if (!user) redirect("/admin/login");

  // Fetch proposal
  const result = await payload.find({
    collection: "client-proposals",
    where: { slug: { equals: slug } },
    depth: 2,
    limit: 1,
    overrideAccess: true,
  });
  const proposal = result.docs[0] as any;
  if (!proposal) notFound();

  // Fetch related data for sidebar toggles
  const [kwResult, compResult, crResult] = await Promise.all([
    payload.find({
      collection: "keyword-snapshots",
      where: { proposal: { equals: proposal.id } },
      sort: "-createdAt",
      limit: 1,
      overrideAccess: true,
    }),
    payload.find({
      collection: "competitor-analyses",
      where: { proposal: { equals: proposal.id } },
      sort: "-createdAt",
      limit: 1,
      overrideAccess: true,
    }),
    payload.find({
      collection: "content-researches",
      where: { proposal: { equals: proposal.id } },
      sort: "-createdAt",
      limit: 10,
      overrideAccess: true,
    }),
  ]);

  const kwSnapshot = kwResult.docs[0] as any;
  const compAnalysis = compResult.docs[0] as any;
  const contentResearches = crResult.docs as any[];

  // Build competitor list: API competitors + CMS-added competitors
  const allDomains: string[] = [];
  const seenDomains = new Set<string>();

  // Client's own domain
  const clientDomain = domainFromUrl(proposal.websiteUrl);

  // API competitors
  if (compAnalysis?.competitors) {
    for (const c of compAnalysis.competitors as { domain?: string }[]) {
      const d = c.domain?.replace(/^www\./, "") ?? "";
      if (d && d !== clientDomain && !seenDomains.has(d)) {
        seenDomains.add(d);
        allDomains.push(d);
      }
    }
  }

  // CMS-added competitors
  if (proposal.competitors) {
    for (const c of proposal.competitors as { websiteUrl?: string }[]) {
      if (!c.websiteUrl) continue;
      const d = domainFromUrl(c.websiteUrl);
      if (d && d !== clientDomain && !seenDomains.has(d)) {
        seenDomains.add(d);
        allDomains.push(d);
      }
    }
  }

  // Build keyword list from categories or snapshot
  const keywordCategories = proposal.keywordCategories as
    | { categoryName: string; keywords: string }[]
    | null;
  const snapshotKeywords = (kwSnapshot?.keywords as { keyword: string; searchVolume: number }[]) ?? [];
  const kwLookup = new Map<string, number>();
  for (const kw of snapshotKeywords) {
    kwLookup.set(kw.keyword.toLowerCase(), kw.searchVolume ?? 0);
  }

  type KeywordItem = { keyword: string; searchVolume: number; category: string };
  const allKeywords: KeywordItem[] = [];

  if (keywordCategories && keywordCategories.length > 0) {
    for (const cat of keywordCategories) {
      const names = (cat.keywords || "")
        .split("\n")
        .map((k) => k.trim())
        .filter(Boolean);
      for (const name of names) {
        allKeywords.push({
          keyword: name,
          searchVolume: kwLookup.get(name.toLowerCase()) ?? 0,
          category: cat.categoryName,
        });
      }
    }
  } else {
    for (const kw of snapshotKeywords) {
      allKeywords.push({ keyword: kw.keyword, searchVolume: kw.searchVolume, category: "Keywords" });
    }
  }

  // Build content research questions
  type QuestionItem = { question: string; cluster: string; crKeyword: string };
  const allQuestions: QuestionItem[] = [];
  const seenCrKeywords = new Set<string>();
  for (const cr of contentResearches) {
    const key = (cr.keyword as string).toLowerCase();
    if (seenCrKeywords.has(key)) continue;
    seenCrKeywords.add(key);
    for (const cluster of (cr.clusters as ContentCluster[]) ?? []) {
      for (const q of cluster.questions) {
        allQuestions.push({
          question: q.question,
          cluster: cluster.label,
          crKeyword: cr.keyword as string,
        });
      }
    }
  }

  return (
    <EditablePresentation
      proposalId={String(proposal.id)}
      slug={slug}
      businessName={proposal.businessName}
      competitors={allDomains}
      keywords={allKeywords}
      contentQuestions={allQuestions}
      excludedCompetitorDomains={
        Array.isArray(proposal.excludedCompetitorDomains)
          ? proposal.excludedCompetitorDomains
          : []
      }
      excludedKeywords={
        Array.isArray(proposal.excludedKeywords) ? proposal.excludedKeywords : []
      }
      excludedContentQuestions={
        Array.isArray(proposal.excludedContentQuestions)
          ? proposal.excludedContentQuestions
          : []
      }
      slideNotes={
        proposal.slideNotes && typeof proposal.slideNotes === "object"
          ? proposal.slideNotes
          : {}
      }
    />
  );
}
