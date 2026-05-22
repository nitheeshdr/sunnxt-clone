import { type NextRequest, NextResponse } from "next/server";
import { getSunnxtCookies } from "@/lib/sunnxt-session";
import { DEFAULT_HEADERS } from "@/lib/api";

const ALLOWED_HOSTS = [
  "sunnxt.com",
  "akamaized.net",
  "cdn.sunnxt.com",
];

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const filename = request.nextUrl.searchParams.get("filename") || "subtitle.vtt";

  if (!url) return new NextResponse("Missing url", { status: 400 });

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  const allowed =
    ALLOWED_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`)) &&
    (hostname.endsWith(".akamaized.net") ? hostname.includes("suntvvod") : true);

  if (!allowed) return new NextResponse("Domain not allowed", { status: 403 });

  try {
    const cookie = await getSunnxtCookies().catch(() => "");
    const upstream = await fetch(url, {
      headers: { ...DEFAULT_HEADERS, ...(cookie ? { cookie } : {}) },
    });

    if (!upstream.ok) {
      return new NextResponse(null, { status: upstream.status });
    }

    const contentType = upstream.headers.get("content-type") ?? "text/plain";
    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": contentType,
        "content-disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "access-control-allow-origin": "*",
      },
    });
  } catch (e) {
    console.error("Download proxy error:", e);
    return new NextResponse("Download failed", { status: 500 });
  }
}
