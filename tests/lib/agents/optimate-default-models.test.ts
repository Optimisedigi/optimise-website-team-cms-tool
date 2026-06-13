/**
 * getOptiMateDefaultModels: reads the optimate-settings global and resolves
 * the chat/autonomous default models with safe fallbacks.
 *
 * Mocks `getPayload` so we control what findGlobal returns. Asserts:
 *   - configured valid models are returned, with legacy aliases normalised,
 *   - an unset global falls back to the registry constants,
 *   - a non-canonical / picker-removed stored value falls back,
 *   - a findGlobal throw falls back (never throws to the caller),
 *   - a caller-supplied payload instance is used instead of getPayload.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let nextGlobal: Record<string, unknown> | null = null;
let nextError: Error | null = null;
const findGlobalImpl = vi.fn(async () => {
  if (nextError) throw nextError;
  return nextGlobal;
});

const getPayloadImpl = vi.fn(async () => ({ findGlobal: findGlobalImpl }));

vi.mock("payload", () => ({
  getPayload: (...args: unknown[]) => getPayloadImpl(...(args as [])),
}));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

import { getOptiMateDefaultModels } from "@/lib/agents/_shared/optimate-default-models";
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_AUTONOMOUS_MODEL,
} from "@/lib/agents/_shared/llm/registry";

beforeEach(() => {
  nextGlobal = null;
  nextError = null;
  findGlobalImpl.mockClear();
  getPayloadImpl.mockClear();
});

describe("getOptiMateDefaultModels", () => {
  it("returns configured valid models and normalises legacy aliases", async () => {
    nextGlobal = {
      defaultChatModel: "gpt-5.5-codex-medium",
      defaultAutonomousModel: "minimax-m3",
      blogPrompterModel: "claude-sonnet-4.6",
    };
    const result = await getOptiMateDefaultModels();
    expect(result.defaultChatModel).toBe("gpt-5.5-codex");
    expect(result.defaultAutonomousModel).toBe("minimax-m3");
    expect(result.blogPrompterModel).toBe("claude-sonnet-4.6");
  });

  it("falls back to registry defaults when the global is unset", async () => {
    nextGlobal = null;
    const result = await getOptiMateDefaultModels();
    expect(result.defaultChatModel).toBe(DEFAULT_CHAT_MODEL);
    expect(result.defaultAutonomousModel).toBe(DEFAULT_AUTONOMOUS_MODEL);
    expect(result.blogPrompterModel).toBeUndefined();
  });

  it("falls back when a stored value is not a canonical/picker model", async () => {
    nextGlobal = {
      defaultChatModel: "totally-made-up-model",
      defaultAutonomousModel: "",
      blogPrompterModel: "not-real",
    };
    const result = await getOptiMateDefaultModels();
    expect(result.defaultChatModel).toBe(DEFAULT_CHAT_MODEL);
    expect(result.defaultAutonomousModel).toBe(DEFAULT_AUTONOMOUS_MODEL);
    expect(result.blogPrompterModel).toBeUndefined();
  });

  it("falls back (and does not throw) when findGlobal errors", async () => {
    nextError = new Error("no such table: optimate_settings");
    const result = await getOptiMateDefaultModels();
    expect(result.defaultChatModel).toBe(DEFAULT_CHAT_MODEL);
    expect(result.defaultAutonomousModel).toBe(DEFAULT_AUTONOMOUS_MODEL);
  });

  it("uses a caller-supplied payload instance without calling getPayload", async () => {
    nextGlobal = {
      defaultChatModel: "claude-haiku-4.5",
      defaultAutonomousModel: "kimi-k2.6",
    };
    const override = { findGlobal: findGlobalImpl } as never;
    const result = await getOptiMateDefaultModels(override);
    expect(result.defaultChatModel).toBe("claude-haiku-4.5");
    expect(getPayloadImpl).not.toHaveBeenCalled();
  });
});
