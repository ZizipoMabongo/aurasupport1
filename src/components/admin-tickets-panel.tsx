import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { listAllTickets } from "@/lib/tickets.functions";
import { batchTicketAction } from "@/lib/admin.functions";
import { listAnalysts } from "@/lib/routing.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle2, XCircle, UserCog, RefreshCw } from "lucide-react";
import { fmt, priorityClasses, statusClasses } from "@/lib/format";

interface T {
  id: string;
  ticket_number: string;
  description: string;
  department: string | null;
  priority: string | null;
  status: string;
  effective_role: string;
  created_at: string;
  assigned_to: string | null;
  escalated_to: string | null;
}

interface Analyst {
  id: string;
  full_name: string;
  online: boolean;
  department: string | null;
}

const DEPTS = ["all", "IT", "HR", "Finance", "Operations"];
const PRIOS = ["all", "Urgent", "High", "Medium", "Low"];
const STATUSES = ["all", "New", "In Progress", "Needs Review", "Escalated", "Resolved", "Rejected"];

export function AdminTicketsPanel({
  initialScope = "all",
}: {
  initialScope?: "all" | "escalated";
}) {
  const [tickets, setTickets] = useState<T[]>([]);
  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [dept, setDept] = useState("all");
  const [prio, setPrio] = useState("all");
  const [status, setStatus] = useState(initialScope === "escalated" ? "Escalated" : "all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTo, setReassignTo] = useState<string>("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  const listT = useServerFn(listAllTickets);
  const listA = useServerFn(listAnalysts);
  const batch = useServerFn(batchTicketAction);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [t, a] = await Promise.all([
        listT({ data: {} }),
        listA({ data: undefined as never }),
      ]);
      setTickets(t as T[]);
      setAnalysts(a as Analyst[]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (dept !== "all" && t.department !== dept) return false;
      if (prio !== "all" && t.priority !== prio) return false;
      if (status !== "all" && t.status !== status) return false;
      if (q) {
        const s = q.toLowerCase();
        if (
          !t.ticket_number.toLowerCase().includes(s) &&
          !t.description.toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [tickets, dept, prio, status, q]);

  const allSelected = filtered.length > 0 && filtered.every((t) => selected.has(t.id));
  const someSelected = selected.size > 0;

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((t) => t.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const runBatch = async (
    action: "reassign" | "resolve" | "reject",
    extra?: { assigned_to?: string; reason?: string },
  ) => {
    setBusy(true);
    try {
      const r = (await batch({
        data: {
          ticket_ids: Array.from(selected),
          action,
          assigned_to: extra?.assigned_to,
          reason: extra?.reason,
        },
      })) as { ok: number; errors: Array<{ ticket_id: string; error: string }> };
      const total = selected.size;
      if (r.errors.length) {
        toast.warning(`${r.ok}/${total} succeeded — ${r.errors.length} failed`, {
          description: r.errors
            .slice(0, 3)
            .map((e) => e.error)
            .join("; "),
        });
      } else {
        toast.success(`Applied to ${r.ok} ticket${r.ok === 1 ? "" : "s"}`);
      }
      setSelected(new Set());
      setReassignOpen(false);
      setRejectOpen(false);
      setRejectReason("");
      setReassignTo("");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="p-4">
        {/* Quick filters */}
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <div className="grow min-w-[180px]">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by ticket # or description"
              aria-label="Search tickets"
            />
          </div>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="w-[140px]" aria-label="Filter by department"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              {DEPTS.map((d) => <SelectItem key={d} value={d}>{d === "all" ? "All departments" : d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={prio} onValueChange={setPrio}>
            <SelectTrigger className="w-[130px]" aria-label="Filter by priority"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRIOS.map((p) => <SelectItem key={p} value={p}>{p === "all" ? "All priorities" : p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[150px]" aria-label="Filter by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={load} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Batch bar */}
        {someSelected && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border bg-primary/5 p-2">
            <Badge variant="outline" className="bg-background">{selected.size} selected</Badge>
            <Button size="sm" variant="outline" onClick={() => setReassignOpen(true)} disabled={busy}>
              <UserCog className="h-3.5 w-3.5 mr-1.5" /> Reassign
            </Button>
            <Button size="sm" variant="outline" onClick={() => runBatch("resolve")} disabled={busy}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Resolve
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)} disabled={busy}>
              <XCircle className="h-3.5 w-3.5 mr-1.5" /> Reject
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={busy}>
              Clear
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">Resolve only works on escalated tickets.</span>
          </div>
        )}

        {err ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Couldn't load tickets</AlertTitle>
            <AlertDescription className="flex items-center gap-3">
              {err}
              <Button size="sm" variant="outline" onClick={load}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No tickets match these filters.
          </div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <div className="flex items-center gap-3 px-3 py-2 border-b bg-muted/40 text-xs font-medium">
              <Checkbox
                checked={allSelected}
                onCheckedChange={toggleAll}
                aria-label="Select all filtered tickets"
              />
              <span className="text-muted-foreground">{filtered.length} tickets</span>
            </div>
            <ul className="divide-y">
              {filtered.map((t) => (
                <li key={t.id} className="flex items-start gap-3 p-3">
                  <Checkbox
                    checked={selected.has(t.id)}
                    onCheckedChange={() => toggleOne(t.id)}
                    aria-label={`Select ticket ${t.ticket_number}`}
                    className="mt-1"
                  />
                  <Link
                    to="/staff/ticket/$id"
                    params={{ id: t.id }}
                    className="flex-1 min-w-0 hover:bg-muted/30 -m-1 p-1 rounded-md transition"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">{t.ticket_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${statusClasses(t.status)}`}>
                        {t.status}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${priorityClasses(t.priority)}`}>
                        {t.priority ?? "—"}
                      </span>
                      {t.department && (
                        <span className="text-xs px-2 py-0.5 rounded-full border bg-secondary text-secondary-foreground">
                          {t.department}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                        {fmt(t.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm line-clamp-2">{t.description}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* Reassign dialog */}
      <Dialog open={reassignOpen} onOpenChange={(v) => !v && setReassignOpen(false)}>
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Reassign {selected.size} ticket{selected.size === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>Pick the analyst to take ownership.</DialogDescription>
          </DialogHeader>
          <Select value={reassignTo} onValueChange={setReassignTo}>
            <SelectTrigger><SelectValue placeholder="Choose analyst" /></SelectTrigger>
            <SelectContent>
              {analysts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.full_name} {a.department ? `· ${a.department}` : ""} {a.online ? "· online" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReassignOpen(false)} disabled={busy}>Cancel</Button>
            <Button
              onClick={() => runBatch("reassign", { assigned_to: reassignTo })}
              disabled={busy || !reassignTo}
            >
              Reassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={(v) => !v && setRejectOpen(false)}>
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Reject {selected.size} ticket{selected.size === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>Give a reason — it will be posted to each ticket.</DialogDescription>
          </DialogHeader>
          <Textarea rows={4} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)} disabled={busy}>Cancel</Button>
            <Button
              onClick={() => runBatch("reject", { reason: rejectReason.trim() })}
              disabled={busy || rejectReason.trim().length < 3}
            >
              Reject tickets
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
