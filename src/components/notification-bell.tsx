import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { listMyNotifications, markNotificationRead } from "@/lib/notifications.functions";
import { useSession } from "@/hooks/use-session";
import { rel } from "@/lib/format";

interface Notif {
  id: string;
  type: string;
  message: string;
  ticket_id: string | null;
  read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const { session } = useSession();
  const [items, setItems] = useState<Notif[]>([]);
  const list = useServerFn(listMyNotifications);
  const mark = useServerFn(markNotificationRead);

  const load = async () => {
    if (session?.kind !== "staff") return;
    try {
      const data = await list({ data: undefined as never });
      setItems(data as Notif[]);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    load();
    if (session?.kind !== "staff") return;
    const ch = supabase
      .channel(`notif-${session.user_id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${session.user_id}` },
        (payload) => {
          const n = payload.new as { message: string; ticket_id: string | null };
          toast(n.message, {
            action: n.ticket_id
              ? { label: "Open", onClick: () => { window.location.href = `/staff/ticket/${n.ticket_id}`; } }
              : undefined,
          });
          load();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.kind === "staff" ? session.user_id : null]);

  const unread = items.filter((i) => !i.read).length;

  const handleMarkAll = async () => {
    await mark({ data: { all: true } });
    await load();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 ? (
            <button className="text-xs text-primary hover:underline" onClick={handleMarkAll}>
              Mark all as read
            </button>
          ) : null}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No notifications yet</div>
          ) : (
            items.map((n) =>
              n.ticket_id ? (
                <Link
                  key={n.id}
                  to="/staff/ticket/$id"
                  params={{ id: n.ticket_id }}
                  onClick={() => mark({ data: { id: n.id } }).then(load)}
                  className={`block border-b px-3 py-2 text-sm hover:bg-accent ${n.read ? "" : "bg-primary/5"}`}
                >
                  <p className="font-medium">{n.message}</p>
                  <p className="text-xs text-muted-foreground">{rel(n.created_at)}</p>
                </Link>
              ) : (
                <div key={n.id} className={`border-b px-3 py-2 text-sm ${n.read ? "" : "bg-primary/5"}`}>
                  <p className="font-medium">{n.message}</p>
                  <p className="text-xs text-muted-foreground">{rel(n.created_at)}</p>
                </div>
              ),
            )

          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
