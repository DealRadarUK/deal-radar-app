// Metricool API integration: creating a scheduled post draft when a post is
// approved, and pulling last week's performance metrics for the report.
//
// IMPORTANT — please read before relying on this in production:
// Metricool's API requires an Advanced/Custom plan and its full reference
// lives behind a login-gated Swagger doc in your own account (Settings ->
// API access in Metricool). The scheduling endpoint below (POST
// /v2/scheduler/posts) is documented and confirmed. The analytics endpoint
// is NOT fully confirmed from public docs — Metricool's analytics surface
// varies by network and plan. getWeeklyPostMetrics() below is written to the
// most likely endpoint shape; if it 404s for your account, open your
// account's Swagger doc (link above), find the correct analytics path for
// Instagram/TikTok post insights, and update METRICOOL_ANALYTICS_PATH below
// — everything else in the app is unaffected.

import type { Platform, Post, PostMetrics } from "./types";

const METRICOOL_API_BASE = "https://app.metricool.com/api";

// Best-effort — verify against your account's Swagger doc if this 404s.
const METRICOOL_ANALYTICS_PATH = "/v2/analytics/posts";

/** True once all three Metricool env vars are set. Metricool's API needs
 * their paid Advanced/Custom plan, so this app is designed to work fully
 * without it — callers should check this first and skip cleanly (see
 * app/api/posts/[id]/route.ts) rather than let a config error look like a
 * real failure. */
export function isMetricoolConfigured(): boolean {
  return Boolean(
    process.env.METRICOOL_API_TOKEN && process.env.METRICOOL_USER_ID && process.env.METRICOOL_BLOG_ID
  );
}

function getConfig() {
  const token = process.env.METRICOOL_API_TOKEN;
  const userId = process.env.METRICOOL_USER_ID;
  const blogId = process.env.METRICOOL_BLOG_ID;

  if (!token || !userId || !blogId) {
    throw new Error(
      "Missing METRICOOL_API_TOKEN, METRICOOL_USER_ID or METRICOOL_BLOG_ID environment variable. See .env.example."
    );
  }

  return { token, userId, blogId };
}

/** Maps our Platform values to Metricool's "network" identifiers.
 * Add X/Threads here once you've confirmed the exact identifiers Metricool
 * expects for your account (check a manually-scheduled post's network value
 * in your browser's network tab, per Metricool's own API guide). */
const NETWORK_MAP: Partial<Record<Platform, string>> = {
  Instagram: "instagram",
  TikTok: "tiktok",
};

function authedUrl(path: string, extraParams?: Record<string, string>): string {
  const { userId, blogId } = getConfig();
  const params = new URLSearchParams({ userId, blogId, ...extraParams });
  return `${METRICOOL_API_BASE}${path}?${params.toString()}`;
}

function authHeaders(): HeadersInit {
  const { token } = getConfig();
  return {
    "X-Mc-Auth": token,
    "Content-Type": "application/json",
  };
}

export class MetricoolError extends Error {}

/**
 * Create a scheduled post draft in Metricool for an approved Airtable post.
 * Video files are NOT uploaded here — per spec, the founder attaches video
 * directly in Metricool. This just creates the caption/hashtags/time shell
 * (autoPublish: false, so it lands as a draft/scheduled item to review).
 *
 * Throws MetricoolError on failure — callers should catch this and write
 * the message into the post's Notes field rather than letting it bubble up
 * as a 500, per the "approved but not scheduled" error-handling spec.
 */
export async function createScheduledPost(post: Post): Promise<{ metricoolPostId?: string }> {
  const network = NETWORK_MAP[post.platform];
  if (!network) {
    throw new MetricoolError(
      `No Metricool network mapping configured for platform "${post.platform}" yet. ` +
        `Add it to NETWORK_MAP in lib/metricool.ts once that integration is set up.`
    );
  }

  const text = `${post.caption}\n\n${post.hashtags}`.trim();

  const payload = {
    providers: [{ network }],
    text,
    publicationDate: {
      dateTime: post.publishDateTime,
      timezone: "Europe/London",
    },
    autoPublish: false, // create as a draft the founder reviews/attaches video to in Metricool
  };

  const res = await fetch(authedUrl("/v2/scheduler/posts"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new MetricoolError(`Metricool scheduling request failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const data = await res.json().catch(() => ({}));
  return { metricoolPostId: data?.id ?? data?.data?.id };
}

/**
 * Pull performance metrics for posts published in [fromISO, toISO), matched
 * back to our Airtable posts by publish time + platform (Metricool's post
 * IDs aren't the same as Airtable's, so we don't have a stored mapping).
 *
 * See the file-level comment above re: METRICOOL_ANALYTICS_PATH — verify
 * this against your account before trusting the numbers.
 */
export async function getWeeklyPostMetrics(
  fromISO: string,
  toISO: string,
  postsInRange: Post[]
): Promise<PostMetrics[]> {
  const res = await fetch(
    authedUrl(METRICOOL_ANALYTICS_PATH, { from: fromISO, to: toISO }),
    { headers: authHeaders(), cache: "no-store" }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new MetricoolError(`Metricool analytics request failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const data = await res.json();
  const rows: unknown[] = Array.isArray(data) ? data : data?.data ?? [];

  // Match each Metricool row back to an Airtable post by nearest publish
  // time (within 30 min) on the same platform. Metricool rows that don't
  // match any known post, or Airtable posts with no matching row (e.g. not
  // yet reported by Metricool), are simply skipped.
  const metrics: PostMetrics[] = [];
  for (const row of rows as Record<string, unknown>[]) {
    const publishedAt = String(row.publishDate ?? row.date ?? "");
    const network = String(row.network ?? row.provider ?? "").toLowerCase();
    const match = postsInRange.find((p) => {
      const sameNetwork = NETWORK_MAP[p.platform] === network;
      const closeInTime =
        Math.abs(new Date(p.publishDateTime).getTime() - new Date(publishedAt).getTime()) < 30 * 60 * 1000;
      return sameNetwork && closeInTime;
    });
    if (!match) continue;

    const stats = (row.stats as Record<string, number>) ?? (row as Record<string, number>);
    const likes = Number(stats.likes ?? 0);
    const comments = Number(stats.comments ?? 0);
    const shares = Number(stats.shares ?? 0);
    const saves = Number(stats.saves ?? 0);
    const views = Number(stats.views ?? stats.impressions ?? 0);

    metrics.push({
      postId: match.id,
      platform: match.platform,
      caption: match.caption,
      publishDateTime: match.publishDateTime,
      views,
      likes,
      comments,
      shares,
      saves,
      profileVisits: Number(stats.profileVisits ?? 0),
      linkClicks: Number(stats.linkClicks ?? stats.clicks ?? 0),
      engagementRate: views > 0 ? (likes + comments + shares + saves) / views : 0,
    });
  }

  return metrics;
}
