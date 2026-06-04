import ScheduleResponseClient from '@/components/ScheduleResponseClient'

function makeSlot(daysFromNow: number, hour: number, minute: number): string {
  const date = new Date()
  date.setDate(date.getDate() + daysFromNow)
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

export default function MeetingSchedulerPreviewPage() {
  const previewData = {
    title: 'Away Digital Teams Google ads kick-off plan',
    meetingTopic:
      "• Review new key findings identified during the initial audit\n• Discuss the highest-impact implementations and immediate changes to improve lead quality and reduce CPL\n• Walk through the implementation plan and account optimisation roadmap\n• Outline priorities, expected outcomes, and next steps\n\n@Jason, it would be great for you to join as well so you can see the plan and roadmap moving forward.",
    durationMinutes: '45',
    timezone: 'Australia/Sydney',
    generatedSlots: [
      makeSlot(11, 9, 30),
      makeSlot(11, 10, 0),
      makeSlot(11, 10, 30),
      makeSlot(11, 11, 0),
      makeSlot(11, 11, 30),
      makeSlot(11, 12, 0),
      makeSlot(11, 12, 30),
      makeSlot(11, 13, 0),
      makeSlot(11, 13, 30),
      makeSlot(11, 14, 0),
      makeSlot(11, 14, 30),
      makeSlot(11, 15, 0),
      makeSlot(11, 15, 30),
      makeSlot(11, 16, 0),
      makeSlot(12, 9, 0),
      makeSlot(12, 9, 30),
      makeSlot(12, 11, 0),
      makeSlot(12, 11, 30),
      makeSlot(12, 13, 30),
      makeSlot(12, 14, 0),
      makeSlot(12, 15, 30),
      makeSlot(13, 10, 0),
      makeSlot(13, 10, 30),
      makeSlot(13, 12, 0),
      makeSlot(13, 12, 30),
      makeSlot(13, 14, 30),
      makeSlot(13, 15, 0),
    ],
    attendeeName: 'Peter',
    attendeeEmail: 'petertuu2@gmail.com',
    attendeeEmails: ['petertuu2@gmail.com', 'peter@optimisedigital.online'],
    responded: false,
    selectedSlots: [],
    status: 'collecting',
  }

  return <ScheduleResponseClient token="preview" previewData={previewData} />
}
