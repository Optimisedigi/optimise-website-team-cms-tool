import { getPayload } from "payload";
import config from "@/payload.config";
import { notFound } from "next/navigation";
import ScheduleResponseClient from "@/components/ScheduleResponseClient";

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  // Find the meeting scheduler that has an attendee with this token
  const result = await payload.find({
    collection: "meeting-schedulers" as any,
    where: {
      "attendees.token": { equals: token },
    },
    limit: 1,
    overrideAccess: true,
  });

  const doc = (result as any).docs[0];
  if (!doc) {
    notFound();
  }

  return <ScheduleResponseClient token={token} />;
}
