// OpenAI prompt templates. Kept in one file so the brand voice lives in
// exactly one place — tweak it here and both content generation and
// reporting pick up the change.

export const BRAND_VOICE_SYSTEM_PROMPT = `You are the social media strategist for Deal Radar UK, a UK menswear and lifestyle deals brand.

AUDIENCE: UK guys, mostly 18-35, into menswear, streetwear, trainers and lifestyle gear. They want verified deals and don't want to overpay. They're deal-savvy — they can smell fake urgency and generic "fashion" content a mile off.

TONE: Direct, knowledgeable, slightly insider. No fluff, no filler adjectives, no corporate voice. Write like someone who actually knows the UK menswear resale/deals scene, not a marketing intern.

CONTENT FOCUS:
- Specific items and brands (e.g. Nike, Adidas, Carhartt WIP, Zara, Uniqlo, New Balance, North Face, Ralph Lauren) — never vague "great fashion finds".
- Clear prices: was/now, and % off, in GBP (£).
- Real urgency (limited sizes, deadlines, low stock) — never fabricated hype.
- Practical styling and money-saving tips a deal-hunter actually wants.

AVOID:
- Generic "fashion" fluff ("elevate your wardrobe", "must-have style")
- Overly salesy language ("DON'T MISS OUT!!!", excessive emoji/caps)
- Non-UK pricing, non-UK retailers, or US sizing without conversion
- Em dashes ("—"). Never use them, in any field. Use a comma, a full stop, or a regular hyphen ("-") instead — an em dash is one of the most obvious "written by AI" tells, and this has to read like a person wrote it.

Every caption should end with a clear, specific call to action (e.g. "Link in bio before sizes go", "Save this for payday", "Tag someone who needs this").`;

export function buildGenerateWeekPrompt(opts: {
  weekStartISO: string;
  weekEndISO: string;
  recentTopics?: string[];
}): string {
  const { weekStartISO, weekEndISO, recentTopics } = opts;

  const avoidRepeats =
    recentTopics && recentTopics.length > 0
      ? `\n\nRecently used hooks/topics — avoid repeating these almost verbatim:\n${recentTopics
          .map((t) => `- ${t}`)
          .join("\n")}`
      : "";

  return `Generate a 7-day content plan for Deal Radar UK covering ${weekStartISO} through ${weekEndISO} (inclusive).

Produce a mix of Instagram (Reels and static feed posts) and TikTok content — aim for roughly one post per platform per day, so about 10-14 posts total across the week. Do NOT generate X or Threads posts yet.

Vary the topic/type across the week: deal highlight, round-up, style tip, community/UGC, behind-the-scenes. Don't repeat the same topic type on consecutive days.

For EVERY post, provide all of:
- platform: "Instagram" or "TikTok"
- format: "Reel", "Feed", "TikTok", "Static", or "Thread" (use "Reel"/"TikTok" for video, "Feed"/"Static" for image posts — never "Thread" this week)
- topic: one of "Deal highlight", "Round-up", "Style tip", "Community/UGC", "Behind-the-scenes"
- hook: the first line / on-screen text that has to stop the scroll in under 3 seconds. Specific, not generic.
- script: for video posts (Reel/TikTok), a numbered shot list (5-8 short beats: what's on screen + voiceover/text each beat). For static posts, describe the single image/graphic concept instead.
- caption: 2-4 sentences in the Deal Radar UK voice, ending with a clear CTA. Default to NO emoji — most captions should have zero. Use at most one, only if it genuinely adds something (never decoratively, never one per sentence) — when in doubt, leave it out. Reads like a person who knows the brand wrote it, not an AI showing off.
- hashtags: exactly 8-12 hashtags as a single space-separated string, mixing brand (#dealradaruk), niche (#mensfashionuk, #streetwearuk), and deal-specific (#nikedeals, #saleuk) tags — no generic spam tags.
- publishDateTime: an ISO 8601 datetime within ${weekStartISO} to ${weekEndISO}, at a sensible time for that platform (Instagram Reels/TikTok best around 12:00-14:00 or 18:00-21:00 UK time; static feed posts can go earlier morning ~08:00). Spread posts across different days and times — don't stack multiple posts at the same time.${avoidRepeats}

Return ONLY valid JSON matching this exact shape (no markdown fences, no commentary):
{ "posts": [ { "platform": "...", "format": "...", "topic": "...", "hook": "...", "script": "...", "caption": "...", "hashtags": "...", "publishDateTime": "..." }, ... ] }`;
}

export function buildPostFromDealPrompt(opts: {
  itemName: string;
  retailer: string;
  price: string;
  rrp: string;
  percentOff: string;
  sizesAvailable: string;
  productLink: string;
  nowISO: string;
}): string {
  const { itemName, retailer, price, rrp, percentOff, sizesAvailable, productLink } = opts;

  return `Write social posts for ONE specific, real, already-verified deal for Deal Radar UK — do not invent or alter any of the facts below, use them exactly as given:

- Item: ${itemName}
- Retailer: ${retailer}
- Price: ${price}
- RRP: ${rrp}
- Discount: ${percentOff}
- Sizes available: ${sizesAvailable}
- Product link: ${productLink}

Produce exactly 2 posts about this one deal: one Instagram Reel and one TikTok. Both cover the same deal but should NOT be near-identical — vary the hook and angle between them.

For EACH of the 2 posts, provide all of:
- platform: "Instagram" or "TikTok" (use each exactly once)
- format: "Reel" for the Instagram one, "TikTok" for the TikTok one
- topic: "Deal highlight"
- hook: the first line / on-screen text that has to stop the scroll in under 3 seconds. Specific to this exact item and price.
- script: a numbered shot list (5-8 short beats: what's on screen + voiceover/text each beat), built around the real price/discount/sizes above.
- caption: 2-4 sentences in the Deal Radar UK voice, ending with a clear CTA. Default to NO emoji — most captions should have zero. Use at most one, only if it genuinely adds something (never decoratively, never one per sentence) — when in doubt, leave it out. Reads like a person who knows the brand wrote it, not an AI showing off. Reference the real price and % off.
- hashtags: exactly 8-12 hashtags as a single space-separated string, mixing brand (#dealradaruk), niche, and deal-specific tags relevant to this item/retailer.

Do NOT include a publishDateTime field — scheduling for these is handled separately, outside this response.

Return ONLY valid JSON matching this exact shape (no markdown fences, no commentary):
{ "posts": [ { "platform": "...", "format": "...", "topic": "...", "hook": "...", "script": "...", "caption": "...", "hashtags": "..." }, ... exactly 2 ] }`;
}

export function buildWeeklyReportPrompt(opts: {
  rangeStartISO: string;
  rangeEndISO: string;
  metricsJson: string;
}): string {
  const { rangeStartISO, rangeEndISO, metricsJson } = opts;

  return `Here is last week's (${rangeStartISO} to ${rangeEndISO}) Deal Radar UK post performance data from Metricool, as JSON:

${metricsJson}

Analyse it and return ONLY valid JSON (no markdown fences, no commentary) matching this exact shape:
{
  "summary": "2-3 paragraph plain-English summary of how the week performed overall, written for the founder — no jargon.",
  "topPosts": [ { "postId": "...", "reason": "one sentence on why this post worked" }, ... up to 3 ],
  "bestHooksFormatsTimes": [ "3-5 short bullet-style observations about which hooks, formats, and publish times performed best this week" ],
  "recommendations": [ "exactly 3 concrete, specific changes to make next week — not generic advice. Reference actual formats/topics/times from the data." ]
}

Base every claim strictly on the data provided — do not invent numbers or posts that aren't in it. If the data is too sparse to draw a confident conclusion about something, say so plainly in the summary instead of guessing.`;
}
