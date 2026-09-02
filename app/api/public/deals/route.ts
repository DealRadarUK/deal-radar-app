// GET /api/public/deals
//
// Read-only, no login required (see middleware.ts) — this is what the
// "Latest Deals" widget on your actual website calls, from any visitor's
// browser, to show deals you've curated via the Telegram reaction flow.
// Only ever returns deals whose status is "posted" (i.e. you deliberately
// selected them) — never raw/unfiltered channel noise, and never anything
// from the internal Posts table.

import { NextRequest, NextResponse } from "next/server";
import { listPostedDeals } from "@/lib/airtable";
import type { PublicDeal } from "@/lib/types";

// Cross-origin by design: your website (a different domain) needs to fetch
// this from the visitor's own browser. Change "*" to your exact site
// origin (e.g. "https://dealradaruk.com") once you know it, for a slightly
// tighter setup — "*" is fine to start with since this endpoint has no
// login and returns nothing sensitive either way.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  try {
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = Math.min(Math.max(Number(limitParam) || 12, 1), 50);

    const deals = await listPostedDeals(limit);

    const publicDeals: PublicDeal[] = deals.map((d) => ({
      itemName: d.itemName,
      retailer: d.retailer,
      price: d.price,
      rrp: d.rrp,
      percentOff: d.percentOff,
      sizesAvailable: d.sizesAvailable,
      productLink: d.productLink,
      photoUrl: d.photoUrl,
    }));

    return NextResponse.json(
      { deals: publicDeals },
      { headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
    );
  } catch (err) {
    console.error("[GET /api/public/deals]", err);
    return NextResponse.json({ deals: [] }, { status: 200, headers: CORS_HEADERS });
  }
}
