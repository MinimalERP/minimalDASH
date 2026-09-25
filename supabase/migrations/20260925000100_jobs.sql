-- Jobs, the parts (drawings) in them, and their timeline. One owner: every row belongs to the signed-in person who made it,
-- and nobody else can see or change it. Drawings and mail bodies are never stored here; only their Drive / Gmail links.

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  customer text not null default '',
  contact text not null default '',
  asked text not null default '',                 -- what the customer wants right now, in one line
  whose_move text not null default 'us' check (whose_move in ('us', 'customer', 'vendor')),
  move_since date not null default current_date,
  due_date date,
  status text not null default 'open' check (status in ('open', 'won', 'lost', 'closed')),
  drive_folder_url text,
  gmail_thread_id text,
  created_at timestamptz not null default now()
);

create table public.parts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  drawing_no text not null default '',
  name text not null default '',
  rev text not null default '',
  material text not null default '',
  finish text not null default '',
  next_assy text not null default '',
  qty text not null default '',
  drive_file_url text,
  created_at timestamptz not null default now()
);

create table public.job_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  at timestamptz not null default now(),
  who text not null check (who in ('customer', 'us', 'vendor', 'note')),
  summary text not null check (length(summary) between 1 and 2000),
  gmail_link text,
  files text[] not null default '{}'
);

create index parts_job on public.parts (job_id);
create index job_events_job on public.job_events (job_id, at);
create unique index jobs_thread on public.jobs (owner_id, gmail_thread_id) where gmail_thread_id is not null;

alter table public.jobs enable row level security;
alter table public.parts enable row level security;
alter table public.job_events enable row level security;

revoke all on public.jobs, public.parts, public.job_events from anon, authenticated;
grant select, insert, update, delete on public.jobs, public.parts, public.job_events to authenticated;

create policy jobs_own on public.jobs for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy parts_own on public.parts for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid()
    and exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()));
create policy job_events_own on public.job_events for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid()
    and exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()));
