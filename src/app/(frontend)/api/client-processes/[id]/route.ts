import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

// Payload's built-in REST handler for /api/<collection>/<id>. When this file
// is present Next.js will only route the HTTP methods we explicitly export,
// so we must re-export PATCH/DELETE/POST to keep admin CRUD working.
import {
  REST_PATCH,
  REST_POST,
  REST_DELETE,
} from "@payloadcms/next/routes";

/**
 * GET /api/client-processes/[id]
 *
 * Returns the full client process document with depth 2
 * (populates client, template, assignedTo, step assignees).
 *
 * Auth: Payload session OR x-api-key matching AUDIT_API_KEY.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const payload = await getPayload({ config });

    // Auth: require Payload session or API key
    const apiKey = req.headers.get("x-api-key");
    const { user } = await payload.auth({ headers: req.headers });

    if (!user && (!apiKey || apiKey !== process.env.AUDIT_API_KEY)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let doc: any;
    try {
      doc = await payload.findByID({
        collection: "client-processes" as any,
        id,
        depth: 2,
        overrideAccess: true,
      });
    } catch {
      return NextResponse.json(
        { error: "Client process not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(doc);
  } catch (err) {
    console.error("[client-processes/[id]] GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch client process", details: String(err) },
      { status: 500 },
    );
  }
}

// Delegate other HTTP methods to Payload's standard REST handler so the admin
// UI can edit and delete client-processes normally. The REST handler expects
// params.slug to be the URL segments (['client-processes', <id>]), but this
// dynamic-segment route file delivers params.id instead. We rebuild the slug
// array before forwarding the request.
const patchHandler = REST_PATCH(config);
const postHandler = REST_POST(config);
const deleteHandler = REST_DELETE(config);

function forwardArgs(idParams: { id: string }): {
  params: Promise<{ slug?: string[] }>;
} {
  return {
    params: Promise.resolve({ slug: ["client-processes", idParams.id] }),
  };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return patchHandler(req, forwardArgs({ id }));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return postHandler(req, forwardArgs({ id }));
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return deleteHandler(req, forwardArgs({ id }));
}
