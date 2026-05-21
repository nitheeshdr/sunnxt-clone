import { NextResponse } from "next/server";
import { forceRelogin } from "@/lib/sunnxt-session";

export async function GET() {
  try {
    await forceRelogin();
    return NextResponse.json({ success: true, message: "Session cleared and re-logged in" });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
