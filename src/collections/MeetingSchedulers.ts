import type { CollectionConfig } from "payload";
import crypto from "crypto";
import { logActivity } from "../lib/activity-log";

export const MeetingSchedulers: CollectionConfig = {
  slug: "meeting-schedulers",
  labels: {
    singular: "Meeting Scheduler",
    plural: "Meeting Schedulers",
  },
  admin: {
    useAsTitle: "title",
    group: "Clients",
    description: "Schedule meetings with multiple client contacts by finding overlapping availability",
    defaultColumns: ["title", "client", "status", "dateRangeStart", "createdAt"],
    components: {},
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => req.user?.role === "admin",
  },
  hooks: {
    beforeChange: [
      async ({ data, operation, originalDoc }) => {
        try {
          console.log(
            `[meeting-schedulers beforeChange] op=${operation} id=${(originalDoc as any)?.id} ` +
            `dataKeys=${Object.keys(data || {}).join(',')} ` +
            `attendees=${JSON.stringify((data as any)?.attendees)?.slice(0, 300)} ` +
            `daySchedule=${JSON.stringify((data as any)?.daySchedule)?.slice(0, 300)}`
          );
        } catch {}
        if (operation === "create" && data) {
          if (!data.slug) {
            data.slug = crypto.randomBytes(16).toString("hex");
          }
          // Generate unique tokens for each attendee
          if (data.attendees && Array.isArray(data.attendees)) {
            for (const attendee of data.attendees) {
              if (!attendee.token) {
                attendee.token = crypto.randomBytes(32).toString("hex");
              }
            }
          }
        }
        // Also generate tokens for newly added attendees on update
        if (operation === "update" && data?.attendees && Array.isArray(data.attendees)) {
          for (const attendee of data.attendees) {
            if (!attendee.token) {
              attendee.token = crypto.randomBytes(32).toString("hex");
            }
          }
        }
        return data;
      },
    ],
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation === "create") {
          logActivity(req.payload, {
            type: "meeting_scheduled",
            title: `Meeting scheduler created: ${doc.title || "Untitled"}`,
            description: `${doc.attendees?.length || 0} attendee(s)`,
            user: req.user?.id,
            client: doc.client,
          }).catch(() => {});
        }
      },
    ],
  },
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Setup",
          fields: [
            {
              name: "howItWorks",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/MeetingSchedulerInstructions",
                },
              },
            },
            {
              name: "title",
              type: "text",
              required: true,
              admin: {
                description: "Meeting title (e.g. 'Q2 Strategy Review')",
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "client",
                  type: "relationship",
                  relationTo: "clients",
                  admin: {
                    description: "Client this meeting is for",
                  },
                },
                {
                  name: "durationMinutes",
                  type: "select",
                  defaultValue: "30",
                  options: [
                    { label: "15 minutes", value: "15" },
                    { label: "30 minutes", value: "30" },
                    { label: "45 minutes", value: "45" },
                    { label: "60 minutes", value: "60" },
                    { label: "90 minutes", value: "90" },
                    { label: "120 minutes", value: "120" },
                  ],
                  admin: {
                    description: "Meeting duration",
                  },
                },
              ],
            },
            {
              name: "meetingTopic",
              type: "textarea",
              admin: {
                description: "Brief description shown to attendees",
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "dateRangeStart",
                  type: "date",
                  required: true,
                  admin: {
                    date: { pickerAppearance: "dayOnly", displayFormat: "d MMM yyyy" },
                    description: "Start of availability window",
                  },
                },
                {
                  name: "dateRangeEnd",
                  type: "date",
                  required: true,
                  admin: {
                    date: { pickerAppearance: "dayOnly", displayFormat: "d MMM yyyy" },
                    description: "End of availability window",
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "timezone",
                  type: "text",
                  defaultValue: "Australia/Sydney",
                  admin: {
                    description: "Timezone for slots",
                    width: "50%",
                  },
                },
                {
                  name: "slotIntervalMinutes",
                  type: "number",
                  defaultValue: 30,
                  admin: {
                    description: "Slot interval (mins)",
                    width: "50%",
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "businessHoursStart",
                  type: "text",
                  defaultValue: "09:00",
                  admin: {
                    description: "Business hours start (HH:MM)",
                    width: "50%",
                  },
                },
                {
                  name: "businessHoursEnd",
                  type: "text",
                  defaultValue: "17:00",
                  admin: {
                    description: "Business hours end (HH:MM)",
                    width: "50%",
                  },
                },
              ],
            },
          ],
        },
        {
          label: "Attendees",
          fields: [
            {
              name: "attendees",
              type: "array",
              minRows: 0,
              maxRows: 10,
              admin: {
                description: "Add each person who needs to choose a time. Their unique scheduling link is generated on save.",
              },
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "name",
                      type: "text",
                      required: true,
                      admin: { width: "50%" },
                    },
                    {
                      name: "email",
                      type: "email",
                      required: true,
                      admin: { width: "50%" },
                    },
                  ],
                },
                {
                  name: "token",
                  type: "text",
                  admin: {
                    hidden: true,
                  },
                },
                {
                  type: "row",
                  fields: [
                    {
                      name: "responded",
                      type: "checkbox",
                      defaultValue: false,
                      admin: {
                        readOnly: true,
                        width: "25%",
                      },
                    },
                    {
                      name: "respondedAt",
                      type: "date",
                      admin: {
                        readOnly: true,
                        date: { pickerAppearance: "dayAndTime" },
                        width: "25%",
                      },
                    },
                    {
                      name: "emailSentAt",
                      type: "date",
                      admin: {
                        readOnly: true,
                        date: { pickerAppearance: "dayAndTime" },
                        width: "25%",
                      },
                    },
                  ],
                },
                {
                  name: "selectedSlots",
                  type: "json",
                  admin: {
                    readOnly: true,
                    description: "Slots selected by this attendee",
                  },
                },
              ],
            },
          ],
        },
        {
          label: "Availability & Result",
          fields: [
            {
              name: "generateSlotsButton",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/GenerateSlotsButton",
                },
              },
            },
            {
              name: "generatedSlots",
              type: "json",
              admin: {
                readOnly: true,
                description: "Available time slots from Google Calendar freebusy check",
              },
            },
            {
              name: "slotsGeneratedAt",
              type: "date",
              admin: {
                readOnly: true,
                date: { pickerAppearance: "dayAndTime" },
              },
            },
            {
              name: "matchedSlot",
              type: "text",
              admin: {
                readOnly: true,
                description: "The confirmed meeting time (ISO datetime)",
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "googleEventId",
                  type: "text",
                  admin: { readOnly: true },
                },
                {
                  name: "googleEventLink",
                  type: "text",
                  admin: { readOnly: true },
                },
              ],
            },
          ],
        },
        {
          label: "Actions",
          fields: [
            {
              name: "copyEmailButton",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/CopyScheduleEmailButton",
                },
              },
            },
            {
              name: "sendInvitesButton",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/SendScheduleInvitesButton",
                },
              },
            },
            {
              name: "responseStatus",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/ScheduleResponseStatus",
                },
              },
            },
          ],
        },
      ],
    },
    // Sidebar fields
    {
      name: "status",
      type: "select",
      defaultValue: "draft",
      required: true,
      options: [
        { label: "Draft", value: "draft" },
        { label: "Slots Generated", value: "slots_generated" },
        { label: "Invites Sent", value: "invites_sent" },
        { label: "Awaiting Responses", value: "awaiting_responses" },
        { label: "Confirmed", value: "confirmed" },
        { label: "No Match", value: "no_match" },
        { label: "Expired", value: "expired" },
      ],
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "slug",
      type: "text",
      unique: true,
      admin: {
        position: "sidebar",
        readOnly: true,
      },
    },
  ],
};
