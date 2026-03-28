import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const SCRAPLING_SERVICE_URL = process.env.SCRAPLING_SERVICE_URL;
const SCRAPLING_SERVICE_KEY = process.env.SCRAPLING_SERVICE_KEY;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  // Auth check
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!SCRAPLING_SERVICE_URL || !SCRAPLING_SERVICE_KEY) {
    return NextResponse.json(
      { error: "Server misconfigured: missing SCRAPLING_SERVICE_URL or SCRAPLING_SERVICE_KEY" },
      { status: 500 }
    );
  }

  // Fetch the client record
  let client: any;
  try {
    client = await payload.findByID({
      collection: "clients",
      id,
      overrideAccess: true,
    });
  } catch {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const websiteUrl = client.websiteUrl;
  if (!websiteUrl) {
    return NextResponse.json(
      { error: "Client has no website URL configured" },
      { status: 400 }
    );
  }

  // Parse expected events from textarea (comma or newline separated)
  const expectedEvents = client.expectedEvents
    ? client.expectedEvents
        .split(/[\n,]+/)
        .map((e: string) => e.trim())
        .filter(Boolean)
    : undefined;

  // Create the audit record
  let audit: any;
  try {
    audit = await payload.create({
      collection: "tag-setup-audits",
      data: {
        client: Number(id),
        url: websiteUrl,
        status: "running",
        canAutoFix: client.websiteType === "built_by_us",
      } as any,
      overrideAccess: true,
    });
  } catch (err: any) {
    console.error("[TagSetupAudit] Failed to create audit record:", err.message, err.stack);
    return NextResponse.json(
      { error: `Failed to create audit record: ${err.message}` },
      { status: 500 }
    );
  }

  // Run audit in background
  const auditWork = async () => {
    try {
      const response = await fetch(`${SCRAPLING_SERVICE_URL}/ga4-validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": SCRAPLING_SERVICE_KEY!,
        },
        body: JSON.stringify({
          url: websiteUrl,
          expected_measurement_id: client.ga4MeasurementId || undefined,
          expected_events: expectedEvents,
          timeout: 30,
          scroll: true,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Scrapling service returned ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      // Map status from Scrapling response
      const statusMap: Record<string, string> = {
        healthy: "healthy",
        warnings: "warnings",
        critical_issues: "critical_issues",
        not_configured: "not_configured",
        error: "error",
      };

      const isBuiltByUs = client.websiteType === "built_by_us";

      // Map issues from result
      const issues = (result.issues || []).map((issue: any) => ({
        severity: issue.severity || "warning",
        category: issue.category || "configuration",
        message: issue.message || "",
        fix: generateFixInstructions(issue, client, isBuiltByUs),
        autoFixable: isBuiltByUs && (issue.auto_fixable ?? false),
        fixed: false,
      }));

      // Map events from result
      const events = (result.events || []).map((ev: any) => ({
        name: ev.name || "unknown",
        measurementId: ev.measurement_id || "unknown",
      }));

      // Update the audit record with results
      await payload.update({
        collection: "tag-setup-audits",
        id: audit.id,
        data: {
          status: statusMap[result.status] || "error",
          summary: {
            gtmLoaded: result.summary?.gtm_loaded ?? false,
            ga4Configured: result.summary?.ga4_configured ?? false,
            eventsDetected: result.summary?.events_detected ?? 0,
            issuesCount: result.summary?.issues_count ?? 0,
            gtmContainerIds: (result.summary?.gtm_container_ids || []).join(", "),
            measurementIds: (result.summary?.measurement_ids || []).join(", "),
            consentModeDetected: result.summary?.consent_mode_detected ?? false,
          },
          issues,
          events,
          missingEvents: result.missing_events || [],
          dataLayerEvents: result.data_layer_events || [],
          rawResult: result,
        } as any,
        overrideAccess: true,
      });
    } catch (err: any) {
      console.error(`[TagSetupAudit] Failed for client ${id}:`, err.message);

      await payload.update({
        collection: "tag-setup-audits",
        id: audit.id,
        data: {
          status: "error",
          error: err.message || "Unknown error",
        } as any,
        overrideAccess: true,
      }).catch(() => {});
    }
  };

  after(auditWork);

  return NextResponse.json({
    ok: true,
    auditId: audit.id,
    status: "running",
  });
}

/**
 * Generate platform-specific fix instructions based on the issue and client's website type.
 */
function generateFixInstructions(
  issue: any,
  client: any,
  isBuiltByUs: boolean
): string {
  const baseFix = issue.fix || "";
  const platform = client.externalCms;

  if (isBuiltByUs) {
    // For sites we built, give direct code-level instructions
    switch (issue.category) {
      case "installation":
        return `${baseFix}\n\nSince this site was built by Optimise Digital, add the GTM snippet directly to the site's <head> layout component. For Next.js sites, use the @next/third-parties GoogleTagManager component in app/layout.tsx.`;
      case "configuration":
        return `${baseFix}\n\nThis site is managed by us. Log into GTM (${client.gtmContainerId || "container ID needed"}), create a GA4 Configuration tag with Measurement ID ${client.ga4MeasurementId || "(set in CMS)"}, and publish.`;
      case "measurement_id":
        return `${baseFix}\n\nUpdate the GA4 config tag in GTM to use the correct Measurement ID. If using gtag.js directly, update the ID in the site's layout/head component.`;
      case "events":
        return `${baseFix}\n\nFor sites we manage: check the dataLayer.push() calls in the relevant page components. If using GTM, verify the event tag and trigger are configured correctly.`;
      default:
        return baseFix;
    }
  }

  // For external CMS sites, give platform-specific guidance
  switch (platform) {
    case "shopify":
      return `${baseFix}\n\nShopify: Go to Online Store > Themes > Edit code, or install the "Google & YouTube" sales channel for automatic GA4 setup. For GTM, add the container snippet to theme.liquid.`;
    case "wordpress":
      return `${baseFix}\n\nWordPress: Install the "Site Kit by Google" plugin or "GTM4WP" plugin. Alternatively, paste the GTM container code into your theme's header.php via Appearance > Theme Editor, or use a header scripts plugin.`;
    case "squarespace":
      return `${baseFix}\n\nSquarespace: Go to Settings > Developer Tools > Code Injection. Paste the GTM head snippet in the Header section and the body snippet in the Footer section.`;
    case "wix":
      return `${baseFix}\n\nWix: Go to Settings > Custom Code (or Marketing > Marketing Integrations > Google Tag Manager). Add your GTM container ID there.`;
    case "webflow":
      return `${baseFix}\n\nWebflow: Go to Project Settings > Custom Code. Paste the GTM head snippet in the Head Code section and the body snippet in the Footer Code section.`;
    default:
      return baseFix;
  }
}
