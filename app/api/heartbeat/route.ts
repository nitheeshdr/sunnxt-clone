import { type NextRequest, NextResponse } from "next/server";
import { getSunnxtCookies } from "@/lib/sunnxt-session";

export async function POST(request: NextRequest) {
  const browserCookie = request.headers.get("cookie") || "";
  const { contentId, action = "Start" } = await request.json();

  let cookieHeader = browserCookie;
  if (!cookieHeader.includes("sessionid")) {
    try { cookieHeader = await getSunnxtCookies(); } catch { /* ignore */ }
  }

  if (!contentId) {
    return NextResponse.json({ error: "contentId required" }, { status: 400 });
  }

  try {
    const res = await fetch("https://pwaapi.sunnxt.com/user/v2/events/heartbeat/status/", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-myplex-platform": "browser",
        "x-ucv": "5",
        "contentlanguage": "tamil,telugu,malayalam,kannada,hindi,bengali,marathi,english",
        "accept-language": "en",
        origin: "https://www.sunnxt.com",
        referer: "https://www.sunnxt.com/",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        cookie: cookieHeader,
      },
      body: `action=${action}&contentId=${contentId}`,
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Heartbeat failed" }, { status: 500 });
  }
}
