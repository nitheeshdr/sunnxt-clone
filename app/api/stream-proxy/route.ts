import { type NextRequest, NextResponse } from "next/server";
import { getSunnxtCookies } from "@/lib/sunnxt-session";
import { DEFAULT_HEADERS } from "@/lib/api";

// Domains that block CORS — must be proxied server-side
const ALLOWED_HOSTS = [
  "livestream.sunnxt.com",
  "suntvvod1.sunnxt.com",
];

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("Missing url", { status: 400 });

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  if (!ALLOWED_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`))) {
    return new NextResponse("Domain not allowed", { status: 403 });
  }

  try {
    const cookie = await getSunnxtCookies().catch(() => "");
    const upstream = await fetch(url, {
      headers: {
        ...DEFAULT_HEADERS,
        ...(cookie ? { cookie } : {}),
      },
    });

    if (!upstream.ok) {
      return new NextResponse(null, { status: upstream.status });
    }

    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    // Stream the body directly — avoids buffering large video segments in memory
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "content-type": contentType,
        "access-control-allow-origin": "*",
        "cache-control": upstream.headers.get("cache-control") ?? "no-cache",
      },
    });
  } catch (e) {
    console.error("Stream proxy error:", e);
    return new NextResponse("Proxy error", { status: 500 });
  }
}
