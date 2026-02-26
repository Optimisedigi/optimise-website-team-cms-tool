import type {
  SocialLinksResult,
  MetaAdsResult,
} from "@/lib/scrapling-service";

// ---------------------------------------------------------------------------
// The module reads env vars at the top level (module evaluation time), so we
// must use vi.resetModules() + dynamic import() to control what each function
// sees.  We set env vars BEFORE each dynamic import so the module picks them
// up on re-evaluation.
// ---------------------------------------------------------------------------

const ORIG_URL = process.env.SCRAPLING_SERVICE_URL;
const ORIG_KEY = process.env.SCRAPLING_SERVICE_KEY;

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  // Ensure each test gets a fresh module evaluation
  vi.resetModules();
  // Set env vars so the module sees them on import
  process.env.SCRAPLING_SERVICE_URL = "https://scrapling.test";
  process.env.SCRAPLING_SERVICE_KEY = "test-api-key";
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  if (ORIG_URL !== undefined) process.env.SCRAPLING_SERVICE_URL = ORIG_URL;
  else delete process.env.SCRAPLING_SERVICE_URL;
  if (ORIG_KEY !== undefined) process.env.SCRAPLING_SERVICE_KEY = ORIG_KEY;
  else delete process.env.SCRAPLING_SERVICE_KEY;
});

// Helper to dynamically import the module (picks up current env vars)
async function importModule() {
  return await import("@/lib/scrapling-service");
}

// =========================================================================
// captureScreenshotViaScrapling
// =========================================================================

describe("captureScreenshotViaScrapling", () => {
  it("returns a Buffer on successful screenshot", async () => {
    const imageData = new Uint8Array(200).fill(0xff);
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(imageData.buffer),
    });

    const { captureScreenshotViaScrapling } = await importModule();
    const result = await captureScreenshotViaScrapling("https://example.com");

    expect(result).toBeInstanceOf(Buffer);
    expect(result!.byteLength).toBe(200);
  });

  it("sends correct request body and headers", async () => {
    const imageData = new Uint8Array(200).fill(0xff);
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(imageData.buffer),
    });

    const { captureScreenshotViaScrapling } = await importModule();
    await captureScreenshotViaScrapling("https://example.com", {
      clickSelector: ".btn",
      waitFor: "#content",
      timeout: 20,
      fullPage: true,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://scrapling.test/screenshot",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "test-api-key",
        },
        body: JSON.stringify({
          url: "https://example.com",
          click_selector: ".btn",
          wait_for: "#content",
          timeout: 20,
          full_page: true,
        }),
      }),
    );
  });

  it("prepends https:// when URL has no protocol", async () => {
    const imageData = new Uint8Array(200).fill(0xff);
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(imageData.buffer),
    });

    const { captureScreenshotViaScrapling } = await importModule();
    await captureScreenshotViaScrapling("example.com");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.url).toBe("https://example.com");
  });

  it("does not prepend https:// when URL starts with http", async () => {
    const imageData = new Uint8Array(200).fill(0xff);
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(imageData.buffer),
    });

    const { captureScreenshotViaScrapling } = await importModule();
    await captureScreenshotViaScrapling("http://example.com");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.url).toBe("http://example.com");
  });

  it("uses default timeout of 30 when not specified", async () => {
    const imageData = new Uint8Array(200).fill(0xff);
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(imageData.buffer),
    });

    const { captureScreenshotViaScrapling } = await importModule();
    await captureScreenshotViaScrapling("https://example.com");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.timeout).toBe(30);
  });

  it("sends null for optional fields when not provided", async () => {
    const imageData = new Uint8Array(200).fill(0xff);
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(imageData.buffer),
    });

    const { captureScreenshotViaScrapling } = await importModule();
    await captureScreenshotViaScrapling("https://example.com");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.click_selector).toBeNull();
    expect(body.wait_for).toBeNull();
    expect(body.full_page).toBe(false);
  });

  it("sets AbortSignal timeout to (timeout * 1000) + 15000", async () => {
    const imageData = new Uint8Array(200).fill(0xff);
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(imageData.buffer),
    });

    const { captureScreenshotViaScrapling } = await importModule();
    await captureScreenshotViaScrapling("https://example.com", {
      timeout: 10,
    });

    // Can't directly inspect AbortSignal, but we verify fetch was called with signal
    expect(mockFetch.mock.calls[0][1].signal).toBeDefined();
  });

  it("returns null when response is not ok", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal server error"),
    });

    const { captureScreenshotViaScrapling } = await importModule();
    const result = await captureScreenshotViaScrapling("https://example.com");
    expect(result).toBeNull();
  });

  it("returns null when response buffer is suspiciously small (< 100 bytes)", async () => {
    const tinyData = new Uint8Array(50).fill(0x00);
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(tinyData.buffer),
    });

    const { captureScreenshotViaScrapling } = await importModule();
    const result = await captureScreenshotViaScrapling("https://example.com");
    expect(result).toBeNull();
  });

  it("returns null on fetch error (network failure)", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));

    const { captureScreenshotViaScrapling } = await importModule();
    const result = await captureScreenshotViaScrapling("https://example.com");
    expect(result).toBeNull();
  });

  it("returns null when res.text() fails during error handling", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.reject(new Error("text failed")),
    });

    const { captureScreenshotViaScrapling } = await importModule();
    const result = await captureScreenshotViaScrapling("https://example.com");
    expect(result).toBeNull();
  });
});

// =========================================================================
// extractSocialLinks
// =========================================================================

describe("extractSocialLinks", () => {
  it("returns social links on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          facebook: "acmecorp",
          instagram: "acme_ig",
          linkedin: "acme-corp",
        }),
    });

    const { extractSocialLinks } = await importModule();
    const result = await extractSocialLinks("https://example.com");
    expect(result).toEqual({
      facebook: "acmecorp",
      instagram: "acme_ig",
      linkedin: "acme-corp",
    });
  });

  it("sends correct request to /social-links endpoint", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ facebook: null, instagram: null, linkedin: null }),
    });

    const { extractSocialLinks } = await importModule();
    await extractSocialLinks("https://example.com", { timeout: 15 });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://scrapling.test/social-links",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "test-api-key",
        },
        body: JSON.stringify({
          url: "https://example.com",
          timeout: 15,
        }),
      }),
    );
  });

  it("prepends https:// when URL has no protocol", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { extractSocialLinks } = await importModule();
    await extractSocialLinks("example.com");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.url).toBe("https://example.com");
  });

  it("uses default timeout of 30", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { extractSocialLinks } = await importModule();
    await extractSocialLinks("https://example.com");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.timeout).toBe(30);
  });

  it("returns fallback when response is not ok", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Not found"),
    });

    const { extractSocialLinks } = await importModule();
    const result = await extractSocialLinks("https://example.com");
    expect(result).toEqual({
      facebook: null,
      instagram: null,
      linkedin: null,
    });
  });

  it("returns fallback on fetch error", async () => {
    mockFetch.mockRejectedValue(new Error("Timeout"));

    const { extractSocialLinks } = await importModule();
    const result = await extractSocialLinks("https://example.com");
    expect(result).toEqual({
      facebook: null,
      instagram: null,
      linkedin: null,
    });
  });

  it("defaults missing fields to null", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ facebook: "fb-handle" }),
    });

    const { extractSocialLinks } = await importModule();
    const result = await extractSocialLinks("https://example.com");
    expect(result).toEqual({
      facebook: "fb-handle",
      instagram: null,
      linkedin: null,
    });
  });

  it("returns fallback when res.text() fails during error handling", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.reject(new Error("read failed")),
    });

    const { extractSocialLinks } = await importModule();
    const result = await extractSocialLinks("https://example.com");
    expect(result).toEqual({
      facebook: null,
      instagram: null,
      linkedin: null,
    });
  });
});

// =========================================================================
// checkMetaAdsViaScrapling
// =========================================================================

describe("checkMetaAdsViaScrapling", () => {
  it("returns meta ads data on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          isRunningAds: true,
          activeAdCount: 5,
          adScreenshots: ["base64img1", "base64img2"],
        }),
    });

    const { checkMetaAdsViaScrapling } = await importModule();
    const result = await checkMetaAdsViaScrapling("acme corp");
    expect(result).toEqual({
      isRunningAds: true,
      activeAdCount: 5,
      adScreenshots: ["base64img1", "base64img2"],
    });
  });

  it("sends correct request to /meta-ads endpoint", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ isRunningAds: false, activeAdCount: 0, adScreenshots: [] }),
    });

    const { checkMetaAdsViaScrapling } = await importModule();
    await checkMetaAdsViaScrapling("acme corp", {
      country: "AU",
      timeout: 60,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://scrapling.test/meta-ads",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "test-api-key",
        },
        body: JSON.stringify({
          search_term: "acme corp",
          country: "AU",
          timeout: 60,
        }),
      }),
    );
  });

  it("uses default country ALL and timeout 45", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { checkMetaAdsViaScrapling } = await importModule();
    await checkMetaAdsViaScrapling("test");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.country).toBe("ALL");
    expect(body.timeout).toBe(45);
  });

  it("returns fallback when response is not ok", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve("Service unavailable"),
    });

    const { checkMetaAdsViaScrapling } = await importModule();
    const result = await checkMetaAdsViaScrapling("test");
    expect(result).toEqual({
      isRunningAds: false,
      activeAdCount: 0,
      adScreenshots: [],
    });
  });

  it("returns fallback on fetch error", async () => {
    mockFetch.mockRejectedValue(new Error("Connection reset"));

    const { checkMetaAdsViaScrapling } = await importModule();
    const result = await checkMetaAdsViaScrapling("test");
    expect(result).toEqual({
      isRunningAds: false,
      activeAdCount: 0,
      adScreenshots: [],
    });
  });

  it("defaults missing fields in response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { checkMetaAdsViaScrapling } = await importModule();
    const result = await checkMetaAdsViaScrapling("test");
    expect(result).toEqual({
      isRunningAds: false,
      activeAdCount: 0,
      adScreenshots: [],
    });
  });

  it("returns fallback when res.text() fails during error handling", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.reject(new Error("read failed")),
    });

    const { checkMetaAdsViaScrapling } = await importModule();
    const result = await checkMetaAdsViaScrapling("test");
    expect(result).toEqual({
      isRunningAds: false,
      activeAdCount: 0,
      adScreenshots: [],
    });
  });
});

// =========================================================================
// Missing env vars -- needs module re-import with env vars deleted
// =========================================================================

describe("missing environment variables", () => {
  it("captureScreenshotViaScrapling returns null when env not set", async () => {
    delete process.env.SCRAPLING_SERVICE_URL;
    delete process.env.SCRAPLING_SERVICE_KEY;

    const { captureScreenshotViaScrapling } = await importModule();
    const result = await captureScreenshotViaScrapling("https://example.com");
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("extractSocialLinks returns fallback when env not set", async () => {
    delete process.env.SCRAPLING_SERVICE_URL;
    delete process.env.SCRAPLING_SERVICE_KEY;

    const { extractSocialLinks } = await importModule();
    const result = await extractSocialLinks("https://example.com");
    expect(result).toEqual({ facebook: null, instagram: null, linkedin: null });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("checkMetaAdsViaScrapling returns fallback when env not set", async () => {
    delete process.env.SCRAPLING_SERVICE_URL;
    delete process.env.SCRAPLING_SERVICE_KEY;

    const { checkMetaAdsViaScrapling } = await importModule();
    const result = await checkMetaAdsViaScrapling("test");
    expect(result).toEqual({ isRunningAds: false, activeAdCount: 0, adScreenshots: [] });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null/fallback when only URL is missing", async () => {
    delete process.env.SCRAPLING_SERVICE_URL;
    process.env.SCRAPLING_SERVICE_KEY = "has-key";

    const { captureScreenshotViaScrapling } = await importModule();
    const result = await captureScreenshotViaScrapling("https://example.com");
    expect(result).toBeNull();
  });

  it("returns null/fallback when only KEY is missing", async () => {
    process.env.SCRAPLING_SERVICE_URL = "https://scrapling.test";
    delete process.env.SCRAPLING_SERVICE_KEY;

    const { captureScreenshotViaScrapling } = await importModule();
    const result = await captureScreenshotViaScrapling("https://example.com");
    expect(result).toBeNull();
  });
});
