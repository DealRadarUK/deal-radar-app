// POST /api/telegram/webhook
//
// Telegram calls this directly whenever something happens in the deals
// channel — a new deal is posted, or someone reacts to one. It deliberately
// bypasses Basic Auth (see middleware.ts) since Telegram can't present a
// username/password; instead it's secured by a secret token Telegram sends
// with every request (set up in README, checked below).
//
// Two things this route cares about:
//  1. A new channel post in the deal bot's known format -> log it in the
//     "Deals" Airtable table as "new". Nothing else happens yet.
//  2. Someone reacting with the trigger emoji (default 🔥) to a deal we've
//     logged -> write real posts about that exact deal (OpenAI, using the
//     deal's real facts) and save them to "Posts" as drafts, then flip the
//     deal to "posted" so the same reaction can't double-process it.

import { NextRequest, NextResponse } from "next/server";
import { createDeal, createPosts, findDealByTelegramMessage, updateDealStatus } from "@/lib/airtable";
import { generatePostsFromDeal } from "@/lib/openai";
import {
  describeDeal,
  isTriggerReaction,
  isValidTelegramRequest,
  largestPhoto,
  parseDealMessage,
  resolveTelegramFileUrl,
  sendTelegramReply,
  type TelegramUpdate,
} from "@/lib/telegram";

function isFromConfiguredChannel(chatId: number): boolean {
  const configured = process.env.TELEGRAM_CHANNEL_ID;
  return Boolean(configured) && String(chatId) === configured;
}

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
    if (update.channel_post) {
      await handleChannelPost(update.channel_post);
    } else if (update.message_reaction) {
      await handleReaction(update.message_reaction);
    }
  } catch (err) {
    // Log server-side (visible in Vercel's function logs) but still
    // acknowledge the webhook — surfacing this as a failed HTTP call would
    // just make Telegram retry the same update indefinitely.
    console.error("[POST /api/telegram/webhook]", err);
  }

  return NextResponse.json({ ok: true });
}

async function handleChannelPost(message: NonNullable<TelegramUpdate["channel_post"]>) {
  if (!isFromConfiguredChannel(message.chat.id)) return;

  const parsed = parseDealMessage(message.caption ?? message.text);
  if (!parsed) return; // not a deal post in the expected format — ignore.

  const chatId = String(message.chat.id);
  const messageId = String(message.message_id);

  const existing = await findDealByTelegramMessage(chatId, messageId);
  if (existing) return; // already logged (Telegram can redeliver updates).

  const photo = largestPhoto(message);
  const photoUrl = photo ? await resolveTelegramFileUrl(photo.file_id).catch(() => undefined) : undefined;

  await createDeal({
    ...parsed,
    photoUrl,
    telegramChatId: chatId,
    telegramMessageId: messageId,
  });
}

async function handleReaction(reaction: NonNullable<TelegramUpdate["message_reaction"]>) {
  if (!isFromConfiguredChannel(reaction.chat.id)) return;
  if (!isTriggerReaction(reaction)) return;

  const chatId = String(reaction.chat.id);
  const messageId = String(reaction.message_id);

  const deal = await findDealByTelegramMessage(chatId, messageId);
  if (!deal) return; // reaction on a message we never logged as a deal.
  if (deal.status !== "new") return; // already posted or ignored — don't redo it.

  const generated = await generatePostsFromDeal(deal);
  await createPosts(generated);
  await updateDealStatus(deal.id, "posted");

  await sendTelegramReply(
    chatId,
    messageId,
    `✅ Added "${describeDeal(deal)}" to the Deal Radar UK dashboard as ${generated.length} draft post(s). Review and approve them there.`
  ).catch((err) => console.error("[handleReaction] confirmation reply failed", err));
}
