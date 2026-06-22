
-- Phase 11: predictions
CREATE TABLE public.predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_by_name TEXT,
  horizon_days INT NOT NULL DEFAULT 7,
  history_days INT NOT NULL DEFAULT 30,
  total_history INT NOT NULL DEFAULT 0,
  forecast JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
  sla_risk JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.predictions TO authenticated;
GRANT ALL ON public.predictions TO service_role;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view predictions" ON public.predictions FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'analyst') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'crew')
);
CREATE POLICY "Analyst/Admin can insert predictions" ON public.predictions FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'analyst') OR public.has_role(auth.uid(), 'admin')
);

-- Phase 12: AI decisions
CREATE TABLE public.ai_decisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decision_type TEXT NOT NULL,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  prediction_id UUID REFERENCES public.predictions(id) ON DELETE SET NULL,
  model TEXT,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
  input_summary TEXT,
  output_summary TEXT,
  explanation TEXT,
  flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  needs_review BOOLEAN NOT NULL DEFAULT false,
  review_status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by_name TEXT,
  reviewer_comment TEXT,
  reviewed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_decisions TO authenticated;
GRANT ALL ON public.ai_decisions TO service_role;
ALTER TABLE public.ai_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view ai_decisions" ON public.ai_decisions FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'analyst') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'crew')
);
CREATE POLICY "Staff can insert ai_decisions" ON public.ai_decisions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Analyst/Admin can update ai_decisions" ON public.ai_decisions FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'analyst') OR public.has_role(auth.uid(), 'admin')
);

CREATE INDEX idx_ai_decisions_needs_review ON public.ai_decisions(needs_review, review_status);
CREATE INDEX idx_ai_decisions_created_at ON public.ai_decisions(created_at DESC);
