import { NextResponse } from "next/server";
import { DEFAULT_HEADERS } from "@/lib/api";

export async function POST() {
  try {
    await fetch("https://pwaapi.sunnxt.com/user/v2/logout", {
      method: "POST",
      headers: DEFAULT_HEADERS as HeadersInit,
    });
  } catch {
    // ignore
  }
  const res = NextResponse.json({ success: true });
  res.cookies.delete("sunnxt_session");
  return res;
}
