-- ============================================================
-- FOCUS — Supabase schema
-- Run this in Supabase Studio -> SQL Editor -> New query -> Run
-- ============================================================

-- ---------- SECTIONS (per-user, e.g. "News", "Spirituality") ----------
create table if not exists public.sections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(trim(name)) > 0),
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists sections_user_id_idx on public.sections(user_id);

alter table public.sections enable row level security;

create policy "sections_select_own" on public.sections
  for select using (auth.uid() = user_id);
create policy "sections_insert_own" on public.sections
  for insert with check (auth.uid() = user_id);
create policy "sections_update_own" on public.sections
  for update using (auth.uid() = user_id);
create policy "sections_delete_own" on public.sections
  for delete using (auth.uid() = user_id);


-- ---------- CHANNELS (shared cache, not per-user) ----------
-- Basic channel metadata, fetched once and reused by every user who
-- subscribes to the same channel. Saves YouTube API quota.
create table if not exists public.channels (
  channel_id     text primary key,          -- YouTube channel ID, e.g. UC_xxx
  title          text not null,
  thumbnail_url  text,
  uploads_playlist_id text,                  -- "UU..." playlist, used for cheap video fetches
  last_fetched_at timestamptz,               -- last time videos were refreshed for this channel
  created_at     timestamptz not null default now()
);

alter table public.channels enable row level security;
-- Channels are shared reference data: any authenticated user may read them.
create policy "channels_select_authenticated" on public.channels
  for select using (auth.role() = 'authenticated');
-- Only the server (service role, which bypasses RLS) writes to this table.


-- ---------- SUBSCRIPTIONS (per-user link: section -> channel) ----------
create table if not exists public.subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  section_id  uuid not null references public.sections(id) on delete cascade,
  channel_id  text not null references public.channels(channel_id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, section_id, channel_id)
);

create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);
create index if not exists subscriptions_section_id_idx on public.subscriptions(section_id);
create index if not exists subscriptions_channel_id_idx on public.subscriptions(channel_id);

alter table public.subscriptions enable row level security;

create policy "subs_select_own" on public.subscriptions
  for select using (auth.uid() = user_id);
create policy "subs_insert_own" on public.subscriptions
  for insert with check (auth.uid() = user_id);
create policy "subs_delete_own" on public.subscriptions
  for delete using (auth.uid() = user_id);


-- ---------- VIDEOS (shared cache per channel) ----------
create table if not exists public.videos (
  id            uuid primary key default gen_random_uuid(),
  channel_id    text not null references public.channels(channel_id) on delete cascade,
  video_id      text not null,
  title         text not null,
  thumbnail_url text,
  published_at  timestamptz not null,
  fetched_at    timestamptz not null default now(),
  unique (channel_id, video_id)
);

create index if not exists videos_channel_id_idx on public.videos(channel_id);
create index if not exists videos_published_at_idx on public.videos(published_at desc);

alter table public.videos enable row level security;
create policy "videos_select_authenticated" on public.videos
  for select using (auth.role() = 'authenticated');
-- Only the server (service role) writes to this table via the refresh cron route.


-- ---------- Convenience view: a user's feed, video + channel + section ----------
create or replace view public.user_feed as
select
  s.id as section_id,
  s.name as section_name,
  s.position as section_position,
  sub.user_id,
  c.channel_id,
  c.title as channel_title,
  c.thumbnail_url as channel_thumbnail,
  v.id as video_row_id,
  v.video_id,
  v.title as video_title,
  v.thumbnail_url as video_thumbnail,
  v.published_at
from public.subscriptions sub
join public.sections s on s.id = sub.section_id
join public.channels c on c.channel_id = sub.channel_id
left join public.videos v on v.channel_id = c.channel_id;

-- Views inherit RLS from underlying tables when queried through PostgREST
-- with the user's JWT, so each user only ever sees their own subscriptions.
