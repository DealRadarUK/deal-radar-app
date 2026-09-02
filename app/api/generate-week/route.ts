// POST /api/generate-week
//
// Calls OpenAI for a fresh 7-day content plan (starting today) and saves
// every generated post to Airtable with status "draft". Also passes recent
// hooks/topics already in Airtable as "avoid repeating" context, so back-
// to-back weeks don't feel copy-pasted.

import { NextResponse } from "next/server";
import { generateWeekPlan } from "@/lib/openai";
import { createPosts, listPostsInRange } from "@/lib/airtable";
import { next7DaysRange, toDateOnlyISO, today } from "@/lib/dateUtils";
import { addDays, subDays } from "date-fns";

export async function POST() {
  try {
    const { fromISO, toISO } = next7DaysRange();

    // Pull the last 14 days of posts just to seed "don't repeat these hooks"
    // context for OpenAI — best-effort, so failure here shouldn't block
    // generation.
    let recentTopics: string[] = [];
    try {
      const recent = await listPostsInRange(subDays(today(), 14).toISOString(), today().toISOString());
      recentTopics = recent.map((p) => p.hook).filter(Boolean).slice(0, 20);
    } catch {
      // ignore — non-critical
    }

    const generated = await generateWeekPlan({
      weekStartISO: toDateOnlyISO(today()),
      weekEndISO: toDateOnlyISO(addDays(today(), 7)),
      recentTopics,
    });

    const created = await createPosts(generated);

    return NextResponse.json({ created, range: { fromISO, toISO } });
  } catch (err) {
    console.error("[POST /api/generate-week]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error generating week." },
      { status: 500 }
    );
  }
}
