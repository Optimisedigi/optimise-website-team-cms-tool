import type { CollectionConfig } from "payload";
import { hasValidApiKey } from "./api-key-access";
import { canAccessOrApiKey, adminOnlyDelete, hideUnlessFeature } from "../lib/access";

export const ContentResearches: CollectionConfig = {
  slug: "content-researches",
  labels: {
    singular: "Content Research",
    plural: "Content Researches",
  },
  admin: {
    useAsTitle: "keyword",
    group: "Growth Tools",
    defaultColumns: ["keyword", "location", "totalQuestions", "createdAt"],
    description: "Content research results from the growth tools",
    hidden: hideUnlessFeature("content-researches"),
  },
  access: {
    read: canAccessOrApiKey("content-researches", hasValidApiKey),
    update: canAccessOrApiKey("content-researches", hasValidApiKey),
    delete: adminOnlyDelete,
    create: canAccessOrApiKey("content-researches", hasValidApiKey),
  },
  fields: [
    {
      type: "row",
      fields: [
        {
          name: "keyword",
          type: "text",
          required: true,
          admin: {
            description: "The keyword researched",
          },
        },
        {
          name: "location",
          type: "text",
          admin: {
            description: "Location used for research (e.g. 'au')",
          },
        },
      ],
    },
    {
      name: "totalQuestions",
      type: "number",
      admin: {
        description: "Total number of questions/topics found",
      },
    },
    {
      name: "clusters",
      type: "json",
      admin: {
        description:
          "Array of topic clusters — each has label (string) and questions (array of { question, source, modifier, searchVolume })",
      },
    },
    {
      name: "externalId",
      type: "text",
      admin: {
        description: "ID returned by the content research API",
      },
    },
    {
      name: "proposal",
      type: "relationship",
      relationTo: "client-proposals",
      admin: {
        position: "sidebar",
        description: "Link to client proposal",
      },
    },
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      admin: {
        position: "sidebar",
        description: "Link to client (set on proposal conversion)",
      },
    },
  ],
};
