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

/** Many deal messages arrive as plain text with a product link and no
 * attached photo — the "photo" you see in Telegram is just its own link
 * preview of that URL, which this bot never receives as a real photo. As a
 * fallback, we fetch the product page ourselves and read its Open Graph
 * image tag, so deals still get a real product photo. Best-effort: returns
 * undefined on any failure (blocked fetch, no og:image tag, timeout, etc.)
 * rather than throwing — a missing photo should never stop a deal from
 * being saved. */
export async function fetchOgImageUrl(pageUrl: string): Promise<string | undefined> {
  try {
    const res = await fetch(pageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DealRadarUKBot/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return undefined;
    const html = await res.text();
    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return match?.[1];
  } catch {
    return undefined;
  }
}

// --- Parsing the deal bot's message format ---------------------------------
//
// Real messages from your deal-monitoring bot look like this (a "PRICE
// DROP" example, confirmed against a live message):
//
//   PRICE DROP
//   Plain Collared Overcoat
//   BoohooMAN
//   Secret Sales
//   £40.00 → £30.00
//   25.0% price drop
//   Previous lowest: £30.00
//   Sizes: L, M, S, XL, XS
//   https://www.secretsales.com/...
//
// ...as plain text (no attached photo — Telegram renders its own preview of
// the link, which isn't a real photo this bot can read). The parser below
// deliberately doesn't rely on fixed line positions beyond the item name
// and retailer (line 2 and 3, right after the header) — everything else
// (price/RRP, % off, sizes, link) is found by pattern anywhere in the
// message. That way it copes with extra lines you haven't described to me
// (like "Secret Sales" or "Previous lowest" above) without breaking, and
// should keep working even if the header wording varies (e.g. "NEW SALE
// ITEM" for a brand-new item vs "PRICE DROP" for a price cut) — any short,
// ALL-CAPS first line is accepted as a header and skipped.

const KNOWN_HEADERS = /^(NEW SALE ITEM|PRICE DROP|NEW DEAL|SALE ITEM|BACK IN STOCK|DEAL ALERT)$/i;
/** Fallback for header wordings we haven't seen yet: a short, mostly-caps
 * first line (allowing letters, numbers, spaces, and punctuation) is
 * assumed to be a header and skipped, same as a known one. */
const LOOKS_LIKE_HEADER = /^[A-Z0-9][A-Z0-9 !%\-]{2,29}$/;

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
export function parseDealMessage(text: string | undefined): ParsedDealMessage | null {
  if (!text) return null;

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 4) return null;

  const hasHeader = KNOWN_HEADERS.test(lines[0]) || LOOKS_LIKE_HEADER.test(lines[0]);
  const body = hasHeader ? lines.slice(1) : lines;
  if (body.length < 3) return null;

  const itemName = body[0];
  const retailer = body[1];

  // Price/RRP: prefer an explicit "£X → £Y" (was/now) line — anything else
  // containing a lone £ amount (e.g. "Previous lowest: £30.00") is ignored
  // rather than mistaken for the deal price.
  let price = "";
  let rrp = "";
  const arrowMatch = text.match(/£\s?([\d.,]+)\s*(?:→|->|to)\s*£\s?([\d.,]+)/i);
  if (arrowMatch) {
    rrp = `£${arrowMatch[1]}`;
    price = `£${arrowMatch[2]}`;
  } else {
    const singleMatch = text.match(/£\s?[\d.,]+/);
    if (singleMatch) price = singleMatch[0];
  }

  const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  const percentOff = percentMatch ? `${percentMatch[1]}%` : "";

  const sizesMatch = text.match(/sizes?:\s*(.+)/i);
  const sizesAvailable = sizesMatch ? sizesMatch[1].trim() : "";

  const urlMatch = text.match(/https?:\/\/\S+/i);
  const productLink = urlMatch ? urlMatch[0] : "";

  if (!itemName || !retailer || !price || !productLink) return null;

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
