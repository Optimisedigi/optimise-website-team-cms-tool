const DEFAULT_LOCAL_ORIGIN = "http://localhost:3004";

function getServerOrigin(): string {
  if (process.env.NEXT_PUBLIC_SERVER_URL) {
    return process.env.NEXT_PUBLIC_SERVER_URL;
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  return DEFAULT_LOCAL_ORIGIN;
}

function isTrustedBlobHost(hostname: string): boolean {
  return hostname === "public.blob.vercel-storage.com" || hostname.endsWith(".public.blob.vercel-storage.com");
}

export function resolveTrustedMediaUrl(rawUrl: string): string | null {
  const serverOrigin = getServerOrigin();

  try {
    const parsed = new URL(rawUrl, serverOrigin);
    const server = new URL(serverOrigin);

    if (parsed.protocol !== "https:" && parsed.origin !== server.origin) {
      return null;
    }

    if (parsed.origin === server.origin || isTrustedBlobHost(parsed.hostname)) {
      return parsed.toString();
    }

    return null;
  } catch {
    return null;
  }
}
