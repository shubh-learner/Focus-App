# Focus

A minimalist, distraction-free YouTube dashboard organized by topic. Create
sections (News, Spirituality, Technical, Medical...), subscribe to channels
under each, and read the latest uploads in one calm feed — no autoplay, no
recommended-video rabbit holes, no YouTube homepage clutter.

100% free stack: **Next.js + Tailwind**, **Supabase** (Postgres + Auth + RLS),
**YouTube Data API v3** (free quota), **Vercel** (hosting), **GitHub Actions**
(free scheduled refresh).

---

## 1. Project structure

```
focus-app/
├── supabase/
│   └── schema.sql              # run once in Supabase SQL editor
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx            # dashboard (server component, auth-gated)
│   │   ├── globals.css
│   │   ├── login/page.tsx
│   │   └── api/
│   │       ├── auth/callback/route.ts     # Google OAuth callback
│   │       ├── sections/route.ts          # GET (list), POST (create)
│   │       ├── sections/[id]/route.ts     # PATCH (rename/reorder), DELETE
│   │       ├── youtube/search/route.ts    # channel search (100 units/call)
│   │       ├── subscriptions/route.ts     # POST subscribe, DELETE unsubscribe
│   │       ├── videos/route.ts            # GET user's cached feed (0 units)
│   │       └── videos/refresh/route.ts    # cron target (1 unit/channel)
│   ├── components/
│   │   ├── Dashboard.tsx
│   │   ├── Section.tsx
│   │   ├── VideoCard.tsx
│   │   ├── VideoModal.tsx      # official YouTube IFrame Player API
│   │   ├── ChannelSearch.tsx
│   │   └── AuthForm.tsx
│   ├── lib/
│   │   ├── supabase/client.ts  # browser client
│   │   ├── supabase/server.ts  # server client (RLS) + admin client (cron)
│   │   ├── youtube.ts          # quota-conscious YouTube API wrapper
│   │   └── types.ts
│   └── middleware.ts           # session refresh + route protection
└── .github/workflows/refresh-videos.yml   # free scheduled cache refresh
```

---

## 2. Set up Supabase (free)

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. **SQL Editor** → paste the contents of `supabase/schema.sql` → **Run**.
   This creates `sections`, `channels`, `subscriptions`, `videos`, a
   `user_feed` view, and Row Level Security policies so each user can only
   ever see and modify their own sections/subscriptions.
3. **Authentication → Providers**: Email is on by default. To enable Google
   sign-in too, toggle on **Google** and follow Supabase's prompt to add a
   Google OAuth Client ID/secret (also free, via Google Cloud Console).
4. **Authentication → URL Configuration**: set your site URL (e.g. your
   Vercel domain) and add `http://localhost:3000` for local dev.
5. **Project Settings → API**: copy the Project URL, `anon` public key, and
   `service_role` secret key — you'll need them in step 4 below.

## 3. Get a free YouTube Data API v3 key

1. [console.cloud.google.com](https://console.cloud.google.com) → create a
   project (free, no billing required for this quota tier).
2. **APIs & Services → Library** → enable **YouTube Data API v3**.
3. **APIs & Services → Credentials → Create Credentials → API key**.
4. Click the new key → **Restrict key** → API restrictions → limit it to
   "YouTube Data API v3" (good practice, still free).
5. This gives you **10,000 quota units/day**, reset daily, at no cost.

## 4. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase (server-only, never exposed to the browser)
- `YOUTUBE_API_KEY` — from Google Cloud Console
- `CRON_SECRET` — any long random string you make up, e.g. `openssl rand -hex 32`

## 5. Run locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`. Sign up with email/password (Supabase sends a
confirmation email) or Google, then create your first section and subscribe
to a channel via the search box.

## 6. Deploy (free)

**Frontend — Vercel:**
1. Push this repo to GitHub.
2. [vercel.com](https://vercel.com) → New Project → import the repo.
3. Add the same environment variables from `.env.local` in Vercel's project
   settings (Environment Variables).
4. Deploy. Note your production URL (e.g. `https://focus-yourname.vercel.app`).
5. Back in Supabase → Authentication → URL Configuration, add that URL as an
   allowed redirect URL.

**Scheduled cache refresh — GitHub Actions (free, avoids Vercel Hobby's
1-cron-job/day limit):**
1. In your GitHub repo → **Settings → Secrets and variables → Actions**, add:
   - `APP_URL` = your deployed URL (no trailing slash)
   - `CRON_SECRET` = the same value you put in Vercel's env vars
2. The included `.github/workflows/refresh-videos.yml` runs every 3 hours
   automatically and calls `POST /api/videos/refresh`, which re-fetches the
   latest uploads for every distinct channel any user is subscribed to and
   updates the shared `videos` cache. You can also trigger it manually from
   the repo's **Actions** tab (`workflow_dispatch`).

That's it — no paid tier, no credit card, anywhere in this stack.

---

## 7. How data flows (and why it's per-user + cheap)

- **Sections & subscriptions** are per-user rows protected by Postgres Row
  Level Security — a user's JWT (from Supabase Auth) is checked against
  `auth.uid() = user_id` on every read/write, enforced at the database level
  regardless of what the API route does.
- **Channels & videos are a single shared cache**, not duplicated per user.
  If 10 users all subscribe to the same news channel, its metadata and
  videos are fetched and stored *once*; every subscriber just reads that
  cached row. This is what makes 50 users viable on the free quota.
- Loading the dashboard (`GET /api/videos`) never calls YouTube — it only
  reads Supabase. YouTube is called in exactly three places:
  1. `GET /api/youtube/search` — when a user actively searches for a channel
     (100 units).
  2. `POST /api/subscriptions` — once per *new* channel ever added to the
     system, to resolve its uploads playlist and seed initial videos
     (2 units total: 1 for `channels.list`, 1 for `playlistItems.list`).
  3. `POST /api/videos/refresh` — the scheduled job, 1 unit per distinct
     subscribed channel.

## 8. Quota management at ~50-user scale

YouTube Data API v3 free quota: **10,000 units/day**, reset at midnight
Pacific time.

| Action | Cost | Frequency at 50 users | Daily cost |
|---|---|---|---|
| `playlistItems.list` (refresh) | 1 unit/channel | ~150 distinct channels × 8 refreshes/day (every 3h) | ~1,200 units |
| `search.list` (channel search) | 100 units/call | ~20 searches/day (generous estimate) | ~2,000 units |
| `channels.list` + first `playlistItems.list` (new channel) | 2 units | ~10 new channels/day | ~20 units |
| **Total** | | | **~3,200 / 10,000 units** |

That leaves roughly 6,800 units of daily headroom. Practical levers if you
ever need more:
- **Reduce refresh frequency** — every 6h (4×/day) instead of 3h roughly
  halves the biggest line item.
- **The `playlistItems.list` trick is the single biggest lever**: it costs
  1 unit vs. the 100 units `search.list` would cost to list a channel's
  videos — always prefer it, which this codebase already does everywhere
  except the one-time channel *search* action.
- **Cap search results** (`maxResults=8` in `lib/youtube.ts`) to discourage
  runaway browsing without limiting usefulness.
- If a single Google Cloud project ever felt tight, YouTube quota is granted
  per project, so a second free Google Cloud project + API key is a legal,
  zero-cost way to get another 10,000 units/day — not needed at 50 users,
  but good to know exists.

## 9. Design notes

- Palette: off-white paper (`#f7f5f2`), warm card white (`#fbfaf8`), soft
  ink text, muted taupe accents — no saturated colors, no red notification
  dots, nothing competing for attention.
- Typography: serif for a "reading," Kindle-like feel rather than an app
  dashboard feel.
- No infinite scroll, no autoplay (`autoplay: 0` explicitly set on the
  IFrame player), no "Up Next" queue, no trending/recommended sections —
  the feed only ever shows videos from channels *you* chose to follow.
- The video player uses the **official YouTube IFrame Player API**
  (`https://www.youtube.com/iframe_api`) loaded client-side — no scraping,
  no ad-blocking hacks, fully within YouTube's Terms of Service.

## 10. Extending

- **Bulk-import subscriptions** from a YouTube "Takeout" export (channel
  IDs) — same `/api/subscriptions` POST route, just loop over the list.
- **Mark as read / seen** — add a `seen_video_ids` per-user table if you
  want read/unread state.
- **Digest email** — a second GitHub Actions workflow could summarize new
  videos and email users via a free-tier transactional email service.
