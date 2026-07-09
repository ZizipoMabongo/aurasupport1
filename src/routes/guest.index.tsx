import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listGuestTickets } from "@/lib/guest.functions";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { SubmitTicketForm } from "@/components/submit-ticket-form";
import { TicketList } from "@/components/ticket-list";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/guest/")({
  component: GuestDashboard,
});

function GuestDashboard() {
  const { session } = useSession();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const list = useServerFn(listGuestTickets);

  const load = async () => {
    if (session?.kind !== "guest") return;
    setLoading(true);
    try {
      const rows = await list({ data: { guest_id: session.guest_id } });
      setTickets(rows as any[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.kind === "guest" ? session.guest_id : null]);

  // Realtime: refresh the list when any of this guest's tickets change.
  useEffect(() => {
    if (session?.kind !== "guest") return;
    const gid = session.guest_id;
    const ch = supabase
      .channel(`guest-tickets-${gid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets", filter: `submitter_guest_id=eq.${gid}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets", filter: `on_behalf_of_guest_id=eq.${gid}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.kind === "guest" ? session.guest_id : null]);


  if (session?.kind !== "guest") return null;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-1 space-y-4">
        <Card className="p-5 glass-card">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Your stay
          </h2>
          <div className="space-y-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Guest</p>
              <p className="font-medium">{session.full_name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Guest ID</p>
              <p className="font-mono">{session.guest_id}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cabin</p>
              <p>{session.cabin_number}</p>
            </div>
          </div>
        </Card>
        <SubmitTicketForm showOnBehalf={false} onSubmitted={load} recentTickets={tickets} />
      </div>
      <div className="lg:col-span-2">
        <h2 className="text-lg font-semibold tracking-tight mb-3">Recent tickets</h2>
        {loading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Loading...</Card>
        ) : (
          <TicketList tickets={tickets} basePath="/guest/ticket" empty="You haven't submitted any requests yet." />
        )}
      </div>
    </div>
  );
}
