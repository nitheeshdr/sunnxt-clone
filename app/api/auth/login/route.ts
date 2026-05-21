import { NextRequest, NextResponse } from "next/server";
import CryptoJS from "crypto-js";

const SUNNXT_LOGIN_URL = "https://www.sunnxt.com/next/api/login";
const MEDIA_KEY = "A3s68aORSgHs$71P";

function encryptPayload(obj: Record<string, string>): string {
  const keyWA = CryptoJS.enc.Utf8.parse(MEDIA_KEY);
  const iv = CryptoJS.enc.Hex.parse("00000000000000000000000000000000");
  const encrypted = CryptoJS.AES.encrypt(JSON.stringify(obj), keyWA, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return encrypted.toString();
}

function decryptResponse(response: string): unknown {
  const keyWA = CryptoJS.enc.Utf8.parse(MEDIA_KEY);
  const iv = CryptoJS.enc.Hex.parse("00000000000000000000000000000000");
  const bytes = CryptoJS.AES.decrypt(response, keyWA, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  const hex = bytes.toString(CryptoJS.enc.Hex);
  return JSON.parse(Buffer.from(hex, "hex").toString("utf8"));
}

/** Collect all Set-Cookie values and apply them to the response. */
function forwardCookies(src: Response, dest: NextResponse) {
  const multi = src.headers.getSetCookie?.();
  if (multi && multi.length > 0) {
    // Edge Runtime supports multiple Set-Cookie via append
    for (const c of multi) dest.headers.append("set-cookie", c);
    return;
  }
  const single = src.headers.get("set-cookie");
  if (single) dest.headers.set("set-cookie", single);
}

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  if (!username || !password) {
    return NextResponse.json(
      { error: "Mobile number and password required" },
      { status: 400 }
    );
  }

  // ── Attempt 1: Encrypted payload via SunNXT's own BFF (same as the browser client) ──
  try {
    const payload = encryptPayload({ userid: username, password });
    const encBody = `payload=${encodeURIComponent(payload)}&version=1`;

    const encRes = await fetch(SUNNXT_LOGIN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-myplex-platform": "browser",
        "x-ucv": "5",
        origin: "https://www.sunnxt.com",
        referer: "https://www.sunnxt.com/",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
      },
      body: encBody,
      redirect: "manual",
    });

    // Try to parse JSON body
    let encData: Record<string, unknown> = {};
    try { encData = await encRes.clone().json(); } catch { /* ignore */ }

    // Decrypt response if needed
    if (encData.response) {
      try {
        const decrypted = decryptResponse(encData.response as string) as Record<string, unknown>;
        if (decrypted && (decrypted.code === 200 || decrypted.status === "SUCCESS")) {
          const response = NextResponse.json({ success: true, data: decrypted });
          forwardCookies(encRes, response);
          // Also set sessionid cookie if present in decrypted payload
          const results = decrypted.results as Array<{ sessionid?: string }> | undefined;
          if (results?.[0]?.sessionid) {
            response.cookies.set("sessionid", results[0].sessionid, {
              path: "/",
              httpOnly: true,
              sameSite: "lax",
            });
          }
          return response;
        }
      } catch { /* fall through */ }
    }

    if (encData.code === 200 || encData.status === "SUCCESS") {
      const response = NextResponse.json({ success: true, data: encData });
      forwardCookies(encRes, response);
      return response;
    }
  } catch { /* fall through to next attempt */ }

  // ── Attempt 2: Plain credentials to pwaapi direct endpoints ──
  const plainBody = new URLSearchParams({ username, password, platform: "browser" });
  const directEndpoints = [
    "https://pwaapi.sunnxt.com/user/v3/login",
    "https://pwaapi.sunnxt.com/user/v2/login",
  ];

  for (const endpoint of directEndpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-myplex-platform": "browser",
          "x-ucv": "5",
          origin: "https://www.sunnxt.com",
          referer: "https://www.sunnxt.com/",
        },
        body: plainBody.toString(),
      });

      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) continue;

      const data = await res.json();
      if (data.code === 200 || data.status === "SUCCESS") {
        const response = NextResponse.json({ success: true, data });
        forwardCookies(res, response);
        return response;
      }
    } catch { continue; }
  }

  return NextResponse.json(
    { error: "Invalid credentials. Please check your mobile number and password." },
    { status: 401 }
  );
}
