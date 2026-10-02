import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";
import { createHostingQuote, hashOfferToken, hasLiveHostingSubscription } from "@/lib/hosting-billing";
import { expireHostingCheckoutSession, getCmsUrl, getHostingCheckoutSession, isStripeMissingResource } from "@/lib/stripe";

/**
 * Revoke the client's previous offer and close its Stripe Checkout page, so a
 * client holding an old tab cannot pay the old link as well as the new one.
 * Returns an error message when the old page cannot be closed safely.
 */
async function retirePreviousOffer(payload: any, activeOffer: unknown): Promise<string | null> {
  if (!activeOffer) return null;
  const offerId = typeof activeOffer === "object" ? (activeOffer as { id: number }).id : activeOffer;
  let offer: any;
  try { offer = await payload.findByID({ collection: "hosting-payment-offers", id: offerId, overrideAccess: true }); } catch { return null; }
  if (offer.status === "completed") return "The previous payment link has already been paid. Check the subscription before sending another link.";
  if (offer.stripeCheckoutSessionId) {
    try {
      const session = await getHostingCheckoutSession(offer.stripeCheckoutSessionId);
      if (session.status === "complete") return "The client has just paid the previous link. Refresh the page to see their subscription.";
      if (session.status === "open") await expireHostingCheckoutSession(session.id);
    } catch (error) {
      // A deleted session can no longer be paid; anything else might still be open.
      if (!isStripeMissingResource(error)) return "Could not close the client's previous Stripe payment page. Try again in a minute.";
    }
  }
  await payload.update({ collection: "hosting-payment-offers", id: offer.id, data: { status: "revoked" }, overrideAccess: true });
  return null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const payload = await getPayload({ config: await config }); const { user } = await payload.auth({ headers: req.headers }); if (!user || !userHasFeature(user, "clients")) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
 const { id } = await params; const client: any = await payload.findByID({ collection: "clients", id, overrideAccess: true }); const settings: any = await payload.findGlobal({ slug: "hosting-billing-settings", overrideAccess: true }); const hosting = client.hostingSubscription || {};
 if (!hosting.planName || !hosting.recipientEmail || !hosting.monthlyBaseCents || !hosting.annualBaseCents || !hosting.billingInterval) return NextResponse.json({ error: "Save a plan, monthly fee, client email and billing interval before generating an offer." }, { status: 422 });
 const surcharge = { percentage: Number(settings.cardSurchargePercentage), fixedCents: Number(settings.cardSurchargeFixedCents) }; const base = { currency: settings.currency || "aud", allowance: hosting.allowance || "", clause: hosting.capacityClause || settings.capacityChangeClause || "", planName: hosting.planName, surcharge };
 const snapshot = { monthly: createHostingQuote({ ...base, baseCents: Number(hosting.monthlyBaseCents), interval: "month" }), annual: createHostingQuote({ ...base, baseCents: Number(hosting.annualBaseCents), interval: "year" }), selectedInterval: hosting.billingInterval, recipientEmail: hosting.recipientEmail, recipientName: hosting.recipientName || "" };
 if (hasLiveHostingSubscription(hosting)) return NextResponse.json({ error: "This client already has an active hosting subscription. Stop it before sending a new payment link, or use a price change to adjust it." }, { status: 409 });
 const retireError = await retirePreviousOffer(payload, hosting.activeOffer); if (retireError) return NextResponse.json({ error: retireError }, { status: 409 });
 const token = crypto.randomBytes(32).toString("base64url"); const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString(); const offer: any = await (payload as any).create({ collection: "hosting-payment-offers", data: { client: Number(id), tokenHash: hashOfferToken(token), expiresAt, snapshot }, overrideAccess: true });
 await payload.update({ collection: "clients", id, data: { hostingSubscription: { ...hosting, activeOffer: offer.id, offerCreatedAt: new Date().toISOString(), offerExpiresAt: expiresAt } }, overrideAccess: true });
 return NextResponse.json({ offerId: offer.id, url: `${getCmsUrl()}/hosting-pay/${token}`, expiresAt, snapshot });
}
