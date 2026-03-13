import { searchCards, PAGE_SIZE } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const offset = parseInt(req.nextUrl.searchParams.get("offset") ?? "0", 10);

  if (!q) return NextResponse.json({ results: [], hasMore: false });

  try {
    const results = await searchCards(q, offset);
    return NextResponse.json({ results, hasMore: results.length === PAGE_SIZE });
  } catch (err) {
    console.error("Search error:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
