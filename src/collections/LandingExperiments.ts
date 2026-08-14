import type { CollectionConfig } from "payload";
import { canAccess } from "../lib/access";

/**
 * A/B experiment definition served to landing pages through the manifest route.
 *
 * Variant weights and `allocationVersion` are server-owned. Changing weights or
 * variant membership REQUIRES bumping `allocationVersion`, because visitors are
 * assigned deterministically from (subject, experimentId, allocationVersion) —
 * reusing a version after a weight change silently reshuffles live visitors and
 * corrupts the result.
 *
 * `primaryGoal` is immutable once an experiment is running. Picking the winning
 * metric after seeing the data is how teams talk themselves into fake wins.
 */
export const LandingExperiments: CollectionConfig = {
  slug: "landing-experiments",
  labels: { singular: "Landing Experiment", plural: "Landing Experiments" },
  admin: {
    useAsTitle: "name",
    group: "Reports",
    description:
      "A/B definitions for client landing pages. Bump allocationVersion whenever weights or variants change.",
    defaultColumns: ["name", "client", "experimentId", "status", "primaryGoal"],
  },
  access: {
    read: canAccess("nav:dashboard"),
    create: canAccess("nav:dashboard"),
    update: canAccess("nav:dashboard"),
    delete: canAccess("nav:dashboard"),
  },
  fields: [
    { name: "name", type: "text", required: true },
    { name: "client", type: "relationship", relationTo: "clients", required: true, index: true },
    {
      name: "experimentId",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: { description: "Stable slug sent with every event, such as landing-hero-v1." },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      index: true,
      options: [
        { label: "Draft", value: "draft" },
        { label: "Running", value: "running" },
        { label: "Stopped", value: "stopped" },
      ],
    },
    {
      name: "allocationVersion",
      type: "text",
      required: true,
      defaultValue: "1",
      admin: {
        description:
          "Bump on ANY weight or variant change. Reusing a version after a change reshuffles live visitors and invalidates results.",
      },
    },
    {
      name: "primaryGoal",
      type: "select",
      required: true,
      defaultValue: "booking_complete",
      options: [
        { label: "Booking complete", value: "booking_complete" },
        { label: "Form submit", value: "form_submit" },
        { label: "CTA click", value: "cta_click" },
      ],
      admin: {
        description:
          "Choose before launch and do not change while running. Every other metric is exploratory.",
      },
    },
    {
      name: "variants",
      type: "array",
      required: true,
      minRows: 2,
      admin: { description: "Weights are relative; they do not need to total 100." },
      fields: [
        {
          name: "variantId",
          type: "text",
          required: true,
          admin: { description: "Matches the deployed variant, such as a or b." },
        },
        { name: "label", type: "text" },
        { name: "weight", type: "number", required: true, min: 0, defaultValue: 50 },
        {
          name: "contentProfileId",
          type: "text",
          defaultValue: "default",
          admin: { description: "Content profile applied for this variant." },
        },
      ],
    },
    {
      name: "contentProfiles",
      type: "array",
      admin: {
        description:
          "Allowlisted copy applied by data-content-field. Text only — never markup. URLs must be same-origin or https.",
      },
      fields: [
        { name: "profileId", type: "text", required: true, defaultValue: "default" },
        {
          name: "fields",
          type: "array",
          fields: [
            {
              name: "key",
              type: "text",
              required: true,
              admin: { description: "Letters, numbers, dash and underscore only, such as headline." },
            },
            { name: "value", type: "text", required: true, maxLength: 300 },
          ],
        },
      ],
    },
    { name: "startedAt", type: "date" },
    { name: "stoppedAt", type: "date" },
    {
      name: "notes",
      type: "textarea",
      admin: { description: "Hypothesis and decision log for this experiment." },
    },
  ],
};
