import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  // Auth: require Payload session
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const lowerFileName = file.name.toLowerCase();
  const extension = lowerFileName.endsWith(".htm") ? ".htm" : ".html";

  if (!lowerFileName.endsWith(".html") && !lowerFileName.endsWith(".htm")) {
    return NextResponse.json(
      { error: "Only .html files are allowed" },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File too large (max 5 MB)" },
      { status: 400 },
    );
  }

  const blob = await put(`mockups/${Date.now()}-${randomUUID()}${extension}`, file, {
    access: "public",
    contentType: "text/html; charset=utf-8",
  });

  return NextResponse.json({ url: blob.url });
}
