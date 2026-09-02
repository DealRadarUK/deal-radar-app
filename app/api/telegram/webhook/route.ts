// POST /api/telegram/webhook
//
// Telegram calls this directly whenever you message (or forward something
// to) this app's Telegram bot. It deliberately bypasses Basic Auth (see
// middleware.ts) since Telegram can't present a username/password; instead
// it's secured by a secret token Telegram sends with every request (set up
// in README, checked below).
//
// Your real deals arrive as a PRIVATE chat with your existing deal-finding
// bot — not a channel — so there's no way for this app's bot to sit in and
// watch passively (Telegram doesn't let one bot see another bot's private
// chat with you). Instead: you forward a deal worth posting to THIS bot.
// That forward itself is the trigger — no separate reaction step. On
// receiving one, this route: parses the deal's real facts, writes an
// Instagram + TikTok post pair about it (OpenAI, using those real facts —
// never invented), saves them to "Posts" as drafts, logs the deal as
// "posted" (so it shows on the public website widget), and replies
// confirming what happened.

import { NextRequest, NextResponse } from "next/server";
import { createDeal, createPosts, findDealByTelegramMessage, updateDealStatus } from "@/lib/airtable";
import { generatePostsFromDeal } from "@/lib/openai";
import {
  describeDeal,
  isAllowedSender,
  isValidTelegramRequest,
  largestPhoto,
  parseDealMessage,
  resolveTelegramFileUrl,
  sendTelegramReply,
  type TelegramUpdate,
} from "@/lib/telegram";

export async function POST(req: NextRequest) {
  // Telegram retries on anything other than a fast 2xx, so every path below
  // returns 200 even when we're deliberately ignoring an update — a 4xx/5xx
  // here would just cause Telegram to keep re-sending the same update.
  if (!isValidTelegramRequest(req.headers.get("X-Telegram-Bot-Api-Secret-Token"))) {
    // The one exception: an unrecognised/missing secret is rejected outright
    // so a stranger who finds this URL can't feed it fake updates.
    return NextResponse.json({ ok: false, error: "Invalid secret token." }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // not JSON we can use — ignore.
  }

  try {
    if (update.message) {
      await handleMessage(update.message);
    }
  } catch (err) {
    // Log server-side (visible in Vercel's function logs) but still
    // acknowledge the webhook — surfacing this as a failed HTTP call would
    // just make Telegram retry the same update indefinitely.
    console.error("[POST /api/telegram/webhook]", err);
  }

  return NextResponse.json({ ok: true });
}

async function handleMessage(message: NonNullable<TelegramUpdate["message"]>) {
  // Only you should ever be able to trigger this — anyone else who finds
  // the bot and messages it is silently ignored (no reply at all), so a
  // stranger poking at the bot doesn't burn OpenAI credits or get any
  // confirmation that it does something.
  if (!isAllowedSender(message.from?.id)) return;

  const chatId = String(message.chat.id);
  const messageId = String(message.message_id);

  const parsed = parseDealMessage(message.caption ?? message.text);
  if (!parsed) {
    // From you, but doesn't look like a forwarded deal — a short nudge is
    // more useful here than silence, since you're the one person this
    // could actually help.
    await sendTelegramReply(
      chatId,
      messageId,
      "Forward me a deal from your deal-finding bot and I'll turn it into draft posts."
    ).catch((err) => console.error("[handleMessage] nudge reply failed", err));
    return;
  }

  const existing = await findDealByTelegramMessage(chatId, messageId);
  if (existing) return; // already processed (Telegram can redeliver updates).

  const photo = largestPhoto(message);
  const photoUrl = photo ? await resolveTelegramFileUrl(photo.file_id).catch(() => undefined) : undefined;

  const deal = await createDeal({
    ...parsed,
    photoUrl,
    telegramChatId: chatId,
    telegramMessageId: messageId,
  });

  const generated = await generatePostsFromDeal(deal);
  await createPosts(generated);
  await updateDealStatus(deal.id, "posted");

  await sendTelegramReply(
    chatId,
    messageId,
    `✅ Added "${describeDeal(deal)}" to the Deal Radar UK dashboard as ${generated.length} draft post(s). Review and approve them there.`
  ).catch((err) => console.error("[handleMessage] confirmation reply failed", err));
}
