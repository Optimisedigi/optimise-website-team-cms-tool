import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import BlogPrompterPage from "@/components/BlogPrompterPage";

// VoiceField pulls in browser speech APIs; a plain textarea is enough here.
vi.mock("@/components/VoiceField", () => ({
  default: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  }) => (
    <textarea
      aria-label={placeholder ?? "field"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

const IDEA_LABEL = "e.g. Why page speed matters for local SEO";

let fetchMock: Mock;

/** Resolves the boot-time /api/clients/list and /api/blog-settings fetches. */
function bootResponse(url: string) {
  if (url.startsWith("/api/clients/list")) {
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
  }
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ globalBlogRules: "", globalMarkdownRules: "" }),
  });
}

async function renderWithIdea() {
  render(<BlogPrompterPage />);
  await act(async () => {
    await Promise.resolve();
  });
  fireEvent.change(screen.getByLabelText(IDEA_LABEL), {
    target: { value: "Why page speed matters" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  fetchMock = vi.fn((url: string) => bootResponse(url));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("BlogPrompterPage AI Suggest status", () => {
  it("shows an elapsed-seconds counter while the suggestion is in flight", async () => {
    let release: (v: unknown) => void = () => {};
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith("/api/blog-prompts/suggest")) {
        return new Promise((resolve) => {
          release = resolve;
        });
      }
      return bootResponse(url);
    });

    await renderWithIdea();
    await act(async () => {
      fireEvent.click(screen.getByText("✨ AI Suggest"));
      await Promise.resolve();
    });

    // Immediately in-flight: counter starts at 0s.
    expect(screen.getByText("Thinking… 0s")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText("Thinking… 3s")).toBeTruthy();

    await act(async () => {
      release({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.resolve(JSON.stringify({ ok: true, suggestion: { titleIdea: "T" } })),
      });
      await Promise.resolve();
    });

    // Counter is replaced by the idle label once the request settles.
    expect(screen.getByText("✨ AI Suggest")).toBeTruthy();
    expect(screen.queryByText(/Thinking…/)).toBeNull();

    // Flush the success auto-clear timer inside act so no stray update leaks.
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
  });

  it("surfaces a non-JSON 504 as a timeout error including the HTTP status", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith("/api/blog-prompts/suggest")) {
        return Promise.resolve({
          ok: false,
          status: 504,
          statusText: "Gateway Timeout",
          text: () => Promise.resolve("<html><body>An error occurred with this application.</body></html>"),
        });
      }
      return bootResponse(url);
    });

    await renderWithIdea();
    await act(async () => {
      fireEvent.click(screen.getByText("✨ AI Suggest"));
      await Promise.resolve();
    });

    const msg = screen.getByText(/AI suggestion timed out/);
    expect(msg.textContent).toContain("HTTP 504");
    expect(msg.textContent).toMatch(/timed out after \d+s/);
    // Rendered in the error colour, not the success green.
    expect((msg as HTMLElement).style.color).toBe("rgb(239, 68, 68)");
  });

  it("keeps the error message on screen instead of auto-clearing it", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith("/api/blog-prompts/suggest")) {
        return Promise.resolve({
          ok: false,
          status: 504,
          statusText: "Gateway Timeout",
          text: () => Promise.resolve("<html>timeout</html>"),
        });
      }
      return bootResponse(url);
    });

    await renderWithIdea();
    await act(async () => {
      fireEvent.click(screen.getByText("✨ AI Suggest"));
      await Promise.resolve();
    });
    expect(screen.getByText(/AI suggestion timed out/)).toBeTruthy();

    // Well past the 4s/10s auto-clear windows the old code used.
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });
    expect(screen.getByText(/AI suggestion timed out/)).toBeTruthy();
  });

  it("clears the success message after the short auto-clear window", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith("/api/blog-prompts/suggest")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          text: () =>
            Promise.resolve(JSON.stringify({ ok: true, suggestion: { titleIdea: "Page speed 101" } })),
        });
      }
      return bootResponse(url);
    });

    await renderWithIdea();
    await act(async () => {
      fireEvent.click(screen.getByText("✨ AI Suggest"));
      await Promise.resolve();
    });
    expect(screen.getByText(/Recommendations added to empty fields/)).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText(/Recommendations added/)).toBeNull();
  });
});
