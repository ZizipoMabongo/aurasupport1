
-- ============ ANALYST PROFILES (skills, department, capacity) ============
CREATE TABLE public.analyst_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  department public.department,
  skill_tags TEXT[] NOT NULL DEFAULT '{}',
  max_concurrent INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analyst_profiles TO authenticated;
GRANT ALL ON public.analyst_profiles TO service_role;
ALTER TABLE public.analyst_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view analyst profiles" ON public.analyst_profiles
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'analyst') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'crew')
  );
CREATE POLICY "Analysts manage own profile" ON public.analyst_profiles
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins manage all analyst profiles" ON public.analyst_profiles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER analyst_profiles_touch BEFORE UPDATE ON public.analyst_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ ANALYST PRESENCE (online/offline heartbeat) ============
CREATE TABLE public.analyst_presence (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online','away','offline'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analyst_presence TO authenticated;
GRANT ALL ON public.analyst_presence TO service_role;
ALTER TABLE public.analyst_presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view presence" ON public.analyst_presence
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'analyst') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'crew')
  );
CREATE POLICY "Users update own presence" ON public.analyst_presence
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ ROUTING RULES (admin CRUD) ============
CREATE TABLE public.routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  department public.department NOT NULL,
  subcategory TEXT,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  required_skills TEXT[] NOT NULL DEFAULT '{}',
  priority_boost public.priority,
  preferred_analyst UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  weight INTEGER NOT NULL DEFAULT 10,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routing_rules TO authenticated;
GRANT ALL ON public.routing_rules TO service_role;
ALTER TABLE public.routing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view routing rules" ON public.routing_rules
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'analyst') OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "Admins manage routing rules" ON public.routing_rules
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX routing_rules_dept_active_idx ON public.routing_rules(department, is_active);
CREATE TRIGGER routing_rules_touch BEFORE UPDATE ON public.routing_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ AUTOMATION EVENTS (routing decisions log) ============
CREATE TABLE public.automation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  matched_rule_id UUID REFERENCES public.routing_rules(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.automation_events TO authenticated;
GRANT ALL ON public.automation_events TO service_role;
ALTER TABLE public.automation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view automation events" ON public.automation_events
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'analyst') OR public.has_role(auth.uid(), 'admin')
  );
CREATE INDEX automation_events_ticket_idx ON public.automation_events(ticket_id);
CREATE INDEX automation_events_created_idx ON public.automation_events(created_at DESC);

-- ============ APPROVAL TASKS ============
CREATE TABLE public.approval_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reason TEXT,
  decision_reason TEXT,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_tasks TO authenticated;
GRANT ALL ON public.approval_tasks TO service_role;
ALTER TABLE public.approval_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage approval tasks" ON public.approval_tasks
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Assignees view their tasks" ON public.approval_tasks
  FOR SELECT TO authenticated USING (assigned_to = auth.uid() OR requested_by = auth.uid());
CREATE INDEX approval_tasks_status_idx ON public.approval_tasks(status);
CREATE TRIGGER approval_tasks_touch BEFORE UPDATE ON public.approval_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ TICKETS: queueing columns ============
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS routing_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_routed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS tickets_queued_idx ON public.tickets(queued_at) WHERE queued_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS tickets_assigned_status_idx ON public.tickets(assigned_to, status);
CREATE INDEX IF NOT EXISTS tickets_department_status_idx ON public.tickets(department, status);

-- ============ HELPER FUNCTIONS ============
-- Analyst current active workload
CREATE OR REPLACE FUNCTION public.analyst_workload(_user_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::INTEGER FROM public.tickets
  WHERE assigned_to = _user_id AND status IN ('New','In Progress','Needs Review');
$$;

-- Is analyst online (heartbeat within 3 minutes)
CREATE OR REPLACE FUNCTION public.is_analyst_online(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.analyst_presence
    WHERE user_id = _user_id
      AND status = 'online'
      AND last_seen_at > now() - INTERVAL '3 minutes'
  );
$$;

-- Pick best analyst for a ticket: match dept, prefer online + skill overlap + lowest workload
CREATE OR REPLACE FUNCTION public.pick_analyst_for_ticket(
  _department public.department,
  _required_skills TEXT[],
  _preferred UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  chosen UUID;
BEGIN
  -- If preferred is available and under capacity, pick them
  IF _preferred IS NOT NULL THEN
    SELECT ap.user_id INTO chosen
    FROM public.analyst_profiles ap
    WHERE ap.user_id = _preferred
      AND public.analyst_workload(ap.user_id) < ap.max_concurrent
      AND public.is_analyst_online(ap.user_id)
    LIMIT 1;
    IF chosen IS NOT NULL THEN RETURN chosen; END IF;
  END IF;

  -- Score: online + skill overlap - workload
  SELECT ap.user_id INTO chosen
  FROM public.analyst_profiles ap
  JOIN public.user_roles ur ON ur.user_id = ap.user_id AND ur.role = 'analyst'
  WHERE (ap.department = _department OR ap.department IS NULL)
    AND public.analyst_workload(ap.user_id) < ap.max_concurrent
  ORDER BY
    public.is_analyst_online(ap.user_id) DESC,
    CASE WHEN _required_skills IS NULL OR array_length(_required_skills,1) IS NULL THEN 0
         ELSE cardinality(ARRAY(SELECT unnest(ap.skill_tags) INTERSECT SELECT unnest(_required_skills)))
    END DESC,
    public.analyst_workload(ap.user_id) ASC,
    random()
  LIMIT 1;

  RETURN chosen;
END $$;
