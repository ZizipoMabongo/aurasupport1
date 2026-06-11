import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getStaffTicket } from "@/lib/tickets.functions";
import { Card } from "@/components/ui/card";
import { TicketDetail } from "@/components/ticket-detail";
import { ArrowLeft } from "lucide-react";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/staff/ticket/$id")({
  component: StaffTicketPage,
});

function StaffTicketPage() {
  const { id } = Route.useParams();
  const fn = useServerFn(getStaffTicket);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { session } = useSession();
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fn({ data: { ticket_id: id } });
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
  }, [id]);

  const backTo =
    session?.kind === "staff"
      ? session.role === "admin"
        ? "/staff/admin"
        : session.role === "analyst"
          ? "/staff/analyst"
          : "/staff/crew"
      : "/";

  if (loading) return <Card className="p-8 text-center text-sm text-muted-foreground">Loading...</Card>;
  if (error) return <Card className="p-8 text-center text-sm text-destructive">{error}</Card>;
  if (!data) return null;

  return (
    <div>
      <button onClick={() => navigate({ to: backTo })} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </button>
      <TicketDetail
        ticket={data.ticket}
        responses={data.responses}
        chat={data.chat}
        audit={data.audit}
        guest={data.guest}
        submitterStaff={data.submitterStaff}
        isStaff={true}
        onChange={load}
      />
    </div>
  );
}
