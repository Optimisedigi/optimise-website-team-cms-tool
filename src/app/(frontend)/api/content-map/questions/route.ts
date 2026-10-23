import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as nextHeaders } from "next/headers";
import config from "@/payload.config";
import { authoritiesFromClient } from "@/lib/content-map/authorities";
import { buildCitationsView, latestCompletedCitations } from "@/lib/content-map/citations";
import { addQuestion, removeQuestion } from "@/lib/content-map/questions";
import { loadClientForUser, validClientId } from "@/lib/content-map/state";
import { isRecord } from "@/lib/content-map/types";

/** Add or remove a tracked AI question (max 8 active per topic). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: await nextHeaders() });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body)) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const clientId = typeof body.clientId === "number" ? String(body.clientId) : body.clientId;
    if (!validClientId(clientId)) return NextResponse.json({ error: "clientId is invalid" }, { status: 400 });
    const client = await loadClientForUser(payload, clientId, user);
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    const authorities = authoritiesFromClient(client);
    let res;
    if (body.action === "add") {
      if (typeof body.topic !== "string") return NextResponse.json({ error: "topic is required" }, { status: 400 });
      res = await addQuestion(payload, { clientId, topic: body.topic, question: body.question, authorities });
    } else if (body.action === "remove") {
      const id = typeof body.id === "number" ? String(body.id) : body.id;
      if (!validClientId(id)) return NextResponse.json({ error: "id is invalid" }, { status: 400 });
      res = await removeQuestion(payload, { clientId, id });
    } else {
      return NextResponse.json({ error: "action must be add or remove" }, { status: 400 });
    }
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    const completed = await latestCompletedCitations(payload, clientId);
    const view = buildCitationsView({ latest: completed[0] ?? null, completed, questions: res.questions, authorities });
    return NextResponse.json({ questions: view?.questions ?? [] });
  } catch (err) {
    console.error("[content-map] questions failed:", (err as Error).message);
    return NextResponse.json({ error: "Failed to update questions" }, { status: 500 });
  }
}
