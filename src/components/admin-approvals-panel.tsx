import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { listAllApprovals } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, ClipboardCheck } from "lucide-react";
import { rel } from "@/lib/format";

interface Row {
  id: string;
  ticket_id: string | null;
  status: string;
  task_type: string;
  reason: string | null;
  decision_reason: string | null;
  created_at: string;
  assigned_to_name: string | null;
  requested_by_name: string | null;
  tickets: {
    id: string;
    ticket_number: string;
    department: string | null;
    subcategory: string | null;
    description: string;
    status: string;
  } | null;
}

export function AdminApprovalsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const load = useServerFn(listAllApprovals);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const r = (await load({ data: undefined as never })) as Row[];
        if (!cancelled) setRows(r);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    const iv = setInterval(run, 30_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pending = rows.filter((r) => r.status === "pending");
  const past = rows.filter((r) => r.status !== "pending");

  if (err) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Couldn't load approvals</AlertTitle>
        <AlertDescription>{err}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Pending approvals</h2>
          <Badge variant="outline">{pending.length}</Badge>
        </div>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : pending.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No approvals awaiting decision.
          </p>
        ) : (
          <div className="space-y-2">
            {pending.map((r) => (
              <div key={r.id} className="border rounded-md p-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-muted-foreground">{r.tickets?.ticket_number}</span>
                    <span className="text-xs">
                      {r.tickets?.department} · {r.tickets?.subcategory}
                    </span>
                  </div>
                  <p className="text-sm mt-1 line-clamp-2 text-muted-foreground">{r.tickets?.description}</p>
                  <p className="text-xs mt-1 text-muted-foreground">
                    Requested by {r.requested_by_name ?? "—"} → awaiting {r.assigned_to_name ?? "—"} · {rel(r.created_at)}
                  </p>
                </div>
                {r.ticket_id && (
                  <Link
                    to="/staff/ticket/$id"
                    params={{ id: r.ticket_id }}
                    className="text-xs text-primary hover:underline shrink-0 self-center"
                  >
                    Open →
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {past.length > 0 && (
        <Card className="p-4">
          <h2 className="font-semibold mb-3 text-sm">Recent decisions</h2>
          <div className="space-y-2 max-h-96 overflow-auto">
            {past.slice(0, 50).map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-muted-foreground">{r.tickets?.ticket_number}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.requested_by_name ?? "—"} → {r.assigned_to_name ?? "—"} · {rel(r.created_at)}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    r.status === "approved"
                      ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                      : "border-destructive/40 text-destructive"
                  }
                >
                  {r.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
