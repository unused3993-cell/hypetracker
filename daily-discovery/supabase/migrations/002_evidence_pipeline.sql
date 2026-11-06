-- Evidence-grounded pipeline: evidence ledger, verification, cost tracking, editorial review.
-- Run after schema.sql on an existing project. Safe to re-run.

alter table public.discoveries add column if not exists evidence     jsonb;        -- sources (with retrieved text), passages, claims, conflicts
alter table public.discoveries add column if not exists usage        jsonb;        -- per-stage token usage and estimated cost
alter table public.discoveries add column if not exists review_note  text;
alter table public.discoveries add column if not exists reviewed_at  timestamptz;

-- New lifecycle: the pipeline ends at verified / needs_review / failed; an editor approves or rejects.
alter table public.discoveries drop constraint if exists discoveries_generation_status_check;
update public.discoveries set generation_status = 'verified' where generation_status = 'ready';
alter table public.discoveries add constraint discoveries_generation_status_check
  check (generation_status in ('generating', 'verified', 'needs_review', 'failed', 'approved', 'rejected'));
