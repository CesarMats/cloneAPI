-- Ejecuta este archivo en el SQL Editor de tu proyecto Supabase.
-- Los videos se pueden ver sin iniciar sesión; publicar, dar like y comentar requiere cuenta.

create extension if not exists pgcrypto;

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  handle text not null unique check (handle ~ '^[A-Za-z0-9_]{2,30}$'),
  description text not null default '' check (char_length(description) <= 500),
  created_at timestamptz not null default now()
);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  canal_id uuid not null references public.channels(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 120),
  descripcion text not null default '' check (char_length(descripcion) <= 5000),
  video_url text not null,
  thumbnail_url text,
  cloudinary_public_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.likes (
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (video_id, user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists videos_created_at_idx on public.videos (created_at desc);
create index if not exists videos_canal_id_idx on public.videos (canal_id);
create index if not exists likes_video_id_idx on public.likes (video_id);
create index if not exists comments_video_created_at_idx on public.comments (video_id, created_at desc);

alter table public.channels enable row level security;
alter table public.videos enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;

drop policy if exists "Channels are publicly readable" on public.channels;
create policy "Channels are publicly readable"
  on public.channels for select using (true);

drop policy if exists "Users create their own channel" on public.channels;
create policy "Users create their own channel"
  on public.channels for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Owners update their channel" on public.channels;
create policy "Owners update their channel"
  on public.channels for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Owners delete their channel" on public.channels;
create policy "Owners delete their channel"
  on public.channels for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Videos are publicly readable" on public.videos;
create policy "Videos are publicly readable"
  on public.videos for select using (true);

drop policy if exists "Channel owners publish videos" on public.videos;
create policy "Channel owners publish videos"
  on public.videos for insert to authenticated
  with check (
    exists (
      select 1 from public.channels
      where channels.id = videos.canal_id
        and channels.user_id = (select auth.uid())
    )
  );

drop policy if exists "Channel owners update videos" on public.videos;
create policy "Channel owners update videos"
  on public.videos for update to authenticated
  using (
    exists (
      select 1 from public.channels
      where channels.id = videos.canal_id
        and channels.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.channels
      where channels.id = videos.canal_id
        and channels.user_id = (select auth.uid())
    )
  );

drop policy if exists "Channel owners delete videos" on public.videos;
create policy "Channel owners delete videos"
  on public.videos for delete to authenticated
  using (
    exists (
      select 1 from public.channels
      where channels.id = videos.canal_id
        and channels.user_id = (select auth.uid())
    )
  );

drop policy if exists "Likes are publicly readable" on public.likes;
create policy "Likes are publicly readable"
  on public.likes for select using (true);

drop policy if exists "Users add their own likes" on public.likes;
create policy "Users add their own likes"
  on public.likes for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users remove their own likes" on public.likes;
create policy "Users remove their own likes"
  on public.likes for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Comments are publicly readable" on public.comments;
create policy "Comments are publicly readable"
  on public.comments for select using (true);

drop policy if exists "Users add their own comments" on public.comments;
create policy "Users add their own comments"
  on public.comments for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own comments" on public.comments;
create policy "Users delete their own comments"
  on public.comments for delete to authenticated
  using ((select auth.uid()) = user_id);

grant usage on schema public to anon, authenticated;
grant select on public.channels, public.videos, public.likes, public.comments to anon, authenticated;
grant insert, update, delete on public.channels, public.videos to authenticated;
grant insert, delete on public.likes to authenticated;
grant insert, delete on public.comments to authenticated;
