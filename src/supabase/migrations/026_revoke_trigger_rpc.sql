-- 026: the two trigger functions are not an API.
--
-- record_history() (025) and record_deletion() (022) are security definer
-- trigger functions in the public schema, so PostgREST exposed them at
-- /rest/v1/rpc/... to anyone, signed in or not. Called that way they only
-- fail ("trigger functions can only be called as triggers"), but the advisor
-- is right that nothing should be able to try. Triggers do not check EXECUTE
-- when they fire, so revoking it changes nothing about what they record.

revoke execute on function public.record_history() from public, anon, authenticated;
revoke execute on function public.record_deletion() from public, anon, authenticated;
