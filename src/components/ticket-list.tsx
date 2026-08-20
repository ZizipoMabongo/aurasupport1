import { Link } from "@tanstack/react-router";
import { fmt, priorityClasses, statusClasses } from "@/lib/format";
import { Card } from "@/components/ui/card";

interface TicketRow {
  id: string;
  ticket_number: string;
  description: string;
  department: string | null;
  priority: string | null;
  status: string;
  created_at: string;
  effective_role: string;
}

export function TicketList({
  tickets,
  basePath,
  empty,
}: {
  tickets: TicketRow[];
  basePath: string; // e.g. "/guest/ticket" or "/staff/ticket"
  empty?: string;
}) {
  if (tickets.length === 0) {
    return (
      <Card className="p-10 text-center text-muted-foreground">
        {empty ?? "No tickets to show yet."}
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {tickets.map((t) => (
        <Link
          key={t.id}
          to={basePath === "/guest/ticket" ? "/guest/ticket/$id" : "/staff/ticket/$id"}
          params={{ id: t.id }}
          className="block"
        >
          <Card className="p-4 transition hover:shadow-md hover:border-primary/40">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-muted-foreground">{t.ticket_number}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${statusClasses(t.status)}`}>{t.status}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${priorityClasses(t.priority)}`}>
                    {t.priority ?? "—"}
                  </span>
                  {t.department ? (
                    <span className="text-xs px-2 py-0.5 rounded-full border bg-secondary text-secondary-foreground">{t.department}</span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm line-clamp-2">{t.description}</p>
              </div>
              <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
                {fmt(t.created_at)}
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
