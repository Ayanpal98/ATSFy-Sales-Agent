create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  item_kind text not null check (item_kind in ('service','product')),
  item_key text not null,
  offer_tier text not null,
  list_price numeric(12,2) not null check (list_price > 0),
  minimum_sell_price numeric(12,2) not null check (minimum_sell_price > 0 and minimum_sell_price <= list_price),
  delivery_cost numeric(12,2),
  market_floor_price numeric(12,2),
  market_evidence_url text,
  minimum_margin_percent numeric(5,2),
  max_discount_percent numeric(5,2) not null default 0 check (max_discount_percent between 0 and 50),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(item_kind,item_key,offer_tier),
  check (delivery_cost is null or delivery_cost > 0),
  check (market_floor_price is null or market_floor_price > 0),
  check (minimum_margin_percent is null or minimum_margin_percent between 0 and 79.99)
);

create table if not exists public.pricing_rule_events (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references public.pricing_rules(id) on delete set null,
  item_kind text not null,
  item_key text not null,
  offer_tier text not null,
  action text not null check (action in ('created','updated')),
  previous_values jsonb,
  new_values jsonb not null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.pricing_rules enable row level security;
alter table public.pricing_rule_events enable row level security;
revoke all on public.pricing_rules, public.pricing_rule_events from anon, authenticated;
grant select, insert, update on public.pricing_rules to authenticated;
grant select, insert on public.pricing_rule_events to authenticated;
create policy "ATSFy admins read pricing rules" on public.pricing_rules for select to authenticated
  using ((select auth.jwt()->'app_metadata'->>'role') in ('admin','founder'));
create policy "ATSFy admins manage pricing rules" on public.pricing_rules for all to authenticated
  using ((select auth.jwt()->'app_metadata'->>'role') in ('admin','founder'))
  with check ((select auth.jwt()->'app_metadata'->>'role') in ('admin','founder'));
create policy "ATSFy admins read pricing audit" on public.pricing_rule_events for select to authenticated
  using ((select auth.jwt()->'app_metadata'->>'role') in ('admin','founder'));
create policy "ATSFy admins write pricing audit" on public.pricing_rule_events for insert to authenticated
  with check ((select auth.jwt()->'app_metadata'->>'role') in ('admin','founder'));
revoke all on function public.set_updated_at() from public, anon, authenticated;
create or replace function public.set_pricing_rule_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists pricing_rules_set_updated_at on public.pricing_rules;
create trigger pricing_rules_set_updated_at before update on public.pricing_rules
for each row execute function public.set_pricing_rule_updated_at();
revoke all on function public.set_pricing_rule_updated_at() from public, anon, authenticated;
