import { type NextRequest, NextResponse } from "next/server";
import { getSunnxtCookies } from "@/lib/sunnxt-session";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

export async function POST(request: NextRequest) {
  const licenseUrl = request.nextUrl.searchParams.get("url");
  if (!licenseUrl) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  try {
    const challenge = await request.arrayBuffer();

    // HAR analysis shows the real SunNXT player sends no cookies to pwaapi.sunnxt.com —
    // the license server authenticates via the Widevine CDM device certificate embedded
    // in the challenge itself.  Sending unexpected session cookies can cause rejection.
    // First try without cookies (matches real browser behavior); if rejected, retry with
    // the server-side session cookie in case this particular content needs subscription auth.
    const cookie = await getSunnxtCookies().catch(() => "");

    const makeRequest = (withCookie: boolean) =>
      fetch(licenseUrl, {
        method: "POST",
        headers: {
          origin: "https://www.sunnxt.com",
          referer: "https://www.sunnxt.com/",
          "user-agent": UA,
          "content-type": "application/octet-stream",
          ...(withCookie && cookie ? { cookie } : {}),
        },
        body: challenge,
        cache: "no-store",
      });

    let res = await makeRequest(false);
    if (!res.ok && cookie) {
      // Retry with session cookie — some premium content validates subscription here
      res = await makeRequest(true);
    }

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
