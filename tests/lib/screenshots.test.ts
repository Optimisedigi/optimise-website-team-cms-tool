vi.mock("@/lib/scrapling-service", () => ({
  captureScreenshotViaScrapling: vi.fn(),
}));

vi.mock("@/lib/blob-upload", () => ({
  uploadScreenshotToBlob: vi.fn(),
}));

import {
  captureWebsiteScreenshot,
  captureScreenshotViaGrowthTools,
  captureScreenshotViaScreenshotOne,
  captureAndUploadScreenshot,
} from "@/lib/screenshots";
import { captureScreenshotViaScrapling } from "@/lib/scrapling-service";
import { uploadScreenshotToBlob } from "@/lib/blob-upload";

const mockScrapling = vi.mocked(captureScreenshotViaScrapling);
const mockBlobUpload = vi.mocked(uploadScreenshotToBlob);

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = vi.fn();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GOOGLE_PAGESPEED_API_KEY;
  delete process.env.GROWTH_TOOLS_URL;
  delete process.env.INTERNAL_API_KEY;
  delete process.env.SCREENSHOTONE_ACCESS_KEY;
});

// ---------------------------------------------------------------------------
// captureWebsiteScreenshot (PageSpeed)
// ---------------------------------------------------------------------------

describe("captureWebsiteScreenshot", () => {
  function makePageSpeedResponse(screenshotData: string) {
    return {
      ok: true,
      json: vi.fn().mockResolvedValue({
        lighthouseResult: {
          audits: {
            "final-screenshot": {
              details: { data: screenshotData },
            },
          },
        },
      }),
    };
  }

  it("returns base64 screenshot on success", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makePageSpeedResponse("data:image/jpeg;base64,abc123"));
    globalThis.fetch = mockFetch;

    const result = await captureWebsiteScreenshot("https://example.com");
    expect(result).toBe("abc123");
  });

  it("strips data URI prefix from screenshot", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makePageSpeedResponse("data:image/png;base64,xyz"));
    globalThis.fetch = mockFetch;

    const result = await captureWebsiteScreenshot("https://example.com");
    expect(result).toBe("xyz");
  });

  it("prepends https:// when url has no protocol", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makePageSpeedResponse("data:image/png;base64,ok"));
    globalThis.fetch = mockFetch;

    await captureWebsiteScreenshot("example.com");

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain(encodeURIComponent("https://example.com"));
  });

  it("includes API key when GOOGLE_PAGESPEED_API_KEY is set", async () => {
    process.env.GOOGLE_PAGESPEED_API_KEY = "test-key";
    const mockFetch = vi.fn().mockResolvedValue(makePageSpeedResponse("data:image/png;base64,ok"));
    globalThis.fetch = mockFetch;

    await captureWebsiteScreenshot("https://example.com");

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("&key=test-key");
  });

  it("omits key param when GOOGLE_PAGESPEED_API_KEY is not set", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makePageSpeedResponse("data:image/png;base64,ok"));
    globalThis.fetch = mockFetch;

    await captureWebsiteScreenshot("https://example.com");

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain("&key=");
  });

  it("tries www variant when url has no www", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: vi.fn() }) // desktop, no-www, attempt 0
      .mockResolvedValueOnce({ ok: false, json: vi.fn() }) // desktop, no-www, attempt 1
      .mockResolvedValueOnce(makePageSpeedResponse("data:image/png;base64,found")); // desktop, www, attempt 0

    globalThis.fetch = mockFetch;

    const result = await captureWebsiteScreenshot("https://example.com");
    expect(result).toBe("found");

    const thirdUrl = mockFetch.mock.calls[2][0] as string;
    expect(thirdUrl).toContain(encodeURIComponent("https://www.example.com"));
  });

  it("tries non-www variant when url has www", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: vi.fn() }) // desktop, www, attempt 0
      .mockResolvedValueOnce({ ok: false, json: vi.fn() }) // desktop, www, attempt 1
      .mockResolvedValueOnce(makePageSpeedResponse("data:image/png;base64,found")); // desktop, non-www, attempt 0

    globalThis.fetch = mockFetch;

    const result = await captureWebsiteScreenshot("https://www.example.com");
    expect(result).toBe("found");

    const thirdUrl = mockFetch.mock.calls[2][0] as string;
    expect(thirdUrl).toContain(encodeURIComponent("https://example.com"));
  });

  it("returns null when all attempts fail with non-ok response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, json: vi.fn() });
    globalThis.fetch = mockFetch;

    const result = await captureWebsiteScreenshot("https://example.com");
    expect(result).toBeNull();
  });

  it("returns null when screenshot field is missing from response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ lighthouseResult: { audits: {} } }),
    });
    globalThis.fetch = mockFetch;

    const result = await captureWebsiteScreenshot("https://example.com");
    expect(result).toBeNull();
  });

  it("returns null when screenshot is not a string", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        lighthouseResult: {
          audits: {
            "final-screenshot": { details: { data: 12345 } },
          },
        },
      }),
    });
    globalThis.fetch = mockFetch;

    const result = await captureWebsiteScreenshot("https://example.com");
    expect(result).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    globalThis.fetch = mockFetch;

    const result = await captureWebsiteScreenshot("https://example.com");
    expect(result).toBeNull();
  });

  it("retries each variant up to 2 times", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("timeout"));
    globalThis.fetch = mockFetch;

    await captureWebsiteScreenshot("https://example.com");

    // 2 strategies (desktop, mobile) x 2 variants (with/without www) x 2 attempts = 8
    expect(mockFetch).toHaveBeenCalledTimes(8);
  });
});

// ---------------------------------------------------------------------------
// captureScreenshotViaGrowthTools
// ---------------------------------------------------------------------------

describe("captureScreenshotViaGrowthTools", () => {
  it("returns null when GROWTH_TOOLS_URL is not set", async () => {
    delete process.env.GROWTH_TOOLS_URL;
    process.env.INTERNAL_API_KEY = "key";

    const result = await captureScreenshotViaGrowthTools("https://example.com");
    expect(result).toBeNull();
  });

  it("returns null when INTERNAL_API_KEY is not set", async () => {
    process.env.GROWTH_TOOLS_URL = "https://tools.test";
    delete process.env.INTERNAL_API_KEY;

    const result = await captureScreenshotViaGrowthTools("https://example.com");
    expect(result).toBeNull();
  });

  it("returns base64 screenshot on success", async () => {
    process.env.GROWTH_TOOLS_URL = "https://tools.test";
    process.env.INTERNAL_API_KEY = "key";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ screenshot: "data:image/png;base64,imgdata" }),
    });
    globalThis.fetch = mockFetch;

    const result = await captureScreenshotViaGrowthTools("https://example.com");
    expect(result).toBe("imgdata");
  });

  it("prepends https:// when url has no protocol", async () => {
    process.env.GROWTH_TOOLS_URL = "https://tools.test";
    process.env.INTERNAL_API_KEY = "key";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ screenshot: "data:image/png;base64,ok" }),
    });
    globalThis.fetch = mockFetch;

    await captureScreenshotViaGrowthTools("example.com");

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("url=https%3A%2F%2Fexample.com");
  });

  it("passes clickSelector and scripts as query params", async () => {
    process.env.GROWTH_TOOLS_URL = "https://tools.test";
    process.env.INTERNAL_API_KEY = "key";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ screenshot: "base64data" }),
    });
    globalThis.fetch = mockFetch;

    await captureScreenshotViaGrowthTools("https://example.com", {
      clickSelector: "#enter",
      scripts: "document.querySelector('.popup').remove()",
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("click=%23enter");
    expect(calledUrl).toContain("scripts=");
  });

  it("sends x-internal-key header", async () => {
    process.env.GROWTH_TOOLS_URL = "https://tools.test";
    process.env.INTERNAL_API_KEY = "my-secret";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ screenshot: "ok" }),
    });
    globalThis.fetch = mockFetch;

    await captureScreenshotViaGrowthTools("https://example.com");

    const options = mockFetch.mock.calls[0][1] as RequestInit;
    expect((options.headers as Record<string, string>)["x-internal-key"]).toBe("my-secret");
  });

  it("returns null when response is not ok", async () => {
    process.env.GROWTH_TOOLS_URL = "https://tools.test";
    process.env.INTERNAL_API_KEY = "key";

    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    globalThis.fetch = mockFetch;

    const result = await captureScreenshotViaGrowthTools("https://example.com");
    expect(result).toBeNull();
  });

  it("returns null when screenshot field is missing", async () => {
    process.env.GROWTH_TOOLS_URL = "https://tools.test";
    process.env.INTERNAL_API_KEY = "key";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    });
    globalThis.fetch = mockFetch;

    const result = await captureScreenshotViaGrowthTools("https://example.com");
    expect(result).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    process.env.GROWTH_TOOLS_URL = "https://tools.test";
    process.env.INTERNAL_API_KEY = "key";

    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    globalThis.fetch = mockFetch;

    const result = await captureScreenshotViaGrowthTools("https://example.com");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// captureScreenshotViaScreenshotOne
// ---------------------------------------------------------------------------

describe("captureScreenshotViaScreenshotOne", () => {
  it("returns null when SCREENSHOTONE_ACCESS_KEY is not set", async () => {
    delete process.env.SCREENSHOTONE_ACCESS_KEY;

    const result = await captureScreenshotViaScreenshotOne("https://example.com");
    expect(result).toBeNull();
  });

  it("returns base64 from arrayBuffer on success", async () => {
    process.env.SCREENSHOTONE_ACCESS_KEY = "ak-123";

    const imageData = "a".repeat(200);
    const arrayBuffer = new TextEncoder().encode(imageData).buffer;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(arrayBuffer),
    });
    globalThis.fetch = mockFetch;

    const result = await captureScreenshotViaScreenshotOne("https://example.com");
    expect(result).toBe(Buffer.from(arrayBuffer).toString("base64"));
  });

  it("prepends https:// when url has no protocol", async () => {
    process.env.SCREENSHOTONE_ACCESS_KEY = "ak-123";

    const imageData = Buffer.alloc(200, "x");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(imageData.buffer.slice(imageData.byteOffset, imageData.byteOffset + imageData.byteLength)),
    });
    globalThis.fetch = mockFetch;

    await captureScreenshotViaScreenshotOne("example.com");

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("url=https%3A%2F%2Fexample.com");
  });

  it("passes click and scripts options as query params", async () => {
    process.env.SCREENSHOTONE_ACCESS_KEY = "ak-123";

    const imageData = Buffer.alloc(200, "x");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(imageData.buffer.slice(imageData.byteOffset, imageData.byteOffset + imageData.byteLength)),
    });
    globalThis.fetch = mockFetch;

    await captureScreenshotViaScreenshotOne("https://example.com", {
      clickSelector: "#btn",
      scripts: "console.log('hi')",
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("click=%23btn");
    expect(calledUrl).toContain("scripts=");
  });

  it("returns null when response is not ok", async () => {
    process.env.SCREENSHOTONE_ACCESS_KEY = "ak-123";

    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    globalThis.fetch = mockFetch;

    const result = await captureScreenshotViaScreenshotOne("https://example.com");
    expect(result).toBeNull();
  });

  it("returns null when response buffer is too small", async () => {
    process.env.SCREENSHOTONE_ACCESS_KEY = "ak-123";

    const tinyBuffer = Buffer.alloc(50);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(tinyBuffer.buffer.slice(tinyBuffer.byteOffset, tinyBuffer.byteOffset + tinyBuffer.byteLength)),
    });
    globalThis.fetch = mockFetch;

    const result = await captureScreenshotViaScreenshotOne("https://example.com");
    expect(result).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    process.env.SCREENSHOTONE_ACCESS_KEY = "ak-123";

    const mockFetch = vi.fn().mockRejectedValue(new Error("Connection refused"));
    globalThis.fetch = mockFetch;

    const result = await captureScreenshotViaScreenshotOne("https://example.com");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// captureAndUploadScreenshot (orchestrator)
// ---------------------------------------------------------------------------

describe("captureAndUploadScreenshot", () => {
  it("returns blob URL when scrapling and blob upload both succeed", async () => {
    const buffer = Buffer.from("screenshot-data");
    mockScrapling.mockResolvedValue(buffer);
    mockBlobUpload.mockResolvedValue("https://blob.vercel-storage.com/shot.png");

    const result = await captureAndUploadScreenshot("https://example.com");

    expect(result).toBe("https://blob.vercel-storage.com/shot.png");
    expect(mockScrapling).toHaveBeenCalledWith("https://example.com", {
      clickSelector: undefined,
    });
    expect(mockBlobUpload).toHaveBeenCalledWith(buffer, "https://example.com");
  });

  it("passes clickSelector to scrapling", async () => {
    mockScrapling.mockResolvedValue(Buffer.from("img"));
    mockBlobUpload.mockResolvedValue("https://blob.vercel-storage.com/shot.png");

    await captureAndUploadScreenshot("https://example.com", {
      clickSelector: "#age-gate",
    });

    expect(mockScrapling).toHaveBeenCalledWith("https://example.com", {
      clickSelector: "#age-gate",
    });
  });

  it("returns base64 from scrapling buffer when blob upload fails", async () => {
    const buffer = Buffer.from("screenshot-data");
    mockScrapling.mockResolvedValue(buffer);
    mockBlobUpload.mockResolvedValue(null);

    const result = await captureAndUploadScreenshot("https://example.com");

    expect(result).toBe(buffer.toString("base64"));
  });

  it("falls back to PageSpeed when scrapling returns null", async () => {
    mockScrapling.mockResolvedValue(null);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        lighthouseResult: {
          audits: {
            "final-screenshot": {
              details: { data: "data:image/png;base64,pagespeed-result" },
            },
          },
        },
      }),
    });
    globalThis.fetch = mockFetch;

    const result = await captureAndUploadScreenshot("https://example.com");

    expect(result).toBe("pagespeed-result");
    expect(mockBlobUpload).not.toHaveBeenCalled();
  });

  it("returns null when both scrapling and PageSpeed fail", async () => {
    mockScrapling.mockResolvedValue(null);

    const mockFetch = vi.fn().mockResolvedValue({ ok: false, json: vi.fn() });
    globalThis.fetch = mockFetch;

    const result = await captureAndUploadScreenshot("https://example.com");

    expect(result).toBeNull();
  });
});
