import {
  signOAuthState,
  verifyOAuthState,
  OAUTH_NONCE_COOKIE,
} from "@/lib/oauth-state";

describe("oauth-state", () => {
  const ORIGINAL_SECRET = process.env.PAYLOAD_SECRET;

  beforeEach(() => {
    process.env.PAYLOAD_SECRET = "test-secret-for-oauth-state-tests";
  });

  afterAll(() => {
    process.env.PAYLOAD_SECRET = ORIGINAL_SECRET;
  });

  describe("signOAuthState", () => {
    it("produces a state of the form 'nonce:target:initiator.sig'", () => {
      const { state, nonce } = signOAuthState("42", "7");
      expect(nonce).toMatch(/^[0-9a-f]{32}$/);
      expect(state.startsWith(`${nonce}:42:7.`)).toBe(true);
    });

    it("produces a different nonce/state on every call", () => {
      const a = signOAuthState("42", "7");
      const b = signOAuthState("42", "7");
      expect(a.nonce).not.toBe(b.nonce);
      expect(a.state).not.toBe(b.state);
    });

    it("accepts numeric ids", () => {
      const { state } = signOAuthState(42, 7);
      expect(state).toMatch(/:42:7\.[0-9a-f]+$/);
    });

    it("throws when PAYLOAD_SECRET is missing", () => {
      delete process.env.PAYLOAD_SECRET;
      expect(() => signOAuthState("1", "1")).toThrow(/PAYLOAD_SECRET/);
    });
  });

  describe("verifyOAuthState", () => {
    it("verifies a freshly-signed state and recovers nonce/target/initiator", () => {
      const { state, nonce } = signOAuthState("client-99", "user-3");
      const result = verifyOAuthState(state);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.nonce).toBe(nonce);
      expect(result.targetId).toBe("client-99");
      expect(result.initiatorUserId).toBe("user-3");
    });

    it("rejects null state", () => {
      const result = verifyOAuthState(null);
      expect(result).toEqual({ ok: false, reason: "malformed_state" });
    });

    it("rejects empty state", () => {
      const result = verifyOAuthState("");
      expect(result).toEqual({ ok: false, reason: "malformed_state" });
    });

    it("rejects a bare clientId (the pre-BP-007 form)", () => {
      const result = verifyOAuthState("42");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("malformed_state");
    });

    it("rejects state missing a signature", () => {
      const result = verifyOAuthState("nonce:42:7");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("malformed_state");
    });

    it("rejects state with too few payload parts", () => {
      const result = verifyOAuthState("nonce:42.abc123");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("malformed_state");
    });

    it("rejects a forged signature", () => {
      const { state } = signOAuthState("42", "7");
      const dotIdx = state.lastIndexOf(".");
      const tampered = `${state.slice(0, dotIdx)}.${"0".repeat(64)}`;
      const result = verifyOAuthState(tampered);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("invalid_state_signature");
    });

    it("rejects a state signed with a different secret (attacker-chosen target)", () => {
      // Attacker constructs `state=nonce:victim-client:attacker-user.<sig>`
      // signed with a guess at the secret. Real PAYLOAD_SECRET stays unknown.
      process.env.PAYLOAD_SECRET = "attacker-guess";
      const forged = signOAuthState("victim-client", "attacker").state;
      process.env.PAYLOAD_SECRET = "test-secret-for-oauth-state-tests";
      const result = verifyOAuthState(forged);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("invalid_state_signature");
    });

    it("rejects state whose payload has been mutated after signing", () => {
      // Attacker swaps the targetId from their own row to a victim's row
      // while keeping the signature \u2014 must fail.
      const { state } = signOAuthState("attacker-client", "attacker-user");
      const [payload, sig] = state.split(".");
      const parts = payload.split(":");
      parts[1] = "victim-client";
      const tampered = `${parts.join(":")}.${sig}`;
      const result = verifyOAuthState(tampered);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("invalid_state_signature");
    });
  });

  describe("OAUTH_NONCE_COOKIE", () => {
    it("exposes one cookie name per flow", () => {
      expect(OAUTH_NONCE_COOKIE.gsc).toBe("oauth_nonce_gsc");
      expect(OAUTH_NONCE_COOKIE.ga4).toBe("oauth_nonce_ga4");
      expect(OAUTH_NONCE_COOKIE.gmail).toBe("oauth_nonce_gmail");
    });
  });
});
