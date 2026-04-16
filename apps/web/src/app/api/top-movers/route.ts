import { NextResponse } from "next/server";
import { getTopMovers } from "@/lib/db";

export const revalidate = 3600;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") ?? "7", 10);
  if (days !== 7 && days !== 14 && days !== 30) {
    return NextResponse.json({ error: "days must be 7, 14, or 30" }, { status: 400 });
  }
  const movers = await getTopMovers(days);
  return NextResponse.json(movers);
}
