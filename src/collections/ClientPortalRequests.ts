import type { CollectionConfig } from "payload";
import { adminOnlyDelete, canAccess, hideUnlessFeature } from "../lib/access";

export const ClientPortalRequests: CollectionConfig = {
  slug: "client-portal-requests",
  labels: {
    singular: "Client Portal Request",
    plural: "Client Portal Requests",
  },
  admin: {
    useAsTitle: "title",
    group: "Clients",
    description: "Requests submitted from the client hub.",
    defaultColumns: ["client", "requestType", "title", "status", "priority", "createdAt"],
    hidden: hideUnlessFeature("clients"),
  },
  access: {
    read: canAccess("clients"),
    create: canAccess("clients"),
    update: canAccess("clients"),
    delete: adminOnlyDelete,
  },
  defaultSort: "-createdAt",
  fields: [
    { name: "client", type: "relationship", relationTo: "clients", required: true, index: true },
    { name: "proposal", type: "relationship", relationTo: "client-proposals" },
    {
      name: "requestType",
      type: "select",
      required: true,
      defaultValue: "general",
      options: [
        { label: "Website Edit", value: "website_edit" },
        { label: "Campaign Question", value: "campaign_question" },
        { label: "Tracking Issue", value: "tracking_issue" },
        { label: "Billing / Admin", value: "billing" },
        { label: "Content / SEO Idea", value: "content_request" },
        { label: "General", value: "general" },
      ],
    },
    { name: "title", type: "text", required: true },
    { name: "description", type: "textarea", required: true },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "new",
      index: true,
      options: [
        { label: "New", value: "new" },
        { label: "Triaged", value: "triaged" },
        { label: "In Progress", value: "in_progress" },
        { label: "Waiting on Client", value: "waiting_on_client" },
        { label: "Done", value: "done" },
        { label: "Closed", value: "closed" },
      ],
    },
    {
      name: "priority",
      type: "select",
      required: true,
      defaultValue: "normal",
      options: [
        { label: "Low", value: "low" },
        { label: "Normal", value: "normal" },
        { label: "High", value: "high" },
      ],
    },
    { name: "submittedByName", type: "text" },
    { name: "submittedByEmail", type: "email" },
    {
      name: "clientVisibleUpdates",
      type: "array",
      fields: [
        { name: "date", type: "date", required: true },
        { name: "authorLabel", type: "text", required: true },
        { name: "message", type: "textarea", required: true },
      ],
    },
    { name: "internalNotes", type: "textarea" },
    {
      name: "relatedLinks",
      type: "array",
      fields: [
        { name: "label", type: "text", required: true },
        { name: "url", type: "text", required: true },
      ],
    },
  ],
};
