// Telegram Bot API client + parsing for the deal-curation feature.
//
// We talk to Telegram over plain fetch (same approach as lib/airtable.ts
// and lib/metricool.ts) rather than pulling in a bot framework — this app
// only ever needs to (a) receive webhook updates and (b) send a handful of
// confirmation messages, which is a handful of simple HTTP calls.
//
// Telegram Bot API docs: https://core.telegram.org/bots/api

import type { Deal } from "./types";

const TELEGRAM_API_BASE = "https://api.telegram.org";

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHANNEL_ID);
}

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN environment variable. See .env.example.");
  }
  return token;
}

/** The emoji reaction that means "turn this deal into a post". Defaults to
 * 🔥 but can be changed per-deployment without touching code. */
export function getTriggerEmoji(): string {
  return process.env.TELEGRAM_TRIGGER_EMOJI || "🔥";
}

/** Verifies the `X-Telegram-Bot-Api-Secret-Token` header Telegram sends on
 * every webhook request when a secret_token was set on setWebhook (see
 * scripts/setup-telegram-webhook.md). This is what stops a stranger from
 * POSTing fake "approve this deal" updates straight at the endpoint,
 * bypassing Basic Auth (which the webhook intentionally skips — Telegram
 * can't present a username/password). If no secret is configured, this
 * fails closed (rejects) rather than silently accepting unauthenticated
 * requests — same philosophy as the Basic Auth check in middleware.ts. */
export function isValidTelegramRequest(headerValue: string | null): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return false;
  return headerValue === secret;
}

async function telegramFetch(method: string, body?: Record<string, unknown>) {
  const res = await fetch(`${TELEGRAM_API_BASE}/bot${getBotToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(`Telegram API call to ${method} failed: ${JSON.stringify(data)}`);
  }
  return data.result;
}

/** Reply in the channel, threaded under the original deal message, so it's
 * obvious which deal the confirmation is about. */
export async function sendTelegramReply(chatId: string, replyToMessageId: string, text: string) {
  await telegramFetch("sendMessage", {
    chat_id: chatId,
    text,
    reply_to_message_id: Number(replyToMessageId),
    allow_sending_without_reply: true,
  });
}

/** Resolves a Telegram file_id (from a photo on a message) to a direct,
 * temporary download URL. Telegram file URLs expire after a while, which is
 * fine for our use — we only need the URL long enough to hand it to
 * Airtable, which fetches and stores its own copy of the image (Airtable
 * attachment fields work this way: give them a URL once, they host it). */
export async function resolveTelegramFileUrl(fileId: string): Promise<string> {
  const file = await telegramFetch("getFile", { file_id: fileId });
  return `${TELEGRAM_API_BASE}/file/bot${getBotToken()}/${file.file_path}`;
}

// --- Parsing the deal bot's message format ---------------------------------
//
// Messages from the existing deal-monitoring bot look like:
//
//   NEW SALE ITEM
//   Item name
//   Retailer
//   Price
//   RRP
//   Percentage below RRP
//   Sizes available
//   Link to product
//
// ...sent as a photo with that text as the caption (the photo itself is the
// "Product Photo" field, not a text line). If your bot's exact wording
// differs even slightly, adjust FIRST_LINE_MARKER and the field order below
// to match — everything downstream just reads from the parsed object.

const FIRST_LINE_MARKER = /^NEW SALE ITEM$/i;

export interface ParsedDealMessage {
  itemName: string;
  retailer: string;
  price: string;
  rrp: string;
  percentOff: string;
  sizesAvailable: string;
  productLink: string;
}

/** Returns null (rather than throwing) for any message that isn't a deal
 * post in the expected shape — the channel may well contain other message
 * types (announcements, replies, etc.) that we should just ignore. */
export function parseDealMessage(caption: string | undefined): ParsedDealMessage | null {
  if (!caption) return null;

  const lines = caption
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 8 || !FIRST_LINE_MARKER.test(lines[0])) return null;

  const [, itemName, retailer, price, rrp, percentOff, sizesAvailable, productLink] = lines;

  if (!itemName || !retailer || !price) return null;

  return { itemName, retailer, price, rrp, percentOff, sizesAvailable, productLink };
}

// --- Minimal typing for the pieces of Telegram's webhook payload we use ---
// (Not the full Bot API shape — just enough to read safely. See
// https://core.telegram.org/bots/api#update for the complete reference.)

export interface TelegramUpdate {
  channel_post?: TelegramMessage;
  message_reaction?: TelegramMessageReaction;
}

export interface TelegramMessage {
  message_id: number;
  chat: { id: number };
  caption?: string;
  text?: string;
  photo?: { file_id: string; file_size?: number }[];
}

export interface TelegramMessageReaction {
  chat: { id: number };
  message_id: number;
  new_reaction: { type: string; emoji?: string }[];
}

/** Telegram sends photo sizes smallest-first — the last entry is the
 * largest available, which is what we want for the website widget. */
export function largestPhoto(message: TelegramMessage): { file_id: string } | null {
  if (!message.photo || message.photo.length === 0) return null;
  return message.photo[message.photo.length - 1];
}

/** True if this reaction update is someone adding (not removing) the
 * configured trigger emoji. */
export function isTriggerReaction(reaction: TelegramMessageReaction): boolean {
  const trigger = getTriggerEmoji();
  return reaction.new_reaction.some((r) => r.type === "emoji" && r.emoji === trigger);
}

/** Builds a short human-readable summary of a Deal, used in Telegram
 * confirmation replies. */
export function describeDeal(deal: Pick<Deal, "itemName" | "price" | "rrp">): string {
  return `${deal.itemName} — ${deal.price} (was ${deal.rrp})`;
}
