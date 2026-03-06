import { NextRequest, NextResponse } from "next/server";
import { validateDashboardToken } from "../verify/route";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const GROWTH_TOOLS_API_KEY = process.env.INTERNAL_API_KEY;

function getHeaders() {
  return {
    "x-internal-key": GROWTH_TOOLS_API_KEY!,
    "Content-Type": "application/json",
  };
}

export async function POST(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const token = req.cookies.get("dashboard_token")?.value;
  if (!validateDashboardToken(token, slug)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!GROWTH_TOOLS_URL || !GROWTH_TOOLS_API_KEY) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  try {
    const body = await req.json();
    const url = `${GROWTH_TOOLS_URL}/api/google-ads/dashboard/${encodeURIComponent(slug)}/notes`;
    const res = await fetch(url, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Growth Tools returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[Dashboard Notes POST]", err);
    return NextResponse.json({ error: "Failed to add note" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  const noteId = req.nextUrl.searchParams.get("noteId");

  if (!slug || !noteId) {
    return NextResponse.json({ error: "Missing slug or noteId" }, { status: 400 });
  }

  const token = req.cookies.get("dashboard_token")?.value;
  if (!validateDashboardToken(token, slug)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!GROWTH_TOOLS_URL || !GROWTH_TOOLS_API_KEY) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  try {
    const url = `${GROWTH_TOOLS_URL}/api/google-ads/dashboard/${encodeURIComponent(slug)}/notes/${encodeURIComponent(noteId)}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: { "x-internal-key": GROWTH_TOOLS_API_KEY },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Growth Tools returned ${res.status}` },
        { status: res.status }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Dashboard Notes DELETE]", err);
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}
