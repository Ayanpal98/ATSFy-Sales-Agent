-- WhatsApp Cloud API / Coexistence foundation for ATSFy Sales Agent.
-- Apply manually to the dedicated atsfy-sales-agent Supabase project after reviewing.
alter table public.leads
  add column if not exists whatsapp_opt_in boolean not null default false,
  add column if not exists whatsapp_opt_in_at timestamptz,
  add column if not exists whatsapp_last_inbound_at timestamptz;

create table if not exists public.whatsapp_message_events (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null unique,
  lead_id uuid references public.leads(id) on delete set null,
  direction text not null check (direction in ('inbound','outbound')),
  from_number text,
  message_body text,
  provider_status text,
  created_at timestamptz not null default now()
);

alter table public.whatsapp_message_events enable row level security;
grant select on public.whatsapp_message_events to authenticated;

drop policy if exists "Admins can read WhatsApp message events" on public.whatsapp_message_events;
create policy "Admins can read WhatsApp message events"
  on public.whatsapp_message_events for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

comment on column public.leads.whatsapp_opt_in is 'Explicit optional consent for ATSFy to send WhatsApp updates about this enquiry.';
comment on column public.leads.whatsapp_last_inbound_at is 'Most recent inbound WhatsApp message timestamp; used to enforce the customer-service window.';
