import { NextResponse } from "next/server";
import { getTrendingSearch } from "@/lib/api";

export async function GET() {
  try {
    const data = await getTrendingSearch();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ results: [] }, { status: 500 });
  }
}
