import { type NextRequest, NextResponse } from "next/server";
import CryptoJS from "crypto-js";
import { getSunnxtCookies, invalidateSession } from "@/lib/sunnxt-session";

const FIELDS = "contents,user/currentdata,images,generalInfo,subtitles,relatedCast,globalServiceName,globalServiceId,relatedMedia,videos,thumbnailSeekPreview";
const MEDIA_KEY = "A3s68aORSgHs$71P";

async function fetchMedia(contentId: string, cookieHeader: string) {
  const url = `https://www.sunnxt.com/next/api/media/${contentId}?playbackCounter=1&fields=${FIELDS}`;
  return fetch(url, {
    headers: {
      "x-myplex-platform": "browser",
      "x-ucv": "5",
      origin: "https://www.sunnxt.com",
      referer: "https://www.sunnxt.com/",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
      cookie: cookieHeader,
    },
    cache: "no-store",
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  const { contentId } = await params;
  // Use the browser's cookie first; fall back to server-side session
  const browserCookie = request.headers.get("cookie") || "";

  let cookieHeader = browserCookie;
  if (!cookieHeader.includes("sessionid")) {
    try {
      cookieHeader = await getSunnxtCookies();
    } catch {
      // proceed without session — may still work for free content
    }
  }

  try {
    let res = await fetchMedia(contentId, cookieHeader);
    let data = await res.json();

    // If unauthenticated response, try with a fresh login
    if (data.code === 401 || data.code === 403) {
      invalidateSession();
      cookieHeader = await getSunnxtCookies();
      res = await fetchMedia(contentId, cookieHeader);
      data = await res.json();
    }

    if (data.response) {
      try {
        const keyWA = CryptoJS.enc.Utf8.parse(MEDIA_KEY);
        const iv = CryptoJS.enc.Hex.parse("00000000000000000000000000000000");
        const bytes = CryptoJS.AES.decrypt(data.response, keyWA, {
          iv,
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7,
        });
        const hex = bytes.toString(CryptoJS.enc.Hex);
        const decrypted = Buffer.from(hex, "hex").toString("utf8");
        const parsed = JSON.parse(decrypted);
        return NextResponse.json(parsed);
      } catch {
        return NextResponse.json(data);
      }
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch media" }, { status: 500 });
  }
}
