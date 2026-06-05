import type { Payload } from "payload";

/**
 * Fan a CMS bell notification out to every admin user for a meeting-scheduler
 * event (attendee accepted/declined, or a time confirmed).
 *
 * Best-effort: failures are logged and swallowed so they never block the
 * attendee response or admin confirm flow that triggered them.
 */
export async function notifyAdminsOfMeetingEvent(
  payload: Payload,
  entry: {
    kind: string;
    title: string;
    body?: string;
    schedulerId: string | number;
    client?: string | number | null;
  },
): Promise<void> {
  try {
    const admins = await payload.find({
      collection: "users",
      where: { role: { equals: "admin" } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    });
    for (const admin of admins.docs) {
      await payload.create({
        collection: "notifications" as never,
        overrideAccess: true,
        data: {
          recipient: (admin as { id: number | string }).id,
          kind: entry.kind,
          title: entry.title,
          body: entry.body,
          url: `/admin/collections/meeting-schedulers/${entry.schedulerId}`,
          relatedMeetingScheduler: entry.schedulerId,
          ...(entry.client ? { relatedClient: entry.client } : {}),
        } as never,
      });
    }
  } catch (err) {
    console.error("[meeting-scheduler] notifyAdminsOfMeetingEvent failed:", err);
  }
}
