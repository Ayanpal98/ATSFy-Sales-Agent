create extension if not exists pgcrypto;
create table if not exists public.leads (
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), name text not null, email text, phone text,
 company text, industry text, city text, service_interest text[] not null default '{}',
 need text, budget_range text, timeline text, source text not null default 'website_chat',
 source_url text, consent_to_contact boolean not null default false, consent_at timestamptz,
 status text not null default 'new' check (status in ('new','contacted','qualified','proposal','negotiation','won','lost','not_interested')),
 lead_score integer not null default 0 check (lead_score between 0 and 100),
 assigned_to uuid references auth.users(id) on delete set null, last_contact_at timestamptz,
 next_follow_up_at timestamptz, notes text, lost_reason text,
 constraint leads_contact_method check (email is not null or phone is not null)
);
create index if not exists leads_created_at_idx on public.leads(created_at desc);
create index if not exists leads_status_created_idx on public.leads(status,created_at desc);
create table if not exists public.conversations (
 id uuid primary key default gen_random_uuid(), lead_id uuid references public.leads(id) on delete set null,
 session_id text, channel text not null default 'website_chat', summary text,
 transcript jsonb not null default '[]'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.lead_activities (
 id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.leads(id) on delete cascade,
 activity_type text not null check (activity_type in ('note','call','email','whatsapp','meeting','stage_change','proposal','system')),
 direction text check (direction in ('inbound','outbound')), content text not null, outcome text,
 actor_id uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
create table if not exists public.followup_tasks (
 id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.leads(id) on delete cascade,
 due_at timestamptz not null, channel text not null default 'whatsapp' check (channel in ('whatsapp','email','call','internal')),
 message_draft text, status text not null default 'pending' check (status in ('pending','approved','sent','cancelled')),
 approved_by uuid references auth.users(id) on delete set null, approved_at timestamptz, sent_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.proposals (
 id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.leads(id) on delete cascade,
 title text not null, scope jsonb not null default '{}'::jsonb, price_min numeric(12,2), price_max numeric(12,2),
 currency text not null default 'INR',
 status text not null default 'draft' check (status in ('draft','pending_approval','approved','sent','accepted','rejected')),
 approved_by uuid references auth.users(id) on delete set null, approved_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.agent_insights (
 id uuid primary key default gen_random_uuid(), insight_type text not null, segment text,
 observation text not null, evidence_count integer not null default 0,
 confidence numeric(4,3) not null default 0 check (confidence between 0 and 1),
 status text not null default 'proposed' check (status in ('proposed','approved','rejected')),
 reviewed_by uuid references auth.users(id) on delete set null, reviewed_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.agent_runs (
 id uuid primary key default gen_random_uuid(), run_type text not null,
 status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
 input_summary text, output_summary text, error_code text, started_at timestamptz, finished_at timestamptz,
 created_at timestamptz not null default now()
);
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at before update on public.leads for each row execute function public.set_updated_at();
alter table public.leads enable row level security;
alter table public.conversations enable row level security;
alter table public.lead_activities enable row level security;
alter table public.followup_tasks enable row level security;
alter table public.proposals enable row level security;
alter table public.agent_insights enable row level security;
alter table public.agent_runs enable row level security;
revoke all on public.leads, public.conversations, public.lead_activities, public.followup_tasks, public.proposals, public.agent_insights, public.agent_runs from anon;
grant select,insert,update,delete on public.leads, public.conversations, public.lead_activities, public.followup_tasks, public.proposals, public.agent_insights, public.agent_runs to authenticated;
create policy "ATSFy admins manage leads" on public.leads for all to authenticated using ((select auth.jwt()->'app_metadata'->>'role')='admin') with check ((select auth.jwt()->'app_metadata'->>'role')='admin');
create policy "ATSFy admins manage conversations" on public.conversations for all to authenticated using ((select auth.jwt()->'app_metadata'->>'role')='admin') with check ((select auth.jwt()->'app_metadata'->>'role')='admin');
create policy "ATSFy admins manage activities" on public.lead_activities for all to authenticated using ((select auth.jwt()->'app_metadata'->>'role')='admin') with check ((select auth.jwt()->'app_metadata'->>'role')='admin');
create policy "ATSFy admins manage followups" on public.followup_tasks for all to authenticated using ((select auth.jwt()->'app_metadata'->>'role')='admin') with check ((select auth.jwt()->'app_metadata'->>'role')='admin');
create policy "ATSFy admins manage proposals" on public.proposals for all to authenticated using ((select auth.jwt()->'app_metadata'->>'role')='admin') with check ((select auth.jwt()->'app_metadata'->>'role')='admin');
create policy "ATSFy admins manage insights" on public.agent_insights for all to authenticated using ((select auth.jwt()->'app_metadata'->>'role')='admin') with check ((select auth.jwt()->'app_metadata'->>'role')='admin');
create policy "ATSFy admins manage runs" on public.agent_runs for all to authenticated using ((select auth.jwt()->'app_metadata'->>'role')='admin') with check ((select auth.jwt()->'app_metadata'->>'role')='admin');
revoke all on function public.set_updated_at() from public, anon, authenticated;
