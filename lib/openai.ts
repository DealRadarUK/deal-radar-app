// OpenAI calls: generating the weekly content plan, and turning a week's
// Metricool metrics into a plain-English report.

import OpenAI from "openai";
import {
  BRAND_VOICE_SYSTEM_PROMPT,
  buildGenerateWeekPrompt,
  buildPostFromDealPrompt,
  buildWeeklyReportPrompt,
} from "./prompts";
import type { Deal, GeneratedPost, Platform, PostMetrics } from "./types";

// Defaults to GPT-5.6 Terra — OpenAI's current balanced-tier model (good
// quality for brand-voice copywriting, still a fraction of a cent per
// weekly generate-week/generate-report call). Override with the
// OPENAI_MODEL env var — e.g. "gpt-5.6-luna" for the cheapest/fastest tier,
// or "gpt-5.6-sol" for their most capable tier — without touching code.
// OpenAI's model lineup moves fast; if this model ID ever 404s, check
// https://platform.openai.com/docs/models for the current name and either
// set OPENAI_MODEL or update the fallback below.
const MODEL = process.env.OPENAI_MODEL || "gpt-5.6-terra";

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY environment variable. See .env.example.");
  }
  return new OpenAI({ apiKey });
}

const VALID_PLATFORMS: Platform[] = ["Instagram", "TikTok", "X", "Threads"];

interface ValidationResult {
  post: GeneratedPost | null;
  reason?: string; // set when post is null — why this one was skipped
}

// Returns { post: null, reason } (instead of throwing) for a malformed post,
// so one bad post in the batch doesn't take down the whole week's
// generation — OpenAI's "json_object" mode encourages valid JSON but
// doesn't guarantee every field is present on every element, so occasional
// misses are expected and should be skipped, not fatal. The reason is kept
// (not just logged) so that if EVERY post in a batch fails, the error the
// founder actually sees says why, instead of a bare "no usable posts".
function validateGeneratedPost(raw: unknown): ValidationResult {
  const p = raw as Record<string, unknown>;
  const required = ["platform", "format", "topic", "hook", "script", "caption", "hashtags", "publishDateTime"];
  for (const key of required) {
    if (typeof p[key] !== "string" || (p[key] as string).trim() === "") {
      return { post: null, reason: `missing/invalid "${key}"` };
    }
  }
  if (!VALID_PLATFORMS.includes(p.platform as Platform)) {
    return { post: null, reason: `unexpected platform "${p.platform}"` };
  }
  // publishDateTime must parse to a real date.
  if (Number.isNaN(Date.parse(p.publishDateTime as string))) {
    return { post: null, reason: `unparseable publishDateTime "${p.publishDateTime}"` };
  }
  return { post: p as unknown as GeneratedPost };
}

/** Runs validateGeneratedPost over a raw "posts" array, logs every skip
 * (visible in Vercel's function logs), and throws a descriptive error
 * (rather than a generic one) if nothing usable came out of the batch. */
function validateAndFilter(rawPosts: unknown[], context: string): GeneratedPost[] {
  const valid: GeneratedPost[] = [];
  const reasons: string[] = [];

  for (const raw of rawPosts) {
    const { post, reason } = validateGeneratedPost(raw);
    if (post) {
      valid.push(post);
    } else if (reason) {
      console.warn(`[${context}] Skipping a generated post — ${reason}:`, raw);
      reasons.push(reason);
    }
  }

  if (valid.length === 0) {
    const uniqueReasons = Array.from(new Set(reasons)).slice(0, 3).join("; ");
    throw new Error(
      `OpenAI returned ${rawPosts.length} post(s) but none were usable (${uniqueReasons || "unknown reason"}). ` +
        `Try again — this is usually a one-off. If it keeps happening, it may mean the model changed its ` +
        `response shape and lib/prompts.ts needs a tweak.`
    );
  }

  return valid;
}

/**
 * Ask OpenAI for a 7-day content plan starting on weekStartISO (a date-only
 * string like "2026-09-08"). Returns validated posts, ready to save to
 * Airtable — this does NOT write to Airtable itself.
 */
export async function generateWeekPlan(opts: {
  weekStartISO: string;
  weekEndISO: string;
  recentTopics?: string[];
}): Promise<GeneratedPost[]> {
  const client = getClient();

  const completion = await client.chat.completions.create({
    model: MODEL,
    // Note: some current models (e.g. the gpt-5.6 family) only support the
    // default temperature (1) and reject any other value with a 400 error,
    // so we deliberately don't set one here — leave this out rather than
    // re-adding a fixed temperature unless you've confirmed your chosen
    // model supports it.
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: BRAND_VOICE_SYSTEM_PROMPT },
      { role: "user", content: buildGenerateWeekPrompt(opts) },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned an empty response for generateWeekPlan.");

  let parsed: { posts?: unknown[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI response was not valid JSON: ${raw.slice(0, 500)}`);
  }

  if (!Array.isArray(parsed.posts) || parsed.posts.length === 0) {
    throw new Error(`OpenAI response had no "posts" array: ${raw.slice(0, 500)}`);
  }

  return validateAndFilter(parsed.posts, "generateWeekPlan");
}

/**
 * Writes an Instagram + TikTok post pair for one specific real deal — used
 * by the Telegram curation flow (see app/api/telegram/webhook/route.ts).
 * Unlike generateWeekPlan, the item/price/retailer facts are supplied by the
 * caller and passed through verbatim in the prompt; OpenAI only writes the
 * creative copy around them, so there's no risk of it inventing a different
 * price for a deal that's already been verified.
 */
export async function generatePostsFromDeal(deal: Deal): Promise<GeneratedPost[]> {
  const client = getClient();

  const completion = await client.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: BRAND_VOICE_SYSTEM_PROMPT },
      {
        role: "user",
        content: buildPostFromDealPrompt({
          itemName: deal.itemName,
          retailer: deal.retailer,
          price: deal.price,
          rrp: deal.rrp,
          percentOff: deal.percentOff,
          sizesAvailable: deal.sizesAvailable,
          productLink: deal.productLink,
          nowISO: new Date().toISOString(),
        }),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned an empty response for generatePostsFromDeal.");

  let parsed: { posts?: unknown[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI response was not valid JSON: ${raw.slice(0, 500)}`);
  }

  if (!Array.isArray(parsed.posts) || parsed.posts.length === 0) {
    throw new Error(`OpenAI response had no "posts" array: ${raw.slice(0, 500)}`);
  }

  return validateAndFilter(parsed.posts, "generatePostsFromDeal");
}

export interface ReportResult {
  summary: string;
  topPosts: { postId: string; reason: string }[];
  bestHooksFormatsTimes: string[];
  recommendations: string[];
}

/**
 * Turn a week's worth of Metricool metrics into a founder-readable report.
 * Does not call Metricool itself — pass already-fetched metrics in.
 */
export async function generateWeeklyReport(opts: {
  rangeStartISO: string;
  rangeEndISO: string;
  metrics: PostMetrics[];
}): Promise<ReportResult> {
  const client = getClient();

  const completion = await client.chat.completions.create({
    model: MODEL,
    // See the note in generateWeekPlan above — no fixed temperature.
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: BRAND_VOICE_SYSTEM_PROMPT },
      {
        role: "user",
        content: buildWeeklyReportPrompt({
          rangeStartISO: opts.rangeStartISO,
          rangeEndISO: opts.rangeEndISO,
          metricsJson: JSON.stringify(opts.metrics, null, 2),
        }),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned an empty response for generateWeeklyReport.");

  try {
    const parsed = JSON.parse(raw);
    return {
      summary: parsed.summary ?? "",
      topPosts: Array.isArray(parsed.topPosts) ? parsed.topPosts : [],
      bestHooksFormatsTimes: Array.isArray(parsed.bestHooksFormatsTimes) ? parsed.bestHooksFormatsTimes : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    };
  } catch {
    throw new Error(`OpenAI report response was not valid JSON: ${raw.slice(0, 500)}`);
  }
}
