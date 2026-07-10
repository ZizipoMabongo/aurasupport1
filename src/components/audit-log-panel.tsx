import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listAuditLog } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Link } from "@tanstack/react-router";
import { fmt } from "@/lib/format";
import { AlertTriangle, ScrollText } from "lucide-react";

interface Entry {
  id: string;
  ticket_id: string | null;
  actor_kind: string;
  actor_name: string;
  action: string;
  details: any;
  created_at: string;
}

const ACTIONS = [
  "all",
  "ticket.created",
  "ticket.accepted",
  "ticket.responded",
  "ticket.note_added",
  "ticket.resolved",
  "ticket.rejected",
  "ticket.reassigned",
  "ticket.escalated",
  "ticket.auto_escalated",
  "escalation.rejected",
  "resolution.approval_requested",
  "resolution.approved",
  "resolution.rejected",
  "resolution.auto_approved",
];

export function AuditLogPanel() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [action, setAction] = useState<string>("all");
  const [actor, setActor] = useState<string>("all");
  const [q, setQ] = useState<string>("");
  const load = useServerFn(listAuditLog);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setErr(null);
      try {
        const r = (await load({ data: { action, actor_kind: actor, limit: 200 } })) as Entry[];
        if (!cancelled) setRows(r);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, actor]);

  const filtered = q
    ? rows.filter(
        (r) =>
          r.actor_name.toLowerCase().includes(q.toLowerCase()) ||
          r.action.toLowerCase().includes(q.toLowerCase()) ||
          JSON.stringify(r.details ?? {}).toLowerCase().includes(q.toLowerCase()),
      )
    : rows;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <ScrollText className="h-4 w-4" />
        <h2 className="font-semibold">Audit log</h2>
        <span className="text-xs text-muted-foreground">
          {filtered.length} of {rows.length} entries
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <div>
          <Label className="text-xs">Action</Label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              {ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  {a === "all" ? "All actions" : a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Actor</Label>
          <Select value={actor} onValueChange={setActor}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actors</SelectItem>
              <SelectItem value="guest">Guest</SelectItem>
              <SelectItem value="crew">Crew</SelectItem>
              <SelectItem value="analyst">Analyst</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Search</Label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, action, details…" />
        </div>
      </div>

      {err ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Couldn't load audit log</AlertTitle>
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-10">
          No audit entries match your filters.
        </p>
      ) : (
        <div className="border rounded-md divide-y max-h-[600px] overflow-auto">
          {filtered.map((r) => (
            <div key={r.id} className="p-3 text-sm flex flex-wrap items-start gap-2">
              <Badge variant="outline" className="capitalize shrink-0">{r.actor_kind}</Badge>
              <span className="font-medium">{r.actor_name}</span>
              <span className="font-mono text-xs text-muted-foreground">{r.action}</span>
              {r.ticket_id && (
                <Link
                  to="/staff/ticket/$id"
                  params={{ id: r.ticket_id }}
                  className="text-xs text-primary hover:underline"
                >
                  view ticket
                </Link>
              )}
              {r.details && Object.keys(r.details).length > 0 && (
                <span className="text-xs text-muted-foreground truncate max-w-full sm:max-w-md">
                  {JSON.stringify(r.details)}
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">{fmt(r.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
