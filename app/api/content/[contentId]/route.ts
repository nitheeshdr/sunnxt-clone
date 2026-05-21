import { type NextRequest, NextResponse } from "next/server";
import { getContentDetail } from "@/lib/api";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  const { contentId } = await params;
  const cookieHeader = request.headers.get("cookie") || "";
  try {
    const data = await getContentDetail(contentId, cookieHeader);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ results: [] }, { status: 500 });
  }
}
