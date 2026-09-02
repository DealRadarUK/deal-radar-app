// Thin wrapper around the Airtable REST API for the "Posts" table.
//
// We talk to Airtable directly over fetch rather than pulling in their SDK —
// the REST API is simple enough (a handful of JSON endpoints) that a raw
// client keeps the code easy to read end-to-end, with no hidden behaviour.
//
// Airtable REST API docs: https://airtable.com/developers/web/api/introduction

import type { Deal, DealStatus, EditablePostFields, GeneratedPost, Post, PostStatus } from "./types";

const AIRTABLE_API_BASE = "https://api.airtable.com/v0";

function getConfig() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME || "Posts";

  if (!apiKey || !baseId) {
    throw new Error(
      "Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID environment variable. See .env.example."
    );
  }

  return { apiKey, baseId, tableName };
}

function tableUrl(pathSuffix = ""): string {
  const { baseId, tableName } = getConfig();
  return `${AIRTABLE_API_BASE}/${baseId}/${encodeURIComponent(tableName)}${pathSuffix}`;
}

function getDealsTableName(): string {
  return process.env.AIRTABLE_DEALS_TABLE_NAME || "Deals";
}

function dealsTableUrl(pathSuffix = ""): string {
  const { baseId } = getConfig();
  return `${AIRTABLE_API_BASE}/${baseId}/${encodeURIComponent(getDealsTableName())}${pathSuffix}`;
}

function authHeaders(): HeadersInit {
  const { apiKey } = getConfig();
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

// --- Airtable <-> Post field mapping ---------------------------------------
// Airtable field names follow the spec exactly (PascalCase); our app code
// uses camelCase. Keeping the mapping in one place means the rest of the
// app never has to think about Airtable's naming.

interface AirtableFields {
  Platform: string;
  Format: string;
  Topic: string;
  Hook: string;
  Script: string;
  Caption: string;
  Hashtags: string;
  Status: string;
  PublishDateTime: string;
  VideoLink?: string;
  Notes?: string;
}

interface AirtableRecord {
  id: string;
  fields: Partial<AirtableFields>;
}

function recordToPost(record: AirtableRecord): Post {
  const f = record.fields;
  return {
    id: record.id,
    platform: (f.Platform as Post["platform"]) ?? "Instagram",
    format: (f.Format as Post["format"]) ?? "Feed",
    topic: f.Topic ?? "",
    hook: f.Hook ?? "",
    script: f.Script ?? "",
    caption: f.Caption ?? "",
    hashtags: f.Hashtags ?? "",
    status: (f.Status as PostStatus) ?? "draft",
    publishDateTime: f.PublishDateTime ?? "",
    videoLink: f.VideoLink,
    notes: f.Notes,
  };
}

function editableFieldsToAirtable(fields: EditablePostFields): Partial<AirtableFields> {
  const out: Partial<AirtableFields> = {};
  if (fields.hook !== undefined) out.Hook = fields.hook;
  if (fields.caption !== undefined) out.Caption = fields.caption;
  if (fields.hashtags !== undefined) out.Hashtags = fields.hashtags;
  if (fields.publishDateTime !== undefined) out.PublishDateTime = fields.publishDateTime;
  if (fields.notes !== undefined) out.Notes = fields.notes;
  if (fields.status !== undefined) out.Status = fields.status;
  if (fields.videoLink !== undefined) out.VideoLink = fields.videoLink;
  return out;
}

async function airtableFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
    // Airtable data changes whenever we write to it — never let Next.js
    // cache a stale list of posts.
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Airtable request failed (${res.status}): ${body}`);
  }

  return res.json();
}

/** List posts, optionally narrowed by an Airtable filterByFormula string.
 * Handles pagination transparently (Airtable pages at 100 records/request). */
export async function listPosts(filterByFormula?: string): Promise<Post[]> {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams();
    params.set("sort[0][field]", "PublishDateTime");
    params.set("sort[0][direction]", "asc");
    if (filterByFormula) params.set("filterByFormula", filterByFormula);
    if (offset) params.set("offset", offset);

    const data = await airtableFetch(tableUrl(`?${params.toString()}`));
    records.push(...(data.records as AirtableRecord[]));
    offset = data.offset;
  } while (offset);

  return records.map(recordToPost);
}

/** Posts whose PublishDateTime falls within [fromISO, toISO). */
export async function listPostsInRange(fromISO: string, toISO: string): Promise<Post[]> {
  const formula = `AND(IS_AFTER({PublishDateTime}, DATETIME_PARSE("${fromISO}")), IS_BEFORE({PublishDateTime}, DATETIME_PARSE("${toISO}")))`;
  return listPosts(formula);
}

export async function getPost(id: string): Promise<Post> {
  const record = await airtableFetch(tableUrl(`/${id}`));
  return recordToPost(record as AirtableRecord);
}

/** Create one post from an OpenAI-generated draft. Always saved as "draft". */
export async function createPost(generated: GeneratedPost): Promise<Post> {
  const fields: AirtableFields = {
    Platform: generated.platform,
    Format: generated.format,
    Topic: generated.topic,
    Hook: generated.hook,
    Script: generated.script,
    Caption: generated.caption,
    Hashtags: generated.hashtags,
    Status: "draft",
    PublishDateTime: generated.publishDateTime,
  };

  const data = await airtableFetch(tableUrl(), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
  });

  return recordToPost(data.records[0] as AirtableRecord);
}

/** Create many posts in one batch (Airtable allows up to 10 records/request). */
export async function createPosts(generated: GeneratedPost[]): Promise<Post[]> {
  const created: Post[] = [];
  for (let i = 0; i < generated.length; i += 10) {
    const chunk = generated.slice(i, i + 10);
    const data = await airtableFetch(tableUrl(), {
      method: "POST",
      body: JSON.stringify({
        records: chunk.map((g) => ({
          fields: {
            Platform: g.platform,
            Format: g.format,
            Topic: g.topic,
            Hook: g.hook,
            Script: g.script,
            Caption: g.caption,
            Hashtags: g.hashtags,
            Status: "draft",
            PublishDateTime: g.publishDateTime,
          } satisfies AirtableFields,
        })),
      }),
    });
    created.push(...(data.records as AirtableRecord[]).map(recordToPost));
  }
  return created;
}

/** Patch an existing post's editable fields. */
export async function updatePost(id: string, fields: EditablePostFields): Promise<Post> {
  const data = await airtableFetch(tableUrl(), {
    method: "PATCH",
    body: JSON.stringify({
      records: [{ id, fields: editableFieldsToAirtable(fields) }],
    }),
  });
  return recordToPost(data.records[0] as AirtableRecord);
}

// --- "Deals" table: real deals sourced from the Telegram channel -----------
// A separate table from "Posts" (see lib/telegram.ts for the full picture):
// every deal the channel posts gets logged here as "new"; reacting to one
// with the trigger emoji flips it to "posted" once a Post has been written
// about it. Create this table in the same Airtable base with fields:
// ItemName, Retailer, Price, RRP, PercentOff, SizesAvailable, ProductLink,
// PhotoUrl (Attachment or URL), Status (single select: new/posted/ignored),
// TelegramChatId, TelegramMessageId (both Single line text), CreatedAt
// (Date, "Include a time field" on). See README for the full walkthrough.

interface AirtableDealFields {
  ItemName: string;
  Retailer: string;
  Price: string;
  RRP: string;
  PercentOff: string;
  SizesAvailable: string;
  ProductLink: string;
  PhotoUrl?: string;
  Status: string;
  TelegramChatId: string;
  TelegramMessageId: string;
  CreatedAt: string;
}

interface AirtableDealRecord {
  id: string;
  fields: Partial<AirtableDealFields>;
}

function recordToDeal(record: AirtableDealRecord): Deal {
  const f = record.fields;
  return {
    id: record.id,
    itemName: f.ItemName ?? "",
    retailer: f.Retailer ?? "",
    price: f.Price ?? "",
    rrp: f.RRP ?? "",
    percentOff: f.PercentOff ?? "",
    sizesAvailable: f.SizesAvailable ?? "",
    productLink: f.ProductLink ?? "",
    photoUrl: f.PhotoUrl,
    status: (f.Status as DealStatus) ?? "new",
    telegramChatId: f.TelegramChatId ?? "",
    telegramMessageId: f.TelegramMessageId ?? "",
    createdAt: f.CreatedAt ?? "",
  };
}

/** Finds the Deal already logged for a given Telegram message, if any —
 * used so the same channel post never gets logged twice (Telegram can
 * redeliver webhook updates on retry) and so a reaction can be matched back
 * to the deal it was placed on. */
export async function findDealByTelegramMessage(
  chatId: string,
  messageId: string
): Promise<Deal | null> {
  const formula = `AND({TelegramChatId} = "${chatId}", {TelegramMessageId} = "${messageId}")`;
  const params = new URLSearchParams({ filterByFormula: formula, maxRecords: "1" });
  const data = await airtableFetch(dealsTableUrl(`?${params.toString()}`));
  const records = data.records as AirtableDealRecord[];
  return records.length > 0 ? recordToDeal(records[0]) : null;
}

/** Logs a newly-seen deal from the channel as "new" — not yet selected to
 * become a post. */
export async function createDeal(deal: {
  itemName: string;
  retailer: string;
  price: string;
  rrp: string;
  percentOff: string;
  sizesAvailable: string;
  productLink: string;
  photoUrl?: string;
  telegramChatId: string;
  telegramMessageId: string;
}): Promise<Deal> {
  const fields: AirtableDealFields = {
    ItemName: deal.itemName,
    Retailer: deal.retailer,
    Price: deal.price,
    RRP: deal.rrp,
    PercentOff: deal.percentOff,
    SizesAvailable: deal.sizesAvailable,
    ProductLink: deal.productLink,
    PhotoUrl: deal.photoUrl,
    Status: "new",
    TelegramChatId: deal.telegramChatId,
    TelegramMessageId: deal.telegramMessageId,
    CreatedAt: new Date().toISOString(),
  };

  const data = await airtableFetch(dealsTableUrl(), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
  });
  return recordToDeal(data.records[0] as AirtableDealRecord);
}

/** Flips a deal's status — "posted" once a post's been generated from it,
 * or "ignored" if you decide not to use it after all. */
export async function updateDealStatus(id: string, status: DealStatus): Promise<Deal> {
  const data = await airtableFetch(dealsTableUrl(), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id, fields: { Status: status } }] }),
  });
  return recordToDeal(data.records[0] as AirtableDealRecord);
}

/** Deals you've selected (reacted to), newest first — this is what powers
 * the public website widget (see app/api/public/deals/route.ts). Capped at
 * `limit` records; Airtable's own `maxRecords` param does the limiting so
 * we never fetch more than we need. */
export async function listPostedDeals(limit = 12): Promise<Deal[]> {
  const params = new URLSearchParams({
    filterByFormula: `{Status} = "posted"`,
    maxRecords: String(limit),
    "sort[0][field]": "CreatedAt",
    "sort[0][direction]": "desc",
  });
  const data = await airtableFetch(dealsTableUrl(`?${params.toString()}`));
  return (data.records as AirtableDealRecord[]).map(recordToDeal);
}
