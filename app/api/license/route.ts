import { type NextRequest, NextResponse } from "next/server";
import { getSunnxtCookies } from "@/lib/sunnxt-session";
import { DEFAULT_HEADERS } from "@/lib/api";

export async function POST(request: NextRequest) {
  const licenseUrl = request.nextUrl.searchParams.get("url");
  if (!licenseUrl) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  try {
    const cookie = await getSunnxtCookies();
    const challenge = await request.arrayBuffer();

    const res = await fetch(licenseUrl, {
      method: "POST",
      headers: {
        ...DEFAULT_HEADERS,
        cookie,
        "content-type": "application/octet-stream",
      },
      body: challenge,
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `DRM license server responded with ${res.status}` },
        { status: res.status }
      );
    }

    const licenseData = await res.arrayBuffer();
    return new NextResponse(licenseData, {
      headers: { "content-type": "application/octet-stream" },
    });
  } catch (e) {
    console.error("License proxy error:", e);
    return NextResponse.json({ error: "License proxy failed" }, { status: 500 });
  }
}
