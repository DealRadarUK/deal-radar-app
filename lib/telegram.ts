// Telegram Bot API client + parsing for the deal-curation feature.
//
// We talk to Telegram over plain fetch (same approach as lib/airtable.ts
// and lib/metricool.ts) rather than pulling in a bot framework — this app
// only ever needs to (a) receive webhook updates and (b) send a handful of
// confirmation messages, which is a handful of simple HTTP calls.
//
// How this actually gets used: your real deals arrive as a PRIVATE chat
// with your existing deal-finding bot, not a channel — so this app's own
// bot can't sit in as an admin and watch passively (Telegram doesn't let
// one bot see another bot's private chat with you). Instead, you forward
// a deal worth posting to THIS bot directly. Forwarding it is the trigger —
// there's no separate reaction step. See app/api/telegram/webhook/route.ts.
//
// Telegram Bot API docs: https://core.telegram.org/bots/api

import type { Deal } from "./types";

const TELEGRAM_API_BASE = "https://api.telegram.org";

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN environment variable. See .env.example.");
  }
  return token;
}

/** Verifies the `X-Telegram-Bot-Api-Secret-Token` header Telegram sends on
 * every webhook request when a secret_token was set on setWebhook (see
 * README section 9). This is what stops a stranger from POSTing fake
 * updates straight at the endpoint, bypassing Basic Auth (which the webhook
 * intentionally skips — Telegram can't present a username/password). If no
 * secret is configured, this fails closed (rejects) rather than silently
 * accepting unauthenticated requests — same philosophy as the Basic Auth
 * check in middleware.ts. */
export function isValidTelegramRequest(headerValue: string | null): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return false;
  return headerValue === secret;
}

/** Only messages from YOU should ever trigger post generation — otherwise
 * anyone who finds the bot's username could DM it and burn through your
 * OpenAI credits. Get your own numeric Telegram user ID by messaging
 * @userinfobot once (see README section 9), then set
 * TELEGRAM_ALLOWED_USER_ID to it. If unset, every message is rejected
 * (fails closed) rather than silently accepting anyone. */
export function isAllowedSender(userId: number | undefined): boolean {
  const allowed = process.env.TELEGRAM_ALLOWED_USER_ID;
  if (!allowed || !userId) return false;
  return String(userId) === allowed;
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

/** Reply in the same private chat, threaded under the forwarded message, so
 * it's obvious which deal the confirmation is about. */
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
 * attachment/URL fields work this way: give them a URL once). */
export async function resolveTelegramFileUrl(fileId: string): Promise<string> {
  const file = await telegramFetch("getFile", { file_id: fileId });
  return `${TELEGRAM_API_BASE}/file/bot${getBotToken()}/${file.file_path}`;
}

// --- Parsing the deal bot's message format ---------------------------------
//
// Messages from your existing deal-monitoring bot look like:
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
// "Product Photo" field, not a text line). Forwarding one to this app's bot
// carries the same caption + photo across unchanged, so the exact same
// parser works whether the text was typed or forwarded. If your bot's exact
// wording differs even slightly, adjust FIRST_LINE_MARKER and the field
// order below to match — everything downstream just reads from the parsed
// object.

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
 * post in the expected shape — you might forward or send the bot other
 * things, intentionally or by mistake. */
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
  message?: TelegramMessage;
}

export interface TelegramMessage {
  message_id: number;
  chat: { id: number };
  from?: { id: number };
  caption?: string;
  text?: string;
  photo?: { file_id: string; file_size?: number }[];
}

/** Telegram sends photo sizes smallest-first — the last entry is the
 * largest available, which is what we want. */
export function largestPhoto(message: TelegramMessage): { file_id: string } | null {
  if (!message.photo || message.photo.length === 0) return null;
  return message.photo[message.photo.length - 1];
}

/** Builds a short human-readable summary of a Deal, used in Telegram
 * confirmation replies. */
export function describeDeal(deal: Pick<Deal, "itemName" | "price" | "rrp">): string {
  return `${deal.itemName} — ${deal.price} (was ${deal.rrp})`;
}
