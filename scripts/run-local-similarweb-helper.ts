import { chromium, type BrowserContext } from "playwright";

const CMS_URL = (process.env.CMS_URL || "https://cms.optimisedigital.online").replace(/\/$/, "");
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const POLL_MS = Number(process.env.SIMILARWEB_POLL_MS || 15_000);
const HEADLESS = process.env.SIMILARWEB_HEADLESS === "true";
const USER_DATA_DIR = process.env.SIMILARWEB_CHROME_USER_DATA_DIR;

type TrafficJob = {
  proposalId: string | number;
  competitorAnalysisId: string | number | null;
  jobId: string;
  domains: Array<{ key: string; domain: string; source?: string }>;
};

type HelperResult = {
  key: string;
  domain: string;
  payload?: unknown;
  traffic?: unknown;
  status: "available" | "unavailable" | "failed";
  unavailableReason?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function claimNextJob(): Promise<TrafficJob | null> {
  const res = await fetch(`${CMS_URL}/api/proposal-traffic-jobs/next`, {
    headers: { "x-internal-key": INTERNAL_API_KEY! },
  });
  if (!res.ok) throw new Error(`CMS job poll failed: ${res.status}`);
  const data = await res.json();
  return data?.job ?? null;
}

async function postComplete(jobId: string, results: HelperResult[]) {
  const res = await fetch(`${CMS_URL}/api/proposal-traffic-jobs/${encodeURIComponent(jobId)}/complete`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-key": INTERNAL_API_KEY!,
    },
    body: JSON.stringify({ results }),
  });
  if (!res.ok) throw new Error(`CMS job complete failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function createContext(): Promise<BrowserContext> {
  const launchOptions = { headless: HEADLESS, channel: "chrome" as const };
  if (USER_DATA_DIR) return chromium.launchPersistentContext(USER_DATA_DIR, launchOptions);
  return chromium.launchPersistentContext(".similarweb-chrome-profile", launchOptions);
}

async function fetchDirect(context: BrowserContext, domain: string): Promise<unknown | null> {
  const page = await context.newPage();
  try {
    const response = await page.goto(`https://data.similarweb.com/api/v1/data?domain=${encodeURIComponent(domain)}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    if (!response?.ok()) return null;
    const text = await page.locator("body").innerText({ timeout: 10_000 });
    return JSON.parse(text);
  } catch {
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

async function fetchViaWebsiteXhr(context: BrowserContext, domain: string): Promise<unknown | null> {
  const page = await context.newPage();
  try {
    const dataPromise = page.waitForResponse(
      (response) => response.url().includes("data.similarweb.com/api/v1/data") && response.url().includes(domain),
      { timeout: 60_000 },
    );
    await page.goto(`https://www.similarweb.com/website/${encodeURIComponent(domain)}/`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const response = await dataPromise;
    if (!response.ok()) return null;
    return response.json();
  } catch {
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

async function fetchSimilarWeb(context: BrowserContext, item: { key: string; domain: string }): Promise<HelperResult> {
  const payload = await fetchDirect(context, item.domain) ?? await fetchViaWebsiteXhr(context, item.domain);
  if (!payload) {
    return { key: item.key, domain: item.domain, status: "unavailable", unavailableReason: "blocked" };
  }
  return { key: item.key, domain: item.domain, status: "available", payload };
}

async function runJob(context: BrowserContext, job: TrafficJob) {
  console.log(`Job ${job.jobId}: fetching ${job.domains.length} domain(s)`);
  const results: HelperResult[] = [];
  for (const item of job.domains) {
    console.log(`Fetching ${item.domain}`);
    results.push(await fetchSimilarWeb(context, item));
  }
  const summary = await postComplete(job.jobId, results);
  const available = results.filter((result) => result.status === "available").length;
  console.log(`Job ${job.jobId}: complete (${available} available, ${results.length - available} unavailable)`, summary?.warnings ?? []);
}

async function main() {
  if (!INTERNAL_API_KEY) throw new Error("Missing INTERNAL_API_KEY");
  console.log(`Local SimilarWeb helper polling ${CMS_URL} every ${Math.round(POLL_MS / 1000)}s`);
  const context = await createContext();
  process.on("SIGINT", () => {
    context.close().finally(() => process.exit(0));
  });

  while (true) {
    try {
      const job = await claimNextJob();
      if (job) await runJob(context, job);
    } catch (error: any) {
      console.error(`Helper error: ${error?.message || error}`);
    }
    await sleep(POLL_MS);
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
