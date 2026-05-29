import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { pinFromRequest, verifyClientHubPin } from "@/lib/client-hub-auth";

type RequestBody = {
  pin?: string;
  requestType?: string;
  title?: string;
  description?: string;
  priority?: string;
  submittedByName?: string;
  submittedByEmail?: string;
};

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const payload = await getPayload({ config: await config });
  const auth = await verifyClientHubPin(payload, slug, pinFromRequest(request));
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const result = await payload.find({
    collection: "client-portal-requests" as any,
    where: { client: { equals: auth.clientId } },
    sort: "-createdAt",
    limit: 50,
    depth: 1,
    overrideAccess: true,
  });
  return NextResponse.json({ ok: true, requests: result.docs });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const payload = await getPayload({ config: await config });
  const auth = await verifyClientHubPin(payload, slug, body.pin || pinFromRequest(request));
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  if (!title || !description) return NextResponse.json({ ok: false, error: "Title and description are required" }, { status: 400 });

  const doc = await payload.create({
    collection: "client-portal-requests" as any,
    data: {
      client: auth.clientId,
      requestType: body.requestType || "general",
      title,
      description,
      priority: body.priority || "normal",
      status: "new",
      submittedByName: body.submittedByName,
      submittedByEmail: body.submittedByEmail,
      clientVisibleUpdates: [
        { date: new Date().toISOString(), authorLabel: body.submittedByName || "Client", message: "Request submitted." },
      ],
    } as any,
    overrideAccess: true,
  });

  return NextResponse.json({ ok: true, request: doc }, { status: 201 });
}
