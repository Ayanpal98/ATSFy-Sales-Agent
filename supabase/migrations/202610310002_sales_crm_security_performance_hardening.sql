create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop policy if exists "ATSFy admins manage leads" on public.leads;
drop policy if exists "ATSFy admins manage conversations" on public.conversations;
drop policy if exists "ATSFy admins manage activities" on public.lead_activities;
drop policy if exists "ATSFy admins manage followups" on public.followup_tasks;
drop policy if exists "ATSFy admins manage proposals" on public.proposals;
drop policy if exists "ATSFy admins manage insights" on public.agent_insights;
drop policy if exists "ATSFy admins manage runs" on public.agent_runs;

create policy "ATSFy admins manage leads" on public.leads for all to authenticated
using (((select auth.jwt())->'app_metadata'->>'role') = 'admin')
with check (((select auth.jwt())->'app_metadata'->>'role') = 'admin');
create policy "ATSFy admins manage conversations" on public.conversations for all to authenticated
using (((select auth.jwt())->'app_metadata'->>'role') = 'admin')
with check (((select auth.jwt())->'app_metadata'->>'role') = 'admin');
create policy "ATSFy admins manage activities" on public.lead_activities for all to authenticated
using (((select auth.jwt())->'app_metadata'->>'role') = 'admin')
with check (((select auth.jwt())->'app_metadata'->>'role') = 'admin');
create policy "ATSFy admins manage followups" on public.followup_tasks for all to authenticated
using (((select auth.jwt())->'app_metadata'->>'role') = 'admin')
with check (((select auth.jwt())->'app_metadata'->>'role') = 'admin');
create policy "ATSFy admins manage proposals" on public.proposals for all to authenticated
using (((select auth.jwt())->'app_metadata'->>'role') = 'admin')
with check (((select auth.jwt())->'app_metadata'->>'role') = 'admin');
create policy "ATSFy admins manage insights" on public.agent_insights for all to authenticated
using (((select auth.jwt())->'app_metadata'->>'role') = 'admin')
with check (((select auth.jwt())->'app_metadata'->>'role') = 'admin');
create policy "ATSFy admins manage runs" on public.agent_runs for all to authenticated
using (((select auth.jwt())->'app_metadata'->>'role') = 'admin')
with check (((select auth.jwt())->'app_metadata'->>'role') = 'admin');

create index if not exists conversations_lead_id_idx on public.conversations(lead_id);
create index if not exists lead_activities_lead_id_idx on public.lead_activities(lead_id);
create index if not exists lead_activities_actor_id_idx on public.lead_activities(actor_id);
create index if not exists followup_tasks_lead_id_idx on public.followup_tasks(lead_id);
create index if not exists followup_tasks_approved_by_idx on public.followup_tasks(approved_by);
create index if not exists proposals_lead_id_idx on public.proposals(lead_id);
create index if not exists proposals_approved_by_idx on public.proposals(approved_by);
create index if not exists agent_insights_reviewed_by_idx on public.agent_insights(reviewed_by);
create index if not exists leads_assigned_to_idx on public.leads(assigned_to);
