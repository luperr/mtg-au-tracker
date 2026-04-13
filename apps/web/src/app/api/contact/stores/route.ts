import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { CACHE_REVALIDATE_HOUR, CACHE_STALE_WHILE_REVALIDATE_DAY } from "@/lib/config";

export async function GET() {
  const rows = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM stores WHERE scraper_enabled = true ORDER BY name
  `;
  return NextResponse.json([...rows], {
    headers: { "Cache-Control": `public, s-maxage=${CACHE_REVALIDATE_HOUR}, stale-while-revalidate=${CACHE_STALE_WHILE_REVALIDATE_DAY}` },
  });
}
