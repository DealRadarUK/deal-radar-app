// GET /api/posts/last-week
//
// Posts published in the past 7 days — used by the /report page's manual
// metrics entry form (when Metricool isn't connected) to know which posts
// to show input fields for.

import { NextResponse } from "next/server";
import { listPostsInRange } from "@/lib/airtable";
import { past7DaysRange } from "@/lib/dateUtils";

export async function GET() {
  try {
    const { fromISO, toISO } = past7DaysRange();
    const posts = await listPostsInRange(fromISO, toISO);
    return NextResponse.json({ posts });
  } catch (err) {
    console.error("[GET /api/posts/last-week]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error listing last week's posts." },
      { status: 500 }
    );
  }
}
