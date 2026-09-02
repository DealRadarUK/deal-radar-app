// GET /api/posts?days=14&platform=Instagram&status=draft
//
// Lists posts, defaulting to the next 14 days (per the dashboard spec).
// Optional platform/status filters are applied server-side so the client
// never has to fetch-then-filter everything.

import { NextRequest, NextResponse } from "next/server";
import { listPostsInRange } from "@/lib/airtable";
import { addDays } from "date-fns";
import { today } from "@/lib/dateUtils";
import type { Platform, PostStatus } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = Number(searchParams.get("days") ?? "14");
    const platform = searchParams.get("platform") as Platform | null;
    const status = searchParams.get("status") as PostStatus | null;

    const from = today();
    const to = addDays(from, Number.isFinite(days) ? days : 14);

    let posts = await listPostsInRange(from.toISOString(), to.toISOString());

    if (platform) posts = posts.filter((p) => p.platform === platform);
    if (status) posts = posts.filter((p) => p.status === status);

    return NextResponse.json({ posts });
  } catch (err) {
    console.error("[GET /api/posts]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error listing posts." },
      { status: 500 }
    );
  }
}
