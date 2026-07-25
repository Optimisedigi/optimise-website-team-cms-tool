import type { CollectionConfig } from "payload";
import { canAccess, adminOnlyDelete, hideUnlessAnyFeature } from "../lib/access";

export const HostingPaymentOffers: CollectionConfig = {
  slug: "hosting-payment-offers",
  admin: { group: "Finance", hidden: hideUnlessAnyFeature("clients"), useAsTitle: "id" },
  access: { read: canAccess("clients"), create: canAccess("clients"), update: canAccess("clients"), delete: adminOnlyDelete },
  fields: [
    { name: "client", type: "relationship", relationTo: "clients", required: true, index: true },
    { name: "tokenHash", type: "text", required: true, unique: true, access: { read: () => false } },
    { name: "status", type: "select", required: true, defaultValue: "active", options: ["active", "checkout_pending", "completed", "revoked", "expired"] },
    { name: "expiresAt", type: "date", required: true, index: true }, { name: "selectedInterval", type: "select", options: ["month", "year"] }, { name: "stripeCheckoutSessionId", type: "text" },
    { name: "snapshot", type: "json", required: true, admin: { description: "Immutable plan, fee, quote and contractual-term snapshot." } },
  ],
};
