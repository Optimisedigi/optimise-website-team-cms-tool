import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.GROWTH_TOOLS_URL;
  const key = process.env.INTERNAL_API_KEY;
  if (!url || !key)
    return NextResponse.json({ error: "Not configured" }, { status: 500 });

  try {
    const res = await fetch(`${url}/api/xero/scheduled-sends`, {
      headers: { "x-internal-key": key },
      next: { revalidate: 300 },
    });
    if (!res.ok)
      return NextResponse.json(
        { error: "Failed to fetch from Growth Tools" },
        { status: res.status }
      );
    return NextResponse.json(await res.json());
  } catch (err) {
    console.error("[xero/scheduled-sends]", err);
    return NextResponse.json(
      { error: "Failed to fetch scheduled sends" },
      { status: 500 }
    );
  }
}
