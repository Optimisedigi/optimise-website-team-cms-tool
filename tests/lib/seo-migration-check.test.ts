import {
  originFromSiteUrl,
  normalizePath,
  classifyDestination,
  looksLikeSoft404,
  buildComparisonWindows,
  buildChecklist,
  type RedirectTrace,
} from "@/lib/seo-migration-check";

const ORIGIN = "https://example.com";

function trace(partial: Partial<RedirectTrace>): RedirectTrace {
  return {
    oldUrl: "https://example.com/old",
    finalUrl: "https://example.com/new",
    finalStatus: 200,
    hops: 1,
    firstHopStatus: 301,
    permanent: true,
    classification: "equivalent",
    impressions: 0,
    clicks: 0,
    ...partial,
  };
}

describe("originFromSiteUrl", () => {
  it("expands sc-domain properties to an https origin", () => {
    expect(originFromSiteUrl("sc-domain:example.com")).toBe("https://example.com");
  });
  it("strips trailing slashes from URL properties", () => {
    expect(originFromSiteUrl("https://example.com/")).toBe("https://example.com");
  });
});

describe("normalizePath", () => {
  it("drops a trailing slash and lowercases", () => {
    expect(normalizePath("https://example.com/About-Us/")).toBe("/about-us");
  });
  it("keeps the root slash", () => {
    expect(normalizePath("https://example.com/")).toBe("/");
  });
});

describe("classifyDestination", () => {
  it("treats a same-path trailing-slash normalisation as equivalent", () => {
    expect(
      classifyDestination({
        oldUrl: "https://example.com/faq/",
        finalUrl: "https://example.com/faq",
        finalStatus: 200,
        origin: ORIGIN,
        isSoft404: false,
      }),
    ).toBe("equivalent");
  });

  it("flags a content URL collapsing onto the homepage", () => {
    expect(
      classifyDestination({
        oldUrl: "https://example.com/for-patients/",
        finalUrl: "https://example.com/",
        finalStatus: 200,
        origin: ORIGIN,
        isSoft404: false,
      }),
    ).toBe("homepage-collapse");
  });

  it("flags a content URL collapsing onto a section index", () => {
    expect(
      classifyDestination({
        oldUrl: "https://example.com/sativa-vs-indica/",
        finalUrl: "https://example.com/blog",
        finalStatus: 200,
        origin: ORIGIN,
        isSoft404: false,
      }),
    ).toBe("index-collapse");
  });

  it("treats a soft-404 as not-found even on a 200", () => {
    expect(
      classifyDestination({
        oldUrl: "https://example.com/gone/",
        finalUrl: "https://example.com/gone",
        finalStatus: 200,
        origin: ORIGIN,
        isSoft404: true,
      }),
    ).toBe("not-found");
  });

  it("classifies a real 404 as not-found", () => {
    expect(
      classifyDestination({
        oldUrl: "https://example.com/gone/",
        finalUrl: "https://example.com/gone",
        finalStatus: 404,
        origin: ORIGIN,
        isSoft404: false,
      }),
    ).toBe("not-found");
  });

  it("treats a distinct live page as ok-200", () => {
    expect(
      classifyDestination({
        oldUrl: "https://example.com/about-us/",
        finalUrl: "https://example.com/about",
        finalStatus: 200,
        origin: ORIGIN,
        isSoft404: false,
      }),
    ).toBe("ok-200");
  });
});

describe("looksLikeSoft404", () => {
  const baseline = { is200Catchall: true, size: 26000, title: "Home | Example" };

  it("detects a catch-all by identical generic title", () => {
    expect(
      looksLikeSoft404({ status: 200, size: 31000, title: "Home | Example" }, baseline),
    ).toBe(true);
  });

  it("detects a catch-all by near-identical body size", () => {
    expect(
      looksLikeSoft404({ status: 200, size: 26200, title: "Different" }, baseline),
    ).toBe(true);
  });

  it("does not flag a real article with a distinct title and size", () => {
    expect(
      looksLikeSoft404({ status: 200, size: 67000, title: "Quit Smoking Timeline" }, baseline),
    ).toBe(false);
  });

  it("never flags when the origin returns real 404s", () => {
    expect(
      looksLikeSoft404(
        { status: 200, size: 26000, title: "Home | Example" },
        { is200Catchall: false, size: 0, title: "" },
      ),
    ).toBe(false);
  });
});

describe("buildComparisonWindows", () => {
  it("builds matched-length before/after windows honouring GSC lag", () => {
    const now = new Date("2026-05-31T00:00:00Z");
    const w = buildComparisonWindows("2026-05-23", now);
    // After: cutover → now-3 days (2026-05-28)
    expect(w.after[0]).toBe("2026-05-23");
    expect(w.after[1]).toBe("2026-05-28");
    expect(w.windowDays).toBe(5);
    // Before window ends the day before cutover and matches length.
    expect(w.before[1]).toBe("2026-05-22");
    expect(w.before[0]).toBe("2026-05-17");
  });
});

describe("buildChecklist", () => {
  const baseCtx = {
    origin: ORIGIN,
    isDomainMove: false,
    redirects: [] as RedirectTrace[],
    performance: null,
    robotsText: "User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml",
    sitemapUrls: ["https://example.com/", "https://example.com/about"],
    soft404Baseline: { is200Catchall: false, size: 100, title: "404" },
    cwv: { cwvMobile: { lcp: 2000 }, cwvDesktop: { lcp: 1800 } },
    windows: { before: ["2026-05-17", "2026-05-22"] as [string, string], after: ["2026-05-23", "2026-05-28"] as [string, string], windowDays: 5 },
  };

  it("fails the equivalence check when redirects collapse to the homepage", () => {
    const items = buildChecklist({
      ...baseCtx,
      redirects: [trace({ classification: "homepage-collapse", impressions: 149 })],
    });
    const equiv = items.find((i) => i.id === "redirects-equivalence");
    expect(equiv?.status).toBe("fail");
  });

  it("fails the soft-404 check when unknown URLs return 200", () => {
    const items = buildChecklist({
      ...baseCtx,
      soft404Baseline: { is200Catchall: true, size: 26000, title: "Home" },
    });
    const soft = items.find((i) => i.id === "indexing-soft404-catchall");
    expect(soft?.status).toBe("fail");
  });

  it("marks Change of Address not-applicable for same-domain moves", () => {
    const items = buildChecklist(baseCtx);
    const coa = items.find((i) => i.id === "process-change-of-address");
    expect(coa?.status).toBe("not-applicable");
  });

  it("marks Change of Address advisory for domain moves", () => {
    const items = buildChecklist({ ...baseCtx, isDomainMove: true });
    const coa = items.find((i) => i.id === "process-change-of-address");
    expect(coa?.status).toBe("advisory");
  });

  it("flags a poor mobile LCP", () => {
    const items = buildChecklist({ ...baseCtx, cwv: { cwvMobile: { lcp: 5900 }, cwvDesktop: { lcp: 3000 } } });
    const cwv = items.find((i) => i.id === "technical-cwv");
    expect(cwv?.status).toBe("fail");
  });

  it("fails robots when a site-wide disallow is present", () => {
    const items = buildChecklist({ ...baseCtx, robotsText: "User-agent: *\nDisallow: /\n" });
    const robots = items.find((i) => i.id === "indexing-robots");
    expect(robots?.status).toBe("fail");
  });

  it("passes performance when clicks are up vs pre-cutover", () => {
    const items = buildChecklist({
      ...baseCtx,
      performance: {
        before: { clicks: 92, impressions: 4104, ctr: 2.2, position: 10.9 },
        after: { clicks: 103, impressions: 3394, ctr: 3.0, position: 8.3 },
        windowDays: 5,
        clicksChangePct: 12,
        impressionsChangePct: -17,
        positionDelta: -2.6,
        pageWinners: [],
        pageLosers: [],
        queryWinners: [],
        queryLosers: [],
        brandClicks: null,
        nonBrandClicks: null,
      },
    });
    const perf = items.find((i) => i.id === "performance-trend");
    expect(perf?.status).toBe("pass");
  });

  it("fails performance when clicks drop beyond the investigation threshold", () => {
    const items = buildChecklist({
      ...baseCtx,
      performance: {
        before: { clicks: 100, impressions: 1000, ctr: 1, position: 5 },
        after: { clicks: 50, impressions: 800, ctr: 1, position: 9 },
        windowDays: 5,
        clicksChangePct: -50,
        impressionsChangePct: -20,
        positionDelta: 4,
        pageWinners: [],
        pageLosers: [],
        queryWinners: [],
        queryLosers: [],
        brandClicks: null,
        nonBrandClicks: null,
      },
    });
    const perf = items.find((i) => i.id === "performance-trend");
    expect(perf?.status).toBe("fail");
  });
});
