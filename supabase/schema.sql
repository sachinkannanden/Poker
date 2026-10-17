-- Hold'em Night history. Run this once in the Supabase SQL editor.
-- Rows are written by the game server with the service-role key; row level security is
-- switched on with no policies, so the public (anon) key can't read or write anything.

create table if not exists public.games (
  id               uuid primary key,
  code             text        not null,
  name             text        not null,
  card_mode        text        not null check (card_mode in ('digital', 'physical')),
  host_plays       boolean     not null default true,
  rules            jsonb       not null,
  status           text        not null default 'lobby',
  created_at       timestamptz not null,
  ended_at         timestamptz,
  final_standings  jsonb
);

create table if not exists public.hands (
  id            bigint generated always as identity primary key,
  game_id       uuid        not null references public.games (id) on delete cascade,
  hand_number   integer     not null,
  completed_at  timestamptz not null default now(),
  voided        boolean     not null default false,
  dealer        text,
  board         jsonb       not null default '[]',
  pot_total     integer     not null default 0,
  pots          jsonb       not null default '[]',
  players       jsonb       not null default '[]',
  stacks        jsonb       not null default '{}',
  log           jsonb       not null default '[]',
  unique (game_id, hand_number)
);

create index if not exists hands_game_idx on public.hands (game_id, hand_number);
create index if not exists games_code_idx on public.games (code);

alter table public.games enable row level security;
alter table public.hands enable row level security;
