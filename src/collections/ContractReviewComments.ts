import type { CollectionConfig } from "payload";
import { adminOnlyDelete, canAccess } from "../lib/access";

/**
 * Inline comments left on a draft contract by its account manager through the
 * public review link (/contracts/review/[token]). Created only by the
 * token-gated review API (overrideAccess), never through the admin or REST
 * create path. Staff with Contracts access can read them and mark them
 * resolved from the contract's Draft Review tab.
 */
export const ContractReviewComments: CollectionConfig = {
  slug: "contract-review-comments",
  labels: { singular: "Contract Review Comment", plural: "Contract Review Comments" },
  lockDocuments: false,
  admin: { hidden: true, useAsTitle: "comment", group: "Clients" },
  defaultSort: "createdAt",
  access: {
    read: canAccess("contracts"),
    create: () => false,
    update: canAccess("contracts"),
    delete: adminOnlyDelete,
  },
  fields: [
    { name: "contract", type: "relationship", relationTo: "contracts", required: true, index: true },
    {
      name: "quote",
      type: "textarea",
      required: true,
      admin: { readOnly: true, description: "The contract text the reviewer highlighted." },
    },
    {
      name: "occurrence",
      type: "number",
      defaultValue: 0,
      admin: { readOnly: true, description: "Which match of the quote on the page (0 = first)." },
    },
    { name: "section", type: "text", admin: { readOnly: true } },
    { name: "comment", type: "textarea", required: true, admin: { readOnly: true } },
    { name: "authorName", type: "text", admin: { readOnly: true } },
    {
      name: "emailedAt",
      type: "date",
      index: true,
      admin: { readOnly: true, description: "When this comment was emailed to the agency contact." },
    },
    { name: "resolved", type: "checkbox", defaultValue: false },
  ],
};
