// Shared TypeScript types used across the app (API routes, components, libs).

/** Platforms we can generate/schedule content for. Add "X" / "Threads" here
 * (and to the Airtable single-select field + PLATFORM_META below) whenever
 * Metricool support for them is wired up — nothing else needs to change. */
export type Platform = "Instagram" | "TikTok" | "X" | "Threads";

export type Format = "Reel" | "Feed" | "TikTok" | "Static" | "Thread";

export type Topic =
  | "Deal highlight"
  | "Round-up"
  | "Style tip"
  | "Community/UGC"
  | "Behind-the-scenes";

export type PostStatus = "draft" | "approved" | "scheduled" | "published";

/** A single post as stored in (and returned from) Airtable. */
export interface Post {
  id: string; // Airtable record ID
  platform: Platform;
  format: Format;
  topic: Topic | string;
  hook: string;
  script: string;
  caption: string;
  hashtags: string; // space-separated, e.g. "#dealradaruk #mensfashion ..."
  status: PostStatus;
  publishDateTime: string; // ISO 8601
  videoLink?: string;
  notes?: string;
}

/** Fields that the dashboard is allowed to PATCH inline. */
export type EditablePostFields = Partial<
  Pick<Post, "hook" | "caption" | "hashtags" | "publishDateTime" | "notes" | "status" | "videoLink">
>;

/** Shape OpenAI is asked to return for one generated post (before we add
 * an Airtable ID / status, which happen once it's saved). */
export interface GeneratedPost {
  platform: Platform;
  format: Format;
  topic: Topic;
  hook: string;
  script: string;
  caption: string;
  hashtags: string;
  publishDateTime: string; // ISO 8601, must fall within the requested week
}

export interface GenerateWeekResponse {
  created: Post[];
}

/** Per-post performance metrics pulled from Metricool for the report. */
export interface PostMetrics {
  postId: string; // Airtable record ID this maps back to
  platform: Platform;
  caption: string;
  publishDateTime: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  profileVisits: number;
  linkClicks: number;
  engagementRate: number; // (likes+comments+shares+saves) / views, 0-1
}

export interface WeeklyReport {
  generatedAt: string; // ISO 8601
  rangeStart: string;
  rangeEnd: string;
  metrics: PostMetrics[];
  summary: string; // OpenAI's prose summary
  topPosts: { postId: string; reason: string }[];
  bestHooksFormatsTimes: string[];
  recommendations: string[];
}

// --- Telegram deal curation --------------------------------------------
// A "Deal" is a real, verified item from your Telegram deals channel —
// distinct from a "Post" (the on-brand social copy written about a deal).
// One deal can, in principle, produce more than one post later.

export type DealStatus = "new" | "posted" | "ignored";

/** A real deal as parsed from a Telegram channel post and stored in the
 * "Deals" Airtable table. Facts here are never invented — they come
 * straight from your deal-finding bot's message. */
export interface Deal {
  id: string; // Airtable record ID
  itemName: string;
  retailer: string;
  price: string; // kept as the original string (e.g. "£69.99") — not parsed
  // to a number, since the source format isn't guaranteed to be clean.
  rrp: string;
  percentOff: string;
  sizesAvailable: string;
  productLink: string;
  photoUrl?: string;
  status: DealStatus;
  telegramChatId: string;
  telegramMessageId: string;
  createdAt: string; // ISO 8601, when we first saw the deal
}

/** The subset of a Deal's fields shown on the public website widget —
 * intentionally excludes internal bookkeeping like Telegram IDs. */
export interface PublicDeal {
  itemName: string;
  retailer: string;
  price: string;
  rrp: string;
  percentOff: string;
  sizesAvailable: string;
  productLink: string;
  photoUrl?: string;
}
