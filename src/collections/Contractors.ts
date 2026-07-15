import type { CollectionConfig } from "payload";
import crypto from "crypto";
import { canAccess, adminOnlyDelete } from "../lib/access";

/**
 * One row per contractor (e.g. Lorenzo). Holds the rate card + portal
 * token. The contractor never logs into Payload; they use the
 * /contractor/[portalToken] page to log hours, and the agency does the
 * cost/payment work in the admin.
 */
export const Contractors: CollectionConfig = {
  slug: "contractors",
  labels: { singular: "Contractor", plural: "Contractors" },
  admin: {
    group: "Finance",
    useAsTitle: "name",
    defaultColumns: ["name", "email", "hourlyRate", "defaultWeeklyHours", "isActive"],
    description: "Contractors and their rate cards. Each contractor gets a portal token they use to log hours.",
    hidden: true,
  },
  access: {
    read: canAccess("contractors"),
    create: canAccess("contractors"),
    update: canAccess("contractors"),
    delete: adminOnlyDelete,
  },
  hooks: {
    beforeChange: [
      ({ data, operation }) => {
        if (operation === "create" && !data?.portalToken) {
          data.portalToken = crypto.randomBytes(24).toString("hex");
        }
        return data;
      },
    ],
  },
  fields: [
    { name: "name", type: "text", required: true },
    { name: "email", type: "email" },
    {
      name: "hourlyRate",
      type: "number",
      required: true,
      defaultValue: 20.5,
      admin: { description: "Rate per hour in the contractor's currency (default AUD)." },
    },
    {
      name: "currency",
      type: "select",
      required: true,
      defaultValue: "AUD",
      options: [
        { label: "AUD", value: "AUD" },
        { label: "USD", value: "USD" },
        { label: "GBP", value: "GBP" },
        { label: "EUR", value: "EUR" },
      ],
    },
    {
      name: "defaultWeeklyHours",
      type: "number",
      defaultValue: 16,
      admin: { description: "Used to estimate next fortnight's cost on the overview page." },
    },
    {
      name: "chatGptReimbursementPerFortnight",
      type: "number",
      defaultValue: 31.83,
      admin: {
        description: "Legacy per-fortnight reimbursement. Used only when Reimbursement recurrence below is left as its default. Prefer the Reimbursement fields.",
      },
    },
    {
      name: "reimbursementAmount",
      type: "number",
      label: "Reimbursement amount",
      admin: {
        description: "Tool/expense reimbursement rate. Applied according to the recurrence below.",
      },
    },
    {
      name: "reimbursementRecurrence",
      type: "select",
      label: "Reimbursement recurrence",
      options: [
        { label: "None", value: "none" },
        { label: "Every fortnight", value: "per-fortnight" },
        { label: "Monthly", value: "monthly" },
        { label: "One-off", value: "one-off" },
      ],
      admin: {
        description: "How often the reimbursement is added. Leave blank to keep the legacy per-fortnight amount above.",
      },
    },
    {
      name: "reimbursementStartDate",
      type: "date",
      label: "Reimbursement start date",
      admin: {
        description: "The date the reimbursement first appears. Monthly recurrence repeats on this day-of-month.",
        date: { pickerAppearance: "dayOnly" },
      },
    },
    {
      name: "transferFeeDefault",
      type: "number",
      defaultValue: 4,
      admin: { description: "Default Wise transfer fee per fortnight. Override per payment if it differs." },
    },
    {
      name: "transferReferenceTemplate",
      type: "text",
      defaultValue: "{startShort}-{endShort} Optimise",
      admin: {
        description: "Template for the bank reference. {startShort}/{endShort} = DDMM. {startDate}/{endDate} = full date.",
      },
    },
    {
      name: "fortnightAnchorDate",
      type: "date",
      admin: {
        description: "Monday that anchors fortnight 1. Used to derive fortnight numbers for time entries.",
        date: { pickerAppearance: "dayOnly" },
      },
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      admin: { description: "Inactive contractors are hidden from the costs overview." },
    },
    {
      name: "portalToken",
      type: "text",
      admin: {
        position: "sidebar",
        description: "Auto-generated. Share /contractor/[token] with the contractor to log hours.",
        readOnly: true,
      },
    },
    {
      name: "notes",
      type: "textarea",
    },
  ],
};
