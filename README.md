# Deal Radar UK — Content Desk

An AI-assisted social media manager for Deal Radar UK. The founder's job each
week is: click **Generate Week**, tweak a few captions, click **Approve**,
upload video files in Metricool, and click **Generate Report** once a week.
Everything else — writing the posts, storing them, kicking off scheduling,
and summarising performance — is automated.

This README assumes no prior Next.js/Vercel/Airtable experience. Follow it
top to bottom the first time.

**Starting for free:** Metricool's API (auto-scheduling + auto-pulled
analytics) needs their paid Advanced plan (~£40-55/month). You don't need it
to use this app — just skip section 4 and leave the `METRICOOL_*` env vars
blank. Everything else works fully: OpenAI still writes the week, Airtable
still stores and tracks it, you still approve posts inline. Approving a post
just marks it `approved` with a note to schedule it by hand (Metricool's own
free plan, or posting directly in the Instagram/TikTok apps), and `/report`
switches to a quick manual-entry form — you type in last week's numbers from
Instagram/TikTok's own free Insights, and OpenAI writes the exact same kind
of report. Add the Metricool env vars later, any time, to switch both over
to fully automatic — nothing else about the app changes.

---

## 1. What this app actually does

- **Generate Week** (dashboard, `/`): calls OpenAI with a system prompt
  encoding Deal Radar UK's voice, gets back ~10-14 Instagram + TikTok posts
  for the next 7 days, and saves them to Airtable as `draft`. **Important:**
  OpenAI invents plausible-sounding items, prices and discounts here — it
  has no live access to real retailer prices, so treat every Generate Week
  post as a template to fact-check and fill in with a real deal before
  approving it. If you want posts built from real, already-verified deals
  instead, use the Telegram curation flow in section 9 — those posts use
  the deal's actual price/retailer/link throughout, never invented ones.
- **Dashboard** (`/`): shows the next 14 days of posts, grouped by day, with
  inline-editable Hook / Caption / Hashtags / Publish time, filters by
  platform and status, and an **Approve** button per post.
- **Approving a post**: if Metricool is connected (see the free-start note
  above), the moment a post's status flips to `approved` the app calls
  Metricool to create a scheduled draft (caption + hashtags + time). If that
  call succeeds, status auto-advances to `scheduled`. If it fails (e.g.
  Metricool is down, or a field is wrong), status stays `approved` and the
  error is written into the post's **Notes** field so you can see what
  happened — it does not silently disappear. If Metricool isn't connected at
  all, approving just marks the post `approved` with a note to schedule it
  yourself.
- **Generate Report** (`/report`): with Metricool connected, pulls last
  week's performance for your posts automatically; without it, walks you
  through typing the numbers in by hand instead. Either way, sends the data
  to OpenAI and shows a plain-English summary, top posts, best
  hooks/formats/times, 3 concrete recommendations, and charts — plus an
  "email this report" link that opens your email client pre-filled.

Video files are **not** uploaded through this app — per the brief, you
attach the actual Reel/TikTok video file directly in Metricool (or post
natively) once a post is approved. The app only ever writes a placeholder
`VideoLink` field in Airtable if you want to paste a link to the file
yourself for reference.

**Optional — Telegram deal curation:** if you connect your Telegram deals
channel (section 9), every deal your channel posts gets logged automatically,
and reacting to one with 🔥 turns it straight into draft posts written from
that deal's *real* price/retailer/link — no AI-invented numbers. A public,
read-only endpoint also lets your actual website show a live "Latest Deals"
widget pulling from the same curated list. Both are entirely optional and
the rest of the app works identically without them.

---

## 2. One-time setup: create the Airtable base

1. Go to [airtable.com](https://airtable.com) and sign in (or create a free
   account).
2. Click **Create a base** → **Start from scratch**. Name it something like
   `Deal Radar UK`.
3. Rename the default table to **`Posts`** (this must match exactly, unless
   you also change `AIRTABLE_TABLE_NAME` later).
4. Delete the default columns Airtable adds, and create these fields
   exactly as listed (field name → field type):

   | Field name        | Type                                                            |
   | ------------------ | ---------------------------------------------------------------- |
   | `Platform`          | Single select — options: `Instagram`, `TikTok`, `X`, `Threads`   |
   | `Format`            | Single select — options: `Reel`, `Feed`, `TikTok`, `Static`, `Thread` |
   | `Topic`             | Single select — options: `Deal highlight`, `Round-up`, `Style tip`, `Community/UGC`, `Behind-the-scenes` |
   | `Hook`              | Single line text                                                  |
   | `Script`            | Long text                                                          |
   | `Caption`           | Long text                                                          |
   | `Hashtags`          | Single line text                                                  |
   | `Status`            | Single select — options: `draft`, `approved`, `scheduled`, `published` |
   | `PublishDateTime`   | Date — turn on **"Include a time field"**, and set the field's timezone to your local one |
   | `VideoLink`         | URL                                                                |
   | `Notes`             | Long text                                                          |

   Tip: for each single-select field, add the options in the exact
   capitalisation shown above — the app matches these strings exactly.

5. Get your **Base ID**: open
   [airtable.com/api](https://airtable.com/api), click into your new base,
   and the Base ID (starts with `app...`) is shown right at the top of the
   page and in the URL.
6. Get an **API key (Personal Access Token)**: go to
   [airtable.com/create/tokens](https://airtable.com/create/tokens) →
   **Create new token**. Give it a name, add scopes `data.records:read` and
   `data.records:write`, and under **Access** add the `Deal Radar UK` base.
   Click **Create token** and copy the value (starts with `pat...`) — you
   won't be able to see it again.

You now have `AIRTABLE_BASE_ID` and `AIRTABLE_API_KEY`.

---

## 3. One-time setup: get an OpenAI API key

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
   and sign in.
2. Click **Create new secret key**, name it `deal-radar-uk`, and copy the
   value (starts with `sk-...`) — again, shown only once.
3. Make sure the account has billing set up
   ([platform.openai.com/settings/billing](https://platform.openai.com/settings/billing))
   — the API is pay-as-you-go, separate from a ChatGPT subscription.

This is `OPENAI_API_KEY`. The app defaults to `gpt-5.6-terra` — OpenAI's
current balanced-quality tier, a sensible default for brand-voice
copywriting. Cost for this app's usage (one Generate Week + one Generate
Report call a week) is a fraction of a cent either way, but if you want to
change tiers, set `OPENAI_MODEL` to `gpt-5.6-luna` (cheapest/fastest) or
`gpt-5.6-sol` (most capable) — no code changes needed. OpenAI's model
lineup moves fast; if whatever's set ever stops working, check
[platform.openai.com/docs/models](https://platform.openai.com/docs/models)
for the current model names.

---

## 4. Optional: get your Metricool API credentials

**Skip this section entirely if you're starting on Metricool's free plan (or
without Metricool at all)** — leave the three `METRICOOL_*` variables blank
in `.env.local`/Vercel and the app degrades gracefully as described in the
free-start note above. Come back to this section whenever you upgrade.

Metricool's API is only available on **Advanced** or **Custom** plans, and
it authenticates differently from most APIs — it's a static account token,
not an OAuth login, so there's nothing to "connect" each time.

1. In Metricool, go to **Settings → API access** (or search "API" in
   settings) and generate/copy your **API token**. This is
   `METRICOOL_API_TOKEN`.
2. On the same page, note your **User ID** (`METRICOOL_USER_ID`) — this
   identifies your Metricool account.
3. Note the **Blog ID** (sometimes shown as "Brand ID") for the Deal Radar
   UK brand specifically (`METRICOOL_BLOG_ID`) — you can also find this in
   the URL when you have that brand open in the Metricool dashboard.

**Important caveat:** Metricool's full API reference is a Swagger document
that only appears once you're logged into an Advanced/Custom account (same
Settings → API access page). This project's `lib/metricool.ts` implements
the post-scheduling endpoint exactly as documented
(`POST /v2/scheduler/posts`), but the analytics endpoint used for the
weekly report (`getWeeklyPostMetrics` in that same file) is a best-effort
implementation — Metricool's analytics API shape varies by plan and network
and isn't publicly documented outside your own account's Swagger doc. If
`/report` errors out on the Metricool step, open that Swagger doc, find the
correct path for Instagram/TikTok post-level insights, and update the
`METRICOOL_ANALYTICS_PATH` constant near the top of `lib/metricool.ts` —
nothing else in the app needs to change.

---

## 5. Run it locally (recommended before deploying)

You'll need [Node.js](https://nodejs.org) 18 or later installed.

```bash
# from inside the deal-radar-app folder
cp .env.example .env.local
# now open .env.local and fill in every value from steps 2-4 above,
# plus pick your own APP_BASIC_AUTH_USER / APP_BASIC_AUTH_PASSWORD

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — your browser will
prompt for the username/password you set. Try **Generate Week** first; if
that works, Airtable and OpenAI are wired up correctly. Approve one post to
test the Metricool connection.

---

## 6. Deploy to Vercel (free tier)

1. Push this project to a GitHub repository (create a new empty repo on
   GitHub, then from this folder):

   ```bash
   git init
   git add .
   git commit -m "Deal Radar UK content desk"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```

2. Go to [vercel.com](https://vercel.com), sign in with GitHub, click
   **Add New… → Project**, and import the repository you just pushed.
   Vercel auto-detects Next.js — you don't need to change any build
   settings.
3. Before clicking Deploy, open **Environment Variables** and add every
   variable from `.env.example` with your real values:
   - `OPENAI_API_KEY`
   - `AIRTABLE_API_KEY`
   - `AIRTABLE_BASE_ID`
   - `AIRTABLE_TABLE_NAME` (leave as `Posts` unless you renamed it)
   - `METRICOOL_API_TOKEN`
   - `METRICOOL_USER_ID`
   - `METRICOOL_BLOG_ID`
   - `APP_BASIC_AUTH_USER`
   - `APP_BASIC_AUTH_PASSWORD`
   - `NEXT_PUBLIC_REPORT_EMAIL_TO` (optional)
4. Click **Deploy**. After it finishes (~1-2 minutes), Vercel gives you a
   `.vercel.app` URL — that's your live app. The free tier is more than
   enough for this usage pattern (a handful of requests a week).
5. Visit the URL, enter the basic-auth username/password you set, and
   you're in.

**Updating the app later**: any time you (or Claude) change code, commit and
`git push` — Vercel automatically redeploys. Environment variable changes
are made in the Vercel project's **Settings → Environment Variables** tab
and take effect on the next deploy (redeploy manually from the Vercel
dashboard if you only changed an env var and didn't push new code).

---

## 7. Week-to-week usage

1. Monday morning: open the app, click **Generate Week**. ~10-14 draft
   posts appear across Instagram and TikTok for the next 7 days.
2. Skim through, tweak any caption/hook/hashtags/time you're not happy
   with (auto-saves as you click away from a field), then click **Approve**
   on each one you're happy with.
   - **With Metricool connected**: this automatically creates the scheduled
     draft in Metricool — open it there and attach the actual video file for
     Reels/TikToks (the app can't do this part — video files need to be
     recorded/edited by you).
   - **Without Metricool**: the post is marked `approved` with a note to
     schedule it yourself — post it directly in the Instagram/TikTok apps,
     or paste the caption/hashtags into Metricool's free scheduler. Update
     its status dropdown to `scheduled`/`published` yourself to keep track.
3. Once a week (e.g. the following Monday, before generating the new week),
   go to `/report`.
   - **With Metricool connected**: click **Generate Report**.
   - **Without Metricool**: click **Load last week's posts**, type in each
     post's views/likes/comments/shares/saves/profile visits/link clicks
     from Instagram/TikTok's own free Insights, then **Generate report from
     these numbers**.
   Either way you get the same AI summary and recommendations. Use "Email
   this report" if you want a copy in your inbox.

If a post's card shows a small amber note under it, that's either the
"schedule this by hand" note (Metricool not connected) or an error message
from a failed Metricool call (connected, but something went wrong — check
the note text, fix the underlying issue, and re-approve).

---

## 8. Project structure

```
deal-radar-app/
├── app/
│   ├── layout.tsx              # root layout, page shell
│   ├── globals.css             # Tailwind + small design-system classes
│   ├── page.tsx                 # "/" — dashboard
│   ├── report/
│   │   └── page.tsx             # "/report" — weekly report
│   └── api/
│       ├── posts/route.ts               # GET list (14-day window + filters)
│       ├── posts/[id]/route.ts          # PATCH edit/approve (+ Metricool call)
│       ├── posts/last-week/route.ts     # GET — manual-metrics report fallback
│       ├── generate-week/route.ts       # POST — OpenAI -> Airtable
│       ├── generate-report/route.ts     # POST — Metricool/manual -> OpenAI
│       ├── status/route.ts              # GET — which optional integrations are live
│       ├── telegram/webhook/route.ts    # POST — Telegram deal curation (section 9)
│       └── public/deals/route.ts        # GET — public, powers the website widget
├── components/
│   ├── GenerateWeekButton.tsx
│   ├── FilterBar.tsx
│   ├── PostList.tsx
│   ├── PostCard.tsx              # inline-editable post card
│   ├── PlatformBadge.tsx
│   ├── StatusBadge.tsx
│   ├── ManualMetricsForm.tsx     # /report fallback when Metricool isn't connected
│   └── ReportCharts.tsx          # Recharts bar chart + table
├── lib/
│   ├── types.ts                  # shared TypeScript types
│   ├── airtable.ts                # Airtable REST client (Posts + Deals CRUD)
│   ├── openai.ts                  # OpenAI calls (generate week / from-deal / report)
│   ├── metricool.ts               # Metricool API (schedule post / analytics)
│   ├── telegram.ts                # Telegram Bot API client + deal-message parsing
│   ├── prompts.ts                 # brand voice + prompt templates
│   └── dateUtils.ts               # date-range helpers
├── widget/
│   └── deal-radar-widget.html     # standalone snippet for your website (section 9e)
├── middleware.ts                  # HTTP Basic Auth for the whole app (+ 2 public routes)
├── .env.example
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

---

## 9. Optional: Telegram deal curation + website widget

This connects your existing Telegram deals channel to the app: every deal
posted there gets logged automatically, and reacting to one with 🔥 turns it
into draft posts written from that deal's real facts (never AI-invented
prices). A public endpoint also lets your actual website (built separately,
e.g. on GoDaddy Airo) show a live "Latest Deals" widget pulling from
whatever you've curated this way.

**Skip this whole section if you don't need it** — leave the four
`TELEGRAM_*` variables blank and nothing about the rest of the app changes.

This feature **only works once the app is deployed and live** (section 6) —
Telegram needs a real internet address to send updates to, so there's no
local-development version of this one.

### 9a. Create a dedicated Telegram bot

Use a brand-new bot for this, separate from your existing deal-finding bot —
a single Telegram bot can only receive updates one way at a time, and your
existing bot is presumably already busy watching retailers. Adding a second
bot avoids any risk of breaking it.

1. In Telegram, message **[@BotFather](https://t.me/BotFather)** and send
   `/newbot`. Give it a name (e.g. "Deal Radar UK Curator") and a username
   ending in `bot` (e.g. `dealradaruk_curator_bot`).
2. BotFather replies with a token like `123456789:AAH...` — this is
   `TELEGRAM_BOT_TOKEN`.
3. Open your existing deals channel → **Administrators** → **Add Admin** →
   search for the new bot's username → add it. It only needs to be an admin
   to receive channel posts/reactions — no special permissions required.
4. Get your channel's ID for `TELEGRAM_CHANNEL_ID`: the easiest way is to
   forward any message from the channel to
   **[@userinfobot](https://t.me/userinfobot)** or
   **[@JsonDumpBot](https://t.me/JsonDumpBot)**, which will show you a
   number like `-1001234567890` (channel IDs are negative) — copy that
   exactly, including the minus sign.
5. Pick your own `TELEGRAM_WEBHOOK_SECRET` — any random string (e.g. mash
   the keyboard for 20+ characters). This is what stops a stranger from
   sending fake updates straight to the webhook URL.
6. Leave `TELEGRAM_TRIGGER_EMOJI` as `🔥`, or change it to any single emoji
   you'd rather react with.

### 9b. Add the "Deals" table in Airtable

In the same base as `Posts`, create a new table named exactly `Deals` with
these fields:

| Field name          | Type                                              |
| -------------------- | -------------------------------------------------- |
| `ItemName`            | Single line text                                    |
| `Retailer`            | Single line text                                    |
| `Price`               | Single line text                                    |
| `RRP`                 | Single line text                                    |
| `PercentOff`          | Single line text                                    |
| `SizesAvailable`      | Single line text                                    |
| `ProductLink`         | URL                                                  |
| `PhotoUrl`            | URL                                                  |
| `Status`              | Single select — options: `new`, `posted`, `ignored` |
| `TelegramChatId`      | Single line text                                    |
| `TelegramMessageId`   | Single line text                                    |
| `CreatedAt`           | Date — turn on "Include a time field"               |

Your existing Personal Access Token also needs access to this table — since
it's the same base you already granted it access to, nothing extra is
needed there.

### 9c. Add the environment variables and deploy

Add all four `TELEGRAM_*` values from 9a to both `.env.local` and your
Vercel project's Environment Variables (same as every other key — see
section 6), then deploy/redeploy so they take effect.

### 9d. Register the webhook

This tells Telegram where to send updates. Once the app is live, visit this
URL in your browser once (replace the three placeholders with your actual
values):

```
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<your-app>.vercel.app/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>&allowed_updates=%5B%22channel_post%22%2C%22message_reaction%22%5D
```

A reply of `{"ok":true,"result":true,...}` means it's set up. From now on,
every deal your channel posts gets logged, and reacting with 🔥 turns it
into draft posts on the dashboard — watch for the bot's confirmation reply
under the message.

If you ever want to check or clear it:

```
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/deleteWebhook
```

### 9e. Add the "Latest Deals" widget to your website

`widget/deal-radar-widget.html` in this project is a self-contained
snippet — open it, replace the placeholder app URL near the top with your
real deployed address, then copy the whole file's contents into a Custom
Code / Embed block on your GoDaddy Airo site, wherever you want the deals
to appear. It calls the app's public `/api/public/deals` endpoint (no
login needed — it only ever returns deals you've curated) and renders them
as simple cards. Feel free to hand it to me to restyle to match your site's
look once it's live.

---

## 10. Extending later

- **Adding X / Threads**: add them to the `Platform` type in `lib/types.ts`
  (already includes them), add matching options to the Airtable `Platform`
  and `Format` single-selects, add a `NETWORK_MAP` entry in
  `lib/metricool.ts` once you've confirmed Metricool's network identifier
  for each, and mention them in the week-generation prompt in
  `lib/prompts.ts`. Nothing else needs to change.
- **Swapping Basic Auth for NextAuth**: if you ever add teammates who each
  need their own login, replace `middleware.ts` with NextAuth — every other
  file is unaware of how auth works, so this is a self-contained swap.
- **Auto-emailing the report**: currently a `mailto:` link. To send it
  automatically, add an email provider (e.g. Resend) API route that's
  called at the end of `/api/generate-report`.
