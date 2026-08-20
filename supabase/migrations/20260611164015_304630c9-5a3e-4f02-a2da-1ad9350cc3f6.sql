
ALTER TABLE public.tickets 
  ADD COLUMN IF NOT EXISTS escalated_by uuid,
  ADD COLUMN IF NOT EXISTS escalation_reason text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS escalation_rejection_reason text;
