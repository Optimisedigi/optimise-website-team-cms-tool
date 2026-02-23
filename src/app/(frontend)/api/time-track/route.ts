import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

export async function POST(req: Request) {
  const payload = await getPayload({ config });

  const headersList = await nextHeaders();
  const { user } = await payload.auth({ headers: headersList });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskName, durationSeconds } = await req.json();

  if (!taskName || typeof durationSeconds !== "number" || durationSeconds < 1) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  const formatted =
    minutes > 0
      ? `${minutes}m ${seconds}s`
      : `${seconds}s`;

  await payload.create({
    collection: "activity-log" as any,
    data: {
      type: "time_tracked",
      title: taskName,
      description: `Tracked ${formatted}`,
      user: user.id,
    } as any,
  });

  return NextResponse.json({ ok: true });
}
