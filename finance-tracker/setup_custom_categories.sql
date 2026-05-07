-- Migration: create custom_categories table
-- Run this once in your Supabase SQL editor.

create table if not exists public.custom_categories (
  id           text        primary key,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  label        text        not null,
  emoji        text        not null default '📦',
  color        text        not null default '#60A5FA',
  type         text        not null check (type in ('CR', 'DR')),
  created_at   timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.custom_categories enable row level security;

-- Users can only access their own categories
create policy "Users can manage their own custom categories"
  on public.custom_categories
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for fast per-user queries
create index if not exists idx_custom_categories_user
  on public.custom_categories (user_id);
