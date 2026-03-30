import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { neon } from "@neondatabase/serverless";
import { getEmailBuilder, type AuditLeadData } from "@/lib/drip-email-preview";

/**
 * GET /api/drip-leads
 *
 * Returns all Google Ads audit drip leads with their email send status.
 * Auth: requires valid Payload CMS admin session.
 *
 * Query params:
 *   ?preview=2&id=5  — returns rendered HTML for email 2, lead 5
 */

function getSQL() {
  const url = process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;
  if (!url) return null;
  return neon(url);
}

export async function GET(req: NextRequest) {
  // Auth: require logged-in Payload admin
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getSQL();
  if (!sql) {
    return NextResponse.json(
      { error: "POSTGRES_URL not configured" },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const previewEmail = searchParams.get("preview");
  const leadId = searchParams.get("id");

  // ── Email preview mode ──
  if (previewEmail && leadId) {
    const emailNumber = parseInt(previewEmail, 10);
    const id = parseInt(leadId, 10);
    if (isNaN(emailNumber) || isNaN(id)) {
      return NextResponse.json({ error: "Invalid params" }, { status: 400 });
    }

    const builder = getEmailBuilder(emailNumber);
    if (!builder) {
      return NextResponse.json(
        { error: "Invalid email number" },
        { status: 400 },
      );
    }

    const rows = await sql`SELECT * FROM drip_leads WHERE id = ${id}`;
    if (!rows.length) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const lead = rows[0];
    const data: AuditLeadData = {
      name: lead.name as string,
      email: lead.email as string,
      website: lead.website as string,
      monthlySpend: lead.monthly_spend as string,
      biggestConcern: lead.biggest_concern as string,
      additionalNotes: lead.additional_notes as string,
    };

    const { subject, html } = builder(data);
    return NextResponse.json({ subject, html });
  }

  // ── List all leads with email status ──
  const leads = await sql`
    SELECT dl.*,
      (SELECT json_agg(
        json_build_object('email_number', des.email_number, 'sent_at', des.sent_at)
        ORDER BY des.email_number
      )
      FROM drip_emails_sent des WHERE des.lead_id = dl.id
      ) as emails_detail
    FROM drip_leads dl
    ORDER BY dl.created_at DESC
    LIMIT 200
  `;

  return NextResponse.json({ leads });
}
