
REVOKE EXECUTE ON FUNCTION public.analyst_workload(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_analyst_online(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pick_analyst_for_ticket(public.department, TEXT[], UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analyst_workload(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_analyst_online(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.pick_analyst_for_ticket(public.department, TEXT[], UUID) TO service_role;
