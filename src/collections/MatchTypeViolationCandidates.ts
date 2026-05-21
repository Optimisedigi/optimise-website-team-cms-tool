import type { CollectionConfig } from "payload";
import { adminOnlyDelete } from "../lib/access";

export const MatchTypeViolationCandidates: CollectionConfig = {
  slug: "match-type-violation-candidates",
  dbName: "match_type_violation_candidates",
  labels: {
    singular: "Match Type Violation Candidate",
    plural: "Match Type Violation Candidates",
  },
  admin: {
    hidden: true,
    group: "Growth Tools",
    defaultColumns: [
      "client",
      "searchTerm",
      "triggeringKeyword",
      "matchType",
      "violationType",
      "impressions",
      "clicks",
      "cost",
      "status",
    ],
    components: {
      views: {
        list: {
          Component: "./components/match-type-violations/MatchTypeViolationReviewList",
        },
      },
    },
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: adminOnlyDelete,
  },
  fields: [
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      required: true,
      index: true,
    },
    {
      name: "searchTerm",
      type: "text",
      required: true,
      label: "Search Term",
      admin: {
        description: "The actual search query that triggered the ad",
      },
    },
    {
      name: "triggeringKeyword",
      type: "text",
      required: true,
      label: "Triggering Keyword",
      admin: {
        description: "The keyword Google matched to the search term",
      },
    },
    {
      name: "campaignName",
      type: "text",
      label: "Campaign",
    },
    {
      name: "adGroupName",
      type: "text",
      label: "Ad Group",
    },
    {
      name: "matchType",
      type: "select",
      required: true,
      options: [
        { label: "Exact", value: "EXACT" },
        { label: "Phrase", value: "PHRASE" },
      ],
      admin: {
        description: "The match type of the triggering keyword",
      },
    },
    {
      name: "violationType",
      type: "select",
      required: true,
      options: [
        {
          label: "Exact Close Variant",
          value: "exact_close_variant",
        },
        {
          label: "Phrase Missing Word",
          value: "phrase_missing_word",
        },
      ],
      admin: {
        description:
          "exact_close_variant: EXACT keyword served a non-identical term. phrase_missing_word: PHRASE keyword is missing a required word.",
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "impressions",
          type: "number",
          defaultValue: 0,
          admin: { width: "50%" },
        },
        {
          name: "clicks",
          type: "number",
          defaultValue: 0,
          admin: { width: "50%" },
        },
      ],
    },
    {
      name: "status",
      type: "select",
      defaultValue: "pending",
      required: true,
      options: [
        { label: "Pending", value: "pending" },
        { label: "Approved", value: "approved" },
        { label: "Rejected", value: "rejected" },
      ],
      index: true,
    },
    {
      name: "assignedListId",
      type: "relationship",
      relationTo: "negative-keyword-lists",
      label: "Assigned Negative Keyword List",
      admin: {
        description: "The negative keyword list this candidate was approved into",
      },
    },
    {
      name: "approvedAt",
      type: "date",
      admin: {
        date: { pickerAppearance: "dayAndTime" },
      },
    },
    {
      name: "rejectedAt",
      type: "date",
      admin: {
        date: { pickerAppearance: "dayAndTime" },
      },
    },
    {
      name: "approvedBy",
      type: "relationship",
      relationTo: "users",
      admin: {
        readOnly: true,
      },
    },
    {
      name: "lastSeenAt",
      type: "date",
      required: true,
      label: "Last Seen",
      admin: {
        date: { pickerAppearance: "dayAndTime" },
        description: "Most recent cron run that flagged this term",
      },
    },
    {
      name: "firstSeenAt",
      type: "date",
      required: true,
      label: "First Seen",
      admin: {
        date: { pickerAppearance: "dayAndTime" },
        description: "First time this term was flagged",
      },
    },
    {
      name: "runDate",
      type: "date",
      required: true,
      label: "Run Date",
      admin: {
        date: { pickerAppearance: "dayOnly" },
        description: "The cron run date this row belongs to",
      },
    },
  ],
};
