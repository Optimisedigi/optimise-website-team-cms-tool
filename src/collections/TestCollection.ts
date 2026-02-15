import type { CollectionConfig } from "payload";

export const TestCollection: CollectionConfig = {
  slug: "test-items",
  admin: {
    group: "Audits",
  },
  fields: [
    {
      name: "title",
      type: "text",
    },
  ],
};
