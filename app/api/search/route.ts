import { type NextRequest, NextResponse } from "next/server";
import { searchContent } from "@/lib/api";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") || "";
  const type = request.nextUrl.searchParams.get("type") || "";
  if (!q.trim()) return NextResponse.json({ results: [] });
  try {
    const data = await searchContent(q, type || undefined);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ results: [] }, { status: 500 });
  }
}
