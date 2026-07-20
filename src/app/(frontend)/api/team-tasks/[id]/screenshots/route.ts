import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import sharp from "sharp";
import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_STORED_BYTES = 800 * 1024;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function safeFilename(value: string) {
  const basename = value.replace(/\.[^.]+$/, "");
  const slug = basename.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 70);
  return `${slug || "task-screenshot"}-${Date.now()}.webp`;
}

async function optimiseScreenshot(source: Buffer) {
  const image = sharp(source, { failOn: "error" }).rotate();
  const metadata = await image.metadata();
  let width = Math.min(metadata.width || 1800, 1800);
  let height = Math.min(metadata.height || 1400, 1400);

  for (const quality of [82, 72, 62, 52]) {
    const data = await image
      .clone()
      .resize({ width, height, fit: "inside", withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer();
    if (data.length <= MAX_STORED_BYTES) return data;
  }

  width = Math.min(width, 1400);
  height = Math.min(height, 1100);
  return image
    .clone()
    .resize({ width, height, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 45, effort: 4 })
    .toBuffer();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: req.headers });
    if (!user || !userHasFeature(user, "team-tasks")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose an image to upload" }, { status: 400 });
    }
    if (!SUPPORTED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Use a PNG, JPEG, or WebP image" }, { status: 400 });
    }
    if (file.size > MAX_SOURCE_BYTES) {
      return NextResponse.json({ error: "Image must be 8 MB or smaller" }, { status: 400 });
    }

    await payload.findByID({
      collection: "team-tasks" as any,
      id,
      depth: 0,
      overrideAccess: true,
    });
    const optimised = await optimiseScreenshot(Buffer.from(await file.arrayBuffer()));
    if (optimised.length > MAX_STORED_BYTES) {
      return NextResponse.json({ error: "Image could not be compressed below 800 KB" }, { status: 400 });
    }

    const media = await payload.create({
      collection: "media",
      data: { alt: file.name.replace(/\.[^.]+$/, "") },
      file: {
        data: optimised,
        mimetype: "image/webp",
        name: safeFilename(file.name),
        size: optimised.length,
      },
      overrideAccess: true,
    });

    if (!media.url) throw new Error("Uploaded image has no URL");
    const screenshot = {
      label: file.name,
      url: media.url,
      thumbnailUrl: media.sizes?.thumbnail?.url || media.thumbnailURL || media.url,
      mediaId: media.id,
    };
    const latestTask = await payload.findByID({
      collection: "team-tasks" as any,
      id,
      depth: 0,
      overrideAccess: true,
    }) as any;
    const screenshots = [...(Array.isArray(latestTask.screenshots) ? latestTask.screenshots : []), screenshot];
    const updatedTask = await payload.update({
      collection: "team-tasks" as any,
      id,
      data: { screenshots } as any,
      depth: 0,
      overrideAccess: true,
    });

    return NextResponse.json({ screenshot, task: updatedTask });
  } catch (error) {
    console.error("[team-tasks/screenshots] POST error:", error);
    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: req.headers });
    if (!user || !userHasFeature(user, "team-tasks")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as { mediaId?: string | number } | null;
    if (body?.mediaId === undefined || body.mediaId === null) {
      return NextResponse.json({ error: "Screenshot ID is required" }, { status: 400 });
    }

    const task = await payload.findByID({
      collection: "team-tasks" as any,
      id,
      depth: 0,
      overrideAccess: true,
    }) as any;
    const screenshots = Array.isArray(task.screenshots) ? task.screenshots : [];
    const screenshot = screenshots.find((item: any) => String(item.mediaId) === String(body.mediaId));
    if (!screenshot) {
      return NextResponse.json({ error: "Screenshot not found on this task" }, { status: 404 });
    }

    try {
      await payload.delete({
        collection: "media",
        id: screenshot.mediaId,
        overrideAccess: true,
      });
    } catch (error) {
      if ((error as { status?: number }).status !== 404) throw error;
    }

    const updatedTask = await payload.update({
      collection: "team-tasks" as any,
      id,
      data: {
        screenshots: screenshots.filter((item: any) => String(item.mediaId) !== String(body.mediaId)),
      } as any,
      depth: 0,
      overrideAccess: true,
    });

    return NextResponse.json({ task: updatedTask });
  } catch (error) {
    console.error("[team-tasks/screenshots] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete image" }, { status: 500 });
  }
}
