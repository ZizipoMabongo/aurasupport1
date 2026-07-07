import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listAllTickets } from "@/lib/tickets.functions";
import { Card } from "@/components/ui/card";
import { SubmitTicketForm } from "@/components/submit-ticket-form";
import { TicketList } from "@/components/ticket-list";
import { ApprovalsPanel } from "@/components/approvals-panel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSession } from "@/hooks/use-session";


export const Route = createFileRoute("/_authenticated/staff/crew")({
  component: CrewDashboard,
});

function CrewDashboard() {
  const [mine, setMine] = useState<any[]>([]);
  const [guestSubs, setGuestSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const list = useServerFn(listAllTickets);
  const { session } = useSession();

  const load = async () => {
    setLoading(true);
    try {
      const rows = (await list({ data: {} })) as any[];
      if (session?.kind === "staff") {
        setMine(rows.filter((t) => t.submitter_user_id === session.user_id && !t.on_behalf_of_guest_id));
        setGuestSubs(rows.filter((t) => t.submitter_user_id === session.user_id && t.on_behalf_of_guest_id));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.kind === "staff" ? session.user_id : null]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <SubmitTicketForm showOnBehalf={true} onSubmitted={load} />
      </div>
      <div className="lg:col-span-2">
        <Tabs defaultValue="mine">
          <TabsList>
            <TabsTrigger value="mine">My Requests</TabsTrigger>
            <TabsTrigger value="guest">Guest Requests</TabsTrigger>
            <TabsTrigger value="approvals">Approvals</TabsTrigger>
          </TabsList>
          <TabsContent value="mine" className="mt-4">
            {loading ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">Loading...</Card>
            ) : (
              <TicketList tickets={mine} basePath="/staff/ticket" empty="No personal requests yet." />
            )}
          </TabsContent>
          <TabsContent value="guest" className="mt-4">
            {loading ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">Loading...</Card>
            ) : (
              <TicketList tickets={guestSubs} basePath="/staff/ticket" empty="No guest requests submitted on behalf." />
            )}
          </TabsContent>
          <TabsContent value="approvals" className="mt-4">
            <ApprovalsPanel />
          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
}
