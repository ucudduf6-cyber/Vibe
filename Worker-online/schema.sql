-- Run in Supabase SQL Editor. Requires Supabase Auth email/password enabled.
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text unique not null check(username ~ '^[a-z0-9_]{5,32}$'),
 display_name text not null default 'Пользователь',
 created_at timestamptz not null default now()
);
create table if not exists public.direct_messages (
 id bigint generated always as identity primary key,
 sender_id uuid not null references auth.users(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(char_length(body) between 1 and 4000),
 created_at timestamptz not null default now(),
 check(sender_id <> recipient_id)
);
create index if not exists dm_pair_idx on public.direct_messages(sender_id,recipient_id,created_at);
create index if not exists dm_inbox_idx on public.direct_messages(recipient_id,created_at);
create table if not exists public.blocks (
 blocker_id uuid not null references auth.users(id) on delete cascade,
 blocked_id uuid not null references auth.users(id) on delete cascade,
 primary key(blocker_id,blocked_id),check(blocker_id<>blocked_id)
);
alter table public.profiles enable row level security;
alter table public.direct_messages enable row level security;
alter table public.blocks enable row level security;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check(id=auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
drop policy if exists dm_read on public.direct_messages;
create policy dm_read on public.direct_messages for select to authenticated using(sender_id=auth.uid() or recipient_id=auth.uid());
drop policy if exists dm_send on public.direct_messages;
create policy dm_send on public.direct_messages for insert to authenticated with check(
 sender_id=auth.uid() and not exists(select 1 from public.blocks where (blocker_id=recipient_id and blocked_id=auth.uid()) or (blocker_id=auth.uid() and blocked_id=recipient_id))
);
drop policy if exists blocks_read on public.blocks;
create policy blocks_read on public.blocks for select to authenticated using(blocker_id=auth.uid());
drop policy if exists blocks_insert on public.blocks;
create policy blocks_insert on public.blocks for insert to authenticated with check(blocker_id=auth.uid());
drop policy if exists blocks_delete on public.blocks;
create policy blocks_delete on public.blocks for delete to authenticated using(blocker_id=auth.uid());
-- Publish changes to subscribed clients; the app also polls as a fallback.
do $$ begin alter publication supabase_realtime add table public.direct_messages; exception when duplicate_object then null; end $$;
