import "@testing-library/jest-dom";

// Many modules in src/ transitively import payload.config (e.g. anything
// that touches activity-log, auth/store, auth/events). payload.config
// throws at module load time if PAYLOAD_SECRET is missing, so set a
// dummy value here — setupFiles run before any test file imports.
// Tests that need a specific secret (e.g. oauth-state.test.ts) override
// it locally and restore in afterEach.
process.env.PAYLOAD_SECRET = process.env.PAYLOAD_SECRET || "test-secret";
