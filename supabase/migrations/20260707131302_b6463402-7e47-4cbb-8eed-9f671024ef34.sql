
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS approval_tasks_pending_created_idx
  ON public.approval_tasks (created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE read = false;
