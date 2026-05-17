import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { checkPinWithLockout } from "@/lib/pin-auth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const pin = searchParams.get("pin");

  if (!slug || !pin) {
    return NextResponse.json({ error: "slug and pin are required" }, { status: 400 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  try {
    const results = await payload.find({
      collection: "google-ads-audits",
      where: { slug: { equals: slug } },
      limit: 1,
      overrideAccess: true,
    });

    if (!results.docs.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const audit = results.docs[0] as any;

    if (!audit.adCopyPublished) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const pinResult = await checkPinWithLockout(
      `ad-copy-comments:${audit.id}`,
      pin,
      audit.presentationPin ?? "",
    );
    if (!pinResult.ok) {
      return NextResponse.json(
        { error: pinResult.message },
        { status: pinResult.status },
      );
    }

    return NextResponse.json({ comments: audit.adCopyComments || [] });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { slug, pin } = body;
  if (!slug || !pin) {
    return NextResponse.json({ error: "slug and pin are required" }, { status: 400 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  try {
    const results = await payload.find({
      collection: "google-ads-audits",
      where: { slug: { equals: slug } },
      limit: 1,
      overrideAccess: true,
    });

    if (!results.docs.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const audit = results.docs[0] as any;

    if (!audit.adCopyPublished) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const pinResult = await checkPinWithLockout(
      `ad-copy-comments:${audit.id}`,
      pin,
      audit.presentationPin ?? "",
    );
    if (!pinResult.ok) {
      return NextResponse.json(
        { error: pinResult.message },
        { status: pinResult.status },
      );
    }

    // Handle save-edits action — client edited ad copy directly
    if (body.action === "save-edits" && body.adCopy) {
      const dbClient = (payload.db as any).client;

      // On first client edit, snapshot the original generated copy for change history
      if (!audit.adCopyOriginalCopy && audit.generatedAdCopy) {
        const originalCopy = typeof audit.generatedAdCopy === "string"
          ? audit.generatedAdCopy
          : JSON.stringify(audit.generatedAdCopy);
        await dbClient.execute({
          sql: "UPDATE google_ads_audits SET ad_copy_original_copy = ? WHERE id = ?",
          args: [originalCopy, audit.id],
        });
      }

      await dbClient.execute({
        sql: "UPDATE google_ads_audits SET generated_ad_copy = ? WHERE id = ?",
        args: [JSON.stringify(body.adCopy), audit.id],
      });
      return NextResponse.json({ ok: true });
    }

    // Handle submit-approval action — client approves ad copy + notify team
    if (body.action === "submit-approval") {
      const dbClient = (payload.db as any).client;
      await dbClient.execute({
        sql: "UPDATE google_ads_audits SET ad_copy_status = ?, ad_copy_approved_at = ? WHERE id = ?",
        args: ["approved", new Date().toISOString(), audit.id],
      });

      // Send notification email to account managers (from linked client) or fallback
      const POSTMARK_API_KEY = process.env.POSTMARK_API_KEY;
      const FROM_EMAIL = process.env.AUDIT_FROM_EMAIL || "audits@optimisedigital.online";
      const FALLBACK_EMAIL = process.env.TEAM_NOTIFICATION_EMAIL || FROM_EMAIL;

      // Get account manager emails from the linked client
      let toEmails: string[] = [];
      if (audit.client) {
        try {
          const clientId = typeof audit.client === "object" ? audit.client.id : audit.client;
          const client = await payload.findByID({ collection: "clients", id: clientId, overrideAccess: true });
          const managers = (client as any).accountManagers;
          if (Array.isArray(managers)) {
            toEmails = managers.map((m: any) => m.email).filter(Boolean);
          }
        } catch { /* client lookup failed, use fallback */ }
      }

      if (toEmails.length === 0) toEmails = [FALLBACK_EMAIL];
      const TEAM_EMAIL = toEmails.join(",");

      if (POSTMARK_API_KEY) {
        try {
          await fetch("https://api.postmarkapp.com/email", {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              "X-Postmark-Server-Token": POSTMARK_API_KEY,
            },
            body: JSON.stringify({
              From: FROM_EMAIL,
              To: TEAM_EMAIL,
              Subject: `Ad Copy Approved — ${audit.businessName || "Client"}`,
              HtmlBody: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #1e293b;">Ad Copy Approved</h2>
                  <p style="color: #475569; font-size: 15px; line-height: 1.6;">
                    The client has reviewed and submitted the ad copy for <strong>${audit.businessName}</strong> for approval.
                  </p>
                  <p style="color: #475569; font-size: 15px; line-height: 1.6;">
                    Review the final ad copy in the CMS and build the responsive search ads when ready.
                  </p>
                  <a href="https://cms.optimisedigital.online/admin/collections/google-ads-audits/${audit.id}"
                     style="display: inline-block; padding: 12px 24px; background: #7c3aed; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 12px;">
                    View in CMS
                  </a>
                </div>
              `,
              MessageStream: "outbound",
            }),
          });
          console.log(`[ad-copy-comments] Approval notification sent for ${audit.businessName}`);
        } catch (emailErr) {
          console.error("[ad-copy-comments] Failed to send approval notification:", emailErr);
        }
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("[ad-copy-comments] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
