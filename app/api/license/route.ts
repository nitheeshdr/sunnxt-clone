import { type NextRequest, NextResponse } from "next/server";
import { getSunnxtCookies } from "@/lib/sunnxt-session";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

// The real SunNXT player overrides the licenseUrl from the media API and uses
// pwaapi.sunnxt.com/licenseproxy/v3/modularLicense/?content_id= instead.
// That endpoint has no subscription check (HAR confirms 200 for any content_id).
// Extract the content_id from the original URL query string if available, or
// accept it as a separate param.
function buildPwaapiLicenseUrl(originalUrl: string, contentId?: string | null): string | null {
  const cid = contentId ?? new URL(originalUrl).searchParams.get("content_id");
  if (!cid) return null;
  return `https://pwaapi.sunnxt.com/licenseproxy/v3/modularLicense/?content_id=${cid}`;
}

export async function POST(request: NextRequest) {
  const licenseUrl = request.nextUrl.searchParams.get("url");
  if (!licenseUrl) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  // contentId passed explicitly by the player (from the content page URL)
  const contentId = request.nextUrl.searchParams.get("contentId");

  try {
    const challenge = await request.arrayBuffer();

    const headers = {
      origin: "https://www.sunnxt.com",
      referer: "https://www.sunnxt.com/",
      "user-agent": UA,
      "content-type": "application/octet-stream",
    };

    const post = (url: string) =>
      fetch(url, { method: "POST", headers, body: challenge, cache: "no-store" });

    // 1. Try pwaapi modularLicense — no subscription check, used by the real player
    const pwaapiUrl = buildPwaapiLicenseUrl(licenseUrl, contentId);
    if (pwaapiUrl) {
      const r = await post(pwaapiUrl);
      if (r.ok) {
        console.log(`License: pwaapi bypass succeeded for content_id=${contentId || "?"}`);
        return new NextResponse(await r.arrayBuffer(), {
          headers: { "content-type": "application/octet-stream" },
        });
      }
      console.warn(`License: pwaapi returned ${r.status}, falling back to original URL`);
    }

    // 2. Fall back to original license URL (api.sunnxt.com/nagravision)
    const cookie = await getSunnxtCookies().catch(() => "");
    const makeRequest = (withCookie: boolean) =>
      fetch(licenseUrl, {
        method: "POST",
        headers: { ...headers, ...(withCookie && cookie ? { cookie } : {}) },
        body: challenge,
        cache: "no-store",
      });

    let res = await makeRequest(false);
    if (!res.ok && cookie) res = await makeRequest(true);

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
