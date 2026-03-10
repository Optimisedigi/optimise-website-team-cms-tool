import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * GET /api/client-processes/templates
 *
 * Returns all active process templates with phase/step counts.
 * Auth: Payload session OR x-api-key matching AUDIT_API_KEY.
 */
export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config });

    // Auth: require Payload session or API key
    const apiKey = req.headers.get("x-api-key");
    const { user } = await payload.auth({ headers: req.headers });

    if (!user && (!apiKey || apiKey !== process.env.AUDIT_API_KEY)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await payload.find({
      collection: "process-templates" as any,
      where: { isActive: { equals: true } },
      sort: "name",
      limit: 100,
      overrideAccess: true,
    });

    const templates = result.docs.map((doc: any) => {
      const phases = doc.phases || [];
      const stepCount = phases.reduce(
        (sum: number, phase: any) => sum + (phase.steps?.length || 0),
        0,
      );

      return {
        id: doc.id,
        name: doc.name,
        slug: doc.slug,
        retainerType: doc.retainerType,
        description: doc.description || null,
        isDefault: doc.isDefault || false,
        phaseCount: phases.length,
        stepCount,
      };
    });

    return NextResponse.json({ templates });
  } catch (err) {
    console.error("[client-processes/templates] Error:", err);
    return NextResponse.json(
      { error: "Failed to load templates", details: String(err) },
      { status: 500 },
    );
  }
}
