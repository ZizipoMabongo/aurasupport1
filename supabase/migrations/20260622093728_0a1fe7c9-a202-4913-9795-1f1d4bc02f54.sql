
DROP POLICY IF EXISTS "Staff can insert ai_decisions" ON public.ai_decisions;
CREATE POLICY "Staff can insert ai_decisions" ON public.ai_decisions FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'crew') OR public.has_role(auth.uid(), 'analyst') OR public.has_role(auth.uid(), 'admin')
);
