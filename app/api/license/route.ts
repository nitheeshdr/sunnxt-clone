import { type NextRequest, NextResponse } from "next/server";
import { getSunnxtCookies } from "@/lib/sunnxt-session";
import { DEFAULT_HEADERS } from "@/lib/api";

export async function POST(request: NextRequest) {
  const licenseUrl = request.nextUrl.searchParams.get("url");
  if (!licenseUrl) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  try {
    // Prefer the browser's session cookie; fall back to the server credential session.
    // Nagravision validates the SunNXT session alongside the JWT in the URL.
    const browserCookie = request.headers.get("cookie") || "";
    let cookie = browserCookie;
    if (!cookie.includes("sessionid")) {
      cookie = await getSunnxtCookies().catch(() => browserCookie);
    }

    const challenge = await request.arrayBuffer();

    const res = await fetch(licenseUrl, {
      method: "POST",
      headers: {
        ...DEFAULT_HEADERS,
        cookie,
        "content-type": "application/octet-stream",
        "x-forwarded-for": request.headers.get("x-forwarded-for") || "",
      },
      body: challenge,
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`License server ${res.status} for ${licenseUrl.split("?")[0]}:`, body.slice(0, 200));
      return NextResponse.json(
        { error: `DRM license server responded with ${res.status}`, detail: body.slice(0, 200) },
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
