
-- AI classification correction log (for training data + audit)
CREATE TABLE public.ai_classification_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  corrected_by UUID NOT NULL,
  corrected_by_name TEXT NOT NULL,
  original_department TEXT,
  original_subcategory TEXT,
  original_priority TEXT,
  original_confidence NUMERIC,
  new_department TEXT NOT NULL,
  new_subcategory TEXT NOT NULL,
  new_priority TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.ai_classification_corrections TO authenticated;
GRANT ALL ON public.ai_classification_corrections TO service_role;

ALTER TABLE public.ai_classification_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view corrections"
  ON public.ai_classification_corrections FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'analyst')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'crew')
  );

CREATE POLICY "Staff can insert corrections"
  ON public.ai_classification_corrections FOR INSERT TO authenticated
  WITH CHECK (
    corrected_by = auth.uid()
    AND (public.has_role(auth.uid(), 'analyst') OR public.has_role(auth.uid(), 'admin'))
  );

CREATE INDEX idx_ai_corrections_ticket ON public.ai_classification_corrections(ticket_id);
CREATE INDEX idx_tickets_confidence ON public.tickets(confidence) WHERE ai_classified = true AND status IN ('New','Needs Review','In Progress');
CREATE INDEX idx_tickets_dept_subcat ON public.tickets(department, subcategory);
