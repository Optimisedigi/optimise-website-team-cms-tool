import { vi } from "vitest";

/** Minimal in-memory Payload stand-in for Content Map tests (equals/not_equals/in/exists/and). */
type Doc = Record<string, unknown> & { id: number };
type Where = Record<string, unknown>;

function rel(v: unknown): unknown {
  return v && typeof v === "object" && "id" in v ? (v as { id: unknown }).id : v;
}

function matches(doc: Doc, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([field, cond]) => {
    if (field === "and") return (cond as Where[]).every((w) => matches(doc, w));
    if (field === "or") return (cond as Where[]).some((w) => matches(doc, w));
    const c = cond as Record<string, unknown>;
    const value = rel(doc[field]);
    if ("equals" in c) return String(value) === String(c.equals);
    if ("not_equals" in c) return String(value) !== String(c.not_equals);
    if ("in" in c) return (c.in as unknown[]).map(String).includes(String(value));
    if ("exists" in c) return (value != null) === c.exists;
    return true;
  });
}

export function createFakePayload(seed: Record<string, Array<Record<string, unknown>>> = {}) {
  let nextId = 1000;
  let tick = 0;
  const store: Record<string, Doc[]> = {};
  const stamp = () => new Date(Date.UTC(2026, 9, 1) + tick++ * 1000).toISOString();
  for (const [col, docs] of Object.entries(seed)) {
    store[col] = docs.map((d) => ({ createdAt: stamp(), ...d, id: (d.id as number) ?? nextId++ }));
  }
  const table = (c: string) => (store[c] ??= []);
  const payload = {
    store,
    auth: vi.fn(async () => ({ user: { id: 1, role: "admin" } })),
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    find: vi.fn(async (args: { collection: string; where?: Where; sort?: string; limit?: number }) => {
      let docs = table(args.collection).filter((d) => matches(d, args.where));
      if (args.sort) {
        const desc = args.sort.startsWith("-");
        const key = args.sort.replace(/^-/, "");
        docs = [...docs].sort((a, b) => {
          const r = String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
          return desc ? -r : r;
        });
      }
      return { docs: docs.slice(0, args.limit ?? 10).map((d) => ({ ...d })), totalDocs: docs.length };
    }),
    findByID: vi.fn(async (args: { collection: string; id: unknown }) => {
      const doc = table(args.collection).find((d) => String(d.id) === String(args.id));
      if (!doc) throw new Error("Not Found");
      return { ...doc };
    }),
    create: vi.fn(async (args: { collection: string; data: Record<string, unknown> }) => {
      const doc = { createdAt: stamp(), ...args.data, id: nextId++ } as Doc;
      table(args.collection).push(doc);
      return { ...doc };
    }),
    update: vi.fn(async (args: { collection: string; id: unknown; data: Record<string, unknown> }) => {
      const doc = table(args.collection).find((d) => String(d.id) === String(args.id));
      if (!doc) throw new Error("Not Found");
      Object.assign(doc, args.data);
      return { ...doc };
    }),
    delete: vi.fn(async (args: { collection: string; where: Where }) => {
      const keep = table(args.collection).filter((d) => !matches(d, args.where));
      const removed = table(args.collection).length - keep.length;
      store[args.collection] = keep;
      return { docs: [], removed };
    }),
  };
  return payload;
}

export type FakePayload = ReturnType<typeof createFakePayload>;

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
