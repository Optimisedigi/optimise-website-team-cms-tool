import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { attributeChannel, type Attribution } from "@/lib/lead-channel";

const INBOUND_LEAD_KEY = process.env.INBOUND_LEAD_KEY;

/**
 * POST /api/leads/inbound
 *
 * Receives lead submissions from the website contact form (and future
 * growth tool audit forms). Auto-attributes the channel based on UTM
 * params, gclid/fbclid, and referrer data.
 *
 * Auth: x-lead-key header must match INBOUND_LEAD_KEY env var.
 */

// ── Service slug mapping (website form → CMS values) ─────

const SERVICE_MAP: Record<string, string> = {
  seo: "seo",
  cro: "cro",
  "google-ads": "google_ads",
  "facebook-ads": "meta_ads",
  "ai-automation": "ai_automations",
  "ai-search-optimisation": "seo",
  "integrated-digital-growth-strategy": "full_service",
  "open-to-recommendations": "full_service",
};

// ── Request body type ──────────────────────────────────────

interface InboundLeadBody {
  // Contact info
  name: string;
  email: string;
  website: string;
  // Form data
  services?: string[];
  heardAbout?: string;
  growthJourney?: string;
  focusAreas?: string[];
  currentSetup?: string;
  paidBudget?: string;
  holdback?: string;
  // Attribution
  attribution?: Attribution;
  // Source identifier
  formType?: "contact" | "audit" | "other";
  // Auto-reply notification (set by website when auto-reply email sent)
  autoReplySent?: boolean;
  autoReplySubject?: string;
  autoReplySentAt?: string;
}

export async function POST(request: Request) {
  try {
    // Auth check
    const key = request.headers.get("x-lead-key");
    if (!INBOUND_LEAD_KEY || key !== INBOUND_LEAD_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: InboundLeadBody = await request.json();

    // Validate required fields
    if (!body.name || !body.email || !body.website) {
      return NextResponse.json(
        { error: "Missing required fields: name, email, website" },
        { status: 400 },
      );
    }

    // Attribution
    const attrs = { ...(body.attribution || {}), heardAbout: body.heardAbout };
    const { channel, channelDetail } = attributeChannel(attrs);

    // Map website service slugs to CMS values
    const cmsServices = (body.services || [])
      .map((s) => SERVICE_MAP[s])
      .filter(Boolean);

    // Build notes from form context
    const notesParts: string[] = [];
    if (body.autoReplySent)
      notesParts.push(`Auto-reply sent: "${body.autoReplySubject || "Yes"}" at ${body.autoReplySentAt || new Date().toISOString()}`);
    if (body.growthJourney)
      notesParts.push(`Growth journey: ${body.growthJourney}`);
    if (body.focusAreas?.length)
      notesParts.push(`Focus areas: ${body.focusAreas.join(", ")}`);
    if (body.currentSetup)
      notesParts.push(`Current setup: ${body.currentSetup}`);
    if (body.paidBudget) notesParts.push(`Paid budget: ${body.paidBudget}`);
    if (body.holdback) notesParts.push(`Holdback: ${body.holdback}`);

    const payload = await getPayload({ config });

    // Check for duplicate (same email in last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const existing = await payload.find({
      collection: "sales-leads" as any,
      where: {
        contactEmail: { equals: body.email },
        createdAt: { greater_than: oneDayAgo },
      },
      limit: 1,
      overrideAccess: true,
    });

    if (existing.docs.length > 0) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        leadId: (existing.docs[0] as any).id,
        message: "Lead already exists (submitted within last 24h)",
      });
    }

    // Extract business name from website URL if possible
    const businessName = extractBusinessName(body.website) || body.name;

    const lead = await payload.create({
      collection: "sales-leads" as any,
      overrideAccess: true,
      data: {
        businessName,
        websiteUrl: normalizeUrl(body.website),
        contactName: body.name,
        contactEmail: body.email,
        channel,
        channelDetail,
        services: cmsServices,
        notes: notesParts.length > 0 ? notesParts.join("\n") : undefined,
        stage: body.autoReplySent ? "contacted" : "new_lead",
        priority: "medium",
        // Attribution fields
        utmSource: attrs.utmSource || undefined,
        utmMedium: attrs.utmMedium || undefined,
        utmCampaign: attrs.utmCampaign || undefined,
        utmTerm: attrs.utmTerm || undefined,
        gclid: attrs.gclid || undefined,
        fbclid: attrs.fbclid || undefined,
        landingPage: attrs.landingPage || undefined,
        referrerUrl: attrs.referrerUrl || undefined,
        leadSource:
          body.formType === "audit" ? "growth_tool" : "website_form",
        heardAbout: body.heardAbout || undefined,
      } as any,
    });

    console.log(
      `[inbound-lead] Created lead ${(lead as any).id}: ${businessName} via ${channel} (${channelDetail})`,
    );

    return NextResponse.json({
      success: true,
      leadId: (lead as any).id,
      channel,
      channelDetail,
    });
  } catch (err) {
    console.error("[inbound-lead] Error:", err);
    return NextResponse.json(
      { error: "Failed to create lead", details: String(err) },
      { status: 500 },
    );
  }
}

// ── Helpers ────────────────────────────────────────────────

function extractBusinessName(website: string): string | null {
  try {
    const url = new URL(
      website.startsWith("http") ? website : `https://${website}`,
    );
    const hostname = url.hostname.replace(/^www\./, "");
    // Capitalize first letter of each part
    const parts = hostname.split(".").slice(0, -1); // drop TLD
    if (parts.length === 0) return null;
    return parts
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
  } catch {
    return null;
  }
}

function normalizeUrl(website: string): string {
  if (!website) return website;
  if (website.startsWith("http://") || website.startsWith("https://")) {
    return website;
  }
  return `https://${website}`;
}
