-- Explicitly document default-deny client access for the private rate-limit store.
create policy "No client access to API rate limits"
  on public.api_rate_limits
  for all
  to public, anon, authenticated
  using (false)
  with check (false);
