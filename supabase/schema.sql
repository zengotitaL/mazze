-- Run this in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_token text,
  status text not null default 'editing'
    check (status in ('editing', 'waiting', 'playing', 'finished')),
  maze jsonb not null,
  start_pos jsonb not null default '{"x":1,"y":1}'::jsonb,
  finish_pos jsonb not null default '{"x":48,"y":48}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_token text,
  name text not null check (char_length(name) between 1 and 20),
  x integer not null default 1,
  y integer not null default 1,
  joined_at timestamptz not null default now(),
  finished_at timestamptz,
  place integer
);

create index if not exists players_game_id_idx on public.players(game_id);
create index if not exists games_code_idx on public.games(code);

alter table public.games enable row level security;
alter table public.players enable row level security;

-- Classroom starter policies.
-- These intentionally favor ease of setup.
-- For a public production deployment, replace these with stricter server-side rules.

drop policy if exists "games readable" on public.games;
create policy "games readable"
on public.games for select
using (true);

drop policy if exists "games insertable" on public.games;
create policy "games insertable"
on public.games for insert
with check (true);

drop policy if exists "games updatable" on public.games;
create policy "games updatable"
on public.games for update
using (true)
with check (true);

drop policy if exists "players readable" on public.players;
create policy "players readable"
on public.players for select
using (true);

drop policy if exists "players insertable" on public.players;
create policy "players insertable"
on public.players for insert
with check (true);

drop policy if exists "players updatable" on public.players;
create policy "players updatable"
on public.players for update
using (true)
with check (true);

drop policy if exists "players deletable" on public.players;
create policy "players deletable"
on public.players for delete
using (true);

alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.players;
