import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { exchangeSheetsCode, getSheetsUserEmail } from "@/lib/sheets-service";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/admin/globals/sheets-auth?sheets_error=${encodeURIComponent(error)}`,
        req.url
      )
    );
  }

  if (!code) {
    return NextResponse.json(
      { error: "Missing authorization code" },
      { status: 400 }
    );
  }

  try {
    const tokens = await exchangeSheetsCode(code);
    const email = await getSheetsUserEmail(tokens.accessToken);

    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });

    await payload.updateGlobal({
      slug: "sheets-auth" as any,
      data: {
        refreshToken: tokens.refreshToken,
        connectedEmail: email,
        connectedAt: new Date().toISOString(),
      } as any,
      overrideAccess: true,
    });

    return NextResponse.redirect(
      new URL("/admin/globals/sheets-auth", req.url)
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "OAuth exchange failed";
    console.error("[sheets-callback]", message);
    return NextResponse.redirect(
      new URL(
        `/admin/globals/sheets-auth?sheets_error=${encodeURIComponent(message)}`,
        req.url
      )
    );
  }
}
