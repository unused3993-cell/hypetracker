-- Daily Discovery — Phase 1 schema.
-- Run once in the Supabase SQL editor (or `supabase db push` if you use the CLI).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Interests: the weighted interest profile topics are drawn from.
-- Weights are relative; the pipeline normalizes them. History ≈ 50% initially.
-- ---------------------------------------------------------------------------
create table if not exists public.interests (
  id          uuid primary key default gen_random_uuid(),
  category    text not null,
  subcategory text not null,
  weight      numeric not null check (weight >= 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (category, subcategory)
);

-- ---------------------------------------------------------------------------
-- Discoveries: one generated article (or a failed attempt, kept for debugging).
-- ---------------------------------------------------------------------------
create table if not exists public.discoveries (
  id                   uuid primary key default gen_random_uuid(),
  title                text,
  subtitle             text,
  category             text,
  subcategory          text,
  content_type         text check (content_type in ('story', 'explanation')),
  topic                text,          -- the selected topic statement (used for de-duplication)
  content              jsonb,         -- { introduction: string[], sections: [{ heading, paragraphs[], source_ids[] }] }
  word_count           integer,
  reading_time_minutes integer,
  sources              jsonb not null default '[]'::jsonb,   -- [{ id, title, url, link_status }]
  related_topics       jsonb not null default '[]'::jsonb,   -- string[]
  validation           jsonb,         -- automated check results + claim review (NOT a fact-check)
  generation_log       jsonb not null default '[]'::jsonb,   -- step-by-step pipeline log
  generation_status    text not null default 'generating'
                       check (generation_status in ('generating', 'ready', 'needs_review', 'failed')),
  error                text,
  created_at           timestamptz not null default now(),
  published_at         timestamptz
);

create index if not exists discoveries_created_at_idx on public.discoveries (created_at desc);
create index if not exists discoveries_status_idx on public.discoveries (generation_status);

-- The app talks to Supabase only from the server with the service-role/secret key,
-- which bypasses RLS. Enabling RLS with no policies keeps the anon key locked out.
alter table public.interests   enable row level security;
alter table public.discoveries enable row level security;

-- ---------------------------------------------------------------------------
-- Seed: initial interest profile (weights sum to 100; History = 50).
-- ---------------------------------------------------------------------------
insert into public.interests (category, subcategory, weight) values
  ('History', 'Ancient civilizations', 8),
  ('History', 'Military history', 7),
  ('History', 'Japanese history (especially Tokugawa and Meiji periods)', 7),
  ('History', 'Chinese and broader Asian history', 7),
  ('History', 'Medieval Europe', 6),
  ('History', 'Unusual, obscure, and forgotten historical events', 6),
  ('History', 'Archaeology', 5),
  ('History', 'Political and cultural transformations', 4),
  ('Science & Nature', 'Physics', 4),
  ('Science & Nature', 'Astronomy', 4),
  ('Science & Nature', 'Biology', 3),
  ('Science & Nature', 'Evolution', 3),
  ('Science & Nature', 'Neuroscience', 3),
  ('Science & Nature', 'Natural phenomena', 3),
  ('Technology & Engineering', 'How machines work', 4),
  ('Technology & Engineering', 'Historical inventions', 3),
  ('Technology & Engineering', 'Mechanical engineering', 3),
  ('Technology & Engineering', 'Scientific discoveries', 3),
  ('Technology & Engineering', 'Unusual technologies', 2),
  ('Art & Material Culture', 'Architecture', 3),
  ('Art & Material Culture', 'Art history', 3),
  ('Art & Material Culture', 'Horology', 3),
  ('Art & Material Culture', 'Gemology', 3),
  ('Art & Material Culture', 'Traditional craftsmanship', 3)
on conflict (category, subcategory) do nothing;
