import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getGuestTicket } from "@/lib/guest.functions";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { TicketDetail } from "@/components/ticket-detail";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/guest/ticket/$id")({
  component: GuestTicketPage,
});

function GuestTicketPage() {
  const { id } = Route.useParams();
  const { session } = useSession();
  const fn = useServerFn(getGuestTicket);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (session?.kind !== "guest") return;
    setLoading(true);
    setError(null);
    try {
      const r = await fn({ data: { guest_id: session.guest_id, ticket_id: id } });
      setData(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session?.kind === "guest" ? session.guest_id : null]);

  if (loading) return <Card className="p-8 text-center text-sm text-muted-foreground">Loading...</Card>;
  if (error) return <Card className="p-8 text-center text-sm text-destructive">{error}</Card>;
  if (!data) return null;

  return (
    <div>
      <Link to="/guest" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to dashboard
      </Link>
      <TicketDetail
        ticket={data.ticket}
        responses={data.responses}
        chat={data.chat}
        audit={data.audit}
        guest={null}
        submitterStaff={null}
        isStaff={false}
        onChange={load}
      />
    </div>
  );
}
