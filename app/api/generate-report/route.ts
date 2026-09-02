// POST /api/generate-report
//
// Two ways to get metrics into this route:
//  1. Automatic (Metricool connected): pulls last week's posts from Airtable
//     + their performance from Metricool.
//  2. Manual (Metricool not connected, e.g. still on the free plan): the
//     request body carries { manualMetrics: [...] } that the founder typed
//     in on /report from Instagram/TikTok's own free native analytics.
//     Either way, the same OpenAI analysis runs on the same PostMetrics
//     shape — the AI doesn't know or care where the numbers came from.
//
// Doesn't persist the report anywhere — each click regenerates it fresh,
// which is simple and avoids needing another Airtable table just for
// reports.

import { NextRequest, NextResponse } from "next/server";
import { listPostsInRange } from "@/lib/airtable";
import { getWeeklyPostMetrics, isMetricoolConfigured } from "@/lib/metricool";
import { generateWeeklyReport } from "@/lib/openai";
import { past7DaysRange } from "@/lib/dateUtils";
import type { PostMetrics, WeeklyReport } from "@/lib/types";

type ManualMetricInput = Omit<PostMetrics, "engagementRate">;

function withEngagementRate(m: ManualMetricInput): PostMetrics {
  return {
    ...m,
    engagementRate: m.views > 0 ? (m.likes + m.comments + m.shares + m.saves) / m.views : 0,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { fromISO, toISO } = past7DaysRange();

    const body = await req.json().catch(() => ({}));
    const manualMetrics = body?.manualMetrics as ManualMetricInput[] | undefined;

    let metrics: PostMetrics[];

    if (manualMetrics && manualMetrics.length > 0) {
      metrics = manualMetrics.map(withEngagementRate);
    } else {
      if (!isMetricoolConfigured()) {
        return NextResponse.json(
          {
            error:
              "Metricool isn't connected, so there's nothing to pull automatically. " +
              "Enter last week's numbers manually below instead.",
            requiresManualEntry: true,
          },
          { status: 400 }
        );
      }

      const postsLastWeek = await listPostsInRange(fromISO, toISO);

      if (postsLastWeek.length === 0) {
        return NextResponse.json(
          { error: "No posts found in the last 7 days to report on yet." },
          { status: 400 }
        );
      }

      metrics = await getWeeklyPostMetrics(fromISO, toISO, postsLastWeek);

      if (metrics.length === 0) {
        return NextResponse.json(
          {
            error:
              "Metricool returned no matching performance data for last week's posts yet. " +
              "This is normal if posts were only just published — try again in a day or two.",
          },
          { status: 400 }
        );
      }
    }

    const aiResult = await generateWeeklyReport({ rangeStartISO: fromISO, rangeEndISO: toISO, metrics });

    const report: WeeklyReport = {
      generatedAt: new Date().toISOString(),
      rangeStart: fromISO,
      rangeEnd: toISO,
      metrics,
      summary: aiResult.summary,
      topPosts: aiResult.topPosts,
      bestHooksFormatsTimes: aiResult.bestHooksFormatsTimes,
      recommendations: aiResult.recommendations,
    };

    return NextResponse.json({ report });
  } catch (err) {
    console.error("[POST /api/generate-report]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error generating report." },
      { status: 500 }
    );
  }
}
