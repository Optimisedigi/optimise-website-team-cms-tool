import type { CollectionConfig } from "payload";
import { canAccess, adminOnlyDelete, hideUnlessAnyFeature } from "../lib/access";

export const HostingPaymentOffers: CollectionConfig = {
  slug: "hosting-payment-offers",
  // Never edited in the admin; see the locked-documents note in payload.config.ts.
  lockDocuments: false,
  admin: { group: "Finance", hidden: hideUnlessAnyFeature("clients"), useAsTitle: "id" },
  // Offers are issued and updated only by server routes (overrideAccess). Staff
  // can view them, but a hand-made or edited offer could carry any price.
  access: { read: canAccess("clients"), create: () => false, update: () => false, delete: adminOnlyDelete },
  fields: [
    { name: "client", type: "relationship", relationTo: "clients", required: true, index: true },
    { name: "tokenHash", type: "text", required: true, unique: true, access: { read: () => false } },
    { name: "status", type: "select", required: true, defaultValue: "active", options: ["active", "checkout_pending", "completed", "revoked", "expired"] },
    { name: "expiresAt", type: "date", required: true, index: true }, { name: "selectedInterval", type: "select", options: ["month", "year"] }, { name: "stripeCheckoutSessionId", type: "text" },
    { name: "snapshot", type: "json", required: true, admin: { description: "Immutable plan, fee, quote and contractual-term snapshot." } },
  ],
};
