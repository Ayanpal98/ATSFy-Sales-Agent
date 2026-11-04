-- Shared atomic rate limits for public endpoints. No customer records are modified.
create table if not exists public.api_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  hit_count integer not null check (hit_count >= 0),
  updated_at timestamptz not null default now()
);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public, anon, authenticated;
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed boolean;
  v_now timestamptz := now();
begin
  if p_key is null or length(p_key) < 16 or p_limit < 1 or p_window_seconds < 1 then
    return false;
  end if;
  insert into public.api_rate_limits(bucket_key, window_started_at, hit_count, updated_at)
  values (p_key, v_now, 1, v_now)
  on conflict (bucket_key) do update
    set window_started_at = case
          when public.api_rate_limits.window_started_at <= v_now - make_interval(secs => p_window_seconds) then v_now
          else public.api_rate_limits.window_started_at end,
        hit_count = case
          when public.api_rate_limits.window_started_at <= v_now - make_interval(secs => p_window_seconds) then 1
          else public.api_rate_limits.hit_count + 1 end,
        updated_at = v_now
  returning hit_count <= p_limit into v_allowed;
  return coalesce(v_allowed, false);
end;
$$;
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
