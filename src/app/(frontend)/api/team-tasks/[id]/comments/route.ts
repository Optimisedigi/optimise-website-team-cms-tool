import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";

type UserOption = { id: string | number; name?: string | null; email?: string | null };

function relId(value: unknown): string | number | undefined {
  if (typeof value === "string" || typeof value === "number") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: string | number }).id;
    if (typeof id === "string" || typeof id === "number") return id;
  }
  return undefined;
}

function normaliseMention(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function mentionedUserIds(body: string, users: UserOption[], explicit: unknown, currentUserId: string | number): Array<string | number> {
  const ids = new Set<string | number>();
  if (Array.isArray(explicit)) {
    for (const value of explicit) {
      const id = relId(value);
      if (id != null && String(id) !== String(currentUserId)) ids.add(id);
    }
  }

  const tokens = Array.from(stripHtml(body).matchAll(/@([\w.-]+)/g)).map((match) => normaliseMention(match[1] || ""));
  if (!tokens.length) return Array.from(ids);

  for (const user of users) {
    if (String(user.id) === String(currentUserId)) continue;
    const email = user.email || "";
    const candidates = [
      user.name || "",
      email,
      email.split("@")[0] || "",
    ].map(normaliseMention).filter(Boolean);
    if (tokens.some((token) => candidates.includes(token))) ids.add(user.id);
  }
  return Array.from(ids);
}

async function getAuthedPayload(req: NextRequest) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: req.headers });
  return { payload, user };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { payload, user } = await getAuthedPayload(req);
    if (!user || !userHasFeature(user, "team-tasks")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await payload.findByID({ collection: "team-tasks" as any, id, depth: 0 });
    const comments = await payload.find({
      collection: "team-task-comments" as any,
      where: { task: { equals: id } },
      sort: "createdAt",
      depth: 1,
      limit: 200,
    });

    return NextResponse.json({ comments: comments.docs });
  } catch (error) {
    console.error("[team-tasks/comments] GET error:", error);
    return NextResponse.json({ error: "Failed to load comments" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { payload, user } = await getAuthedPayload(req);
    if (!user || !userHasFeature(user, "team-tasks")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const commentBody = String(body.body || "").trim();
    if (!commentBody) return NextResponse.json({ error: "Comment is required" }, { status: 400 });

    const [task, usersResult] = await Promise.all([
      payload.findByID({ collection: "team-tasks" as any, id, depth: 1 }),
      payload.find({
        collection: "users",
        sort: "name",
        limit: 500,
        depth: 0,
        overrideAccess: true,
        select: { name: true, email: true } as any,
      }),
    ]);

    const users = usersResult.docs as UserOption[];
    const mentions = mentionedUserIds(commentBody, users, body.mentions, user.id);
    const comment = await payload.create({
      collection: "team-task-comments" as any,
      data: {
        task: id,
        author: user.id,
        body: commentBody,
        mentions,
        attachments: Array.isArray(body.attachments) ? body.attachments : [],
      } as any,
      depth: 1,
      overrideAccess: true,
    });

    const clientId = relId((task as any).client);
    const excerpt = stripHtml(commentBody).slice(0, 180);
    await Promise.all(mentions.map((recipient) => payload.create({
      collection: "notifications" as any,
      data: {
        recipient,
        kind: "team-task-mention",
        title: `Mentioned in: ${(task as any).title || "Team task"}`,
        body: excerpt,
        url: `/admin/collections/team-tasks?task=${encodeURIComponent(String(id))}`,
        relatedTeamTask: id,
        relatedClient: clientId,
      } as any,
      overrideAccess: true,
    }).catch((error) => {
      console.error("[team-tasks/comments] notification error:", error);
    })));

    return NextResponse.json({ comment });
  } catch (error) {
    console.error("[team-tasks/comments] POST error:", error);
    return NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
  }
}
