import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";
import { createHostingQuote, hashOfferToken } from "@/lib/hosting-billing";
import { getCmsUrl } from "@/lib/stripe";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const payload = await getPayload({ config: await config }); const { user } = await payload.auth({ headers: req.headers }); if (!user || !userHasFeature(user, "clients")) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
 const { id } = await params; const client: any = await payload.findByID({ collection: "clients", id, overrideAccess: true }); const settings: any = await payload.findGlobal({ slug: "hosting-billing-settings", overrideAccess: true }); const hosting = client.hostingSubscription || {};
 if (!hosting.planName || !hosting.recipientEmail || !hosting.monthlyBaseCents || !hosting.annualBaseCents || !hosting.billingInterval) return NextResponse.json({ error: "Save a plan, monthly fee, client email and billing interval before generating an offer." }, { status: 422 });
 const surcharge = { percentage: Number(settings.cardSurchargePercentage), fixedCents: Number(settings.cardSurchargeFixedCents) }; const base = { currency: settings.currency || "aud", allowance: hosting.allowance || "", clause: hosting.capacityClause || settings.capacityChangeClause || "", planName: hosting.planName, surcharge };
 const snapshot = { monthly: createHostingQuote({ ...base, baseCents: Number(hosting.monthlyBaseCents), interval: "month" }), annual: createHostingQuote({ ...base, baseCents: Number(hosting.annualBaseCents), interval: "year" }), selectedInterval: hosting.billingInterval, recipientEmail: hosting.recipientEmail, recipientName: hosting.recipientName || "" };
 if (hosting.activeOffer) await payload.update({ collection: "hosting-payment-offers", id: typeof hosting.activeOffer === "object" ? hosting.activeOffer.id : hosting.activeOffer, data: { status: "revoked" }, overrideAccess: true });
 const token = crypto.randomBytes(32).toString("base64url"); const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString(); const offer: any = await (payload as any).create({ collection: "hosting-payment-offers", data: { client: Number(id), tokenHash: hashOfferToken(token), expiresAt, snapshot }, overrideAccess: true });
 await payload.update({ collection: "clients", id, data: { hostingSubscription: { ...hosting, activeOffer: offer.id, offerCreatedAt: new Date().toISOString(), offerExpiresAt: expiresAt } }, overrideAccess: true });
 return NextResponse.json({ offerId: offer.id, url: `${getCmsUrl()}/hosting-pay/${token}`, expiresAt, snapshot });
}
