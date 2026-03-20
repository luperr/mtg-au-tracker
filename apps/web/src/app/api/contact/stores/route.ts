import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET() {
  const rows = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM stores WHERE scraper_enabled = true ORDER BY name
  `;
  return NextResponse.json([...rows], {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
