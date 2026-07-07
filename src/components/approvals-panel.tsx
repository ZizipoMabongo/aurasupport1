import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { CheckCircle2, X, Timer } from "lucide-react";
import { listMyApprovals, decideApprovalTask } from "@/lib/approvals.functions";
import { fmt, rel } from "@/lib/format";

interface ApprovalRow {
  id: string;
  ticket_id: string | null;
  task_type: string;
  status: string;
  reason: string | null;
  decision_reason: string | null;
  created_at: string;
  tickets: {
    id: string;
    ticket_number: string;
    department: string | null;
    subcategory: string | null;
    description: string;
    status: string;
  } | null;
}

export function ApprovalsPanel() {
  const [items, setItems] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState<ApprovalRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useServerFn(listMyApprovals);
  const decide = useServerFn(decideApprovalTask);

  const load = async () => {
    setLoading(true);
    try {
      const rows = (await list({ data: undefined as never })) as ApprovalRow[];
      setItems(rows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const approve = async (row: ApprovalRow) => {
    setBusy(true);
    try {
      await decide({ data: { task_id: row.id, decision: "approved" } });
      toast.success("Resolution approved");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitReject = async () => {
    if (!rejecting) return;
    if (reason.trim().length < 3) {
      toast.error("Please provide a reason (min 3 chars)");
      return;
    }
    setBusy(true);
    try {
      await decide({
        data: { task_id: rejecting.id, decision: "rejected", reason: reason.trim() },
      });
      toast.success("Resolution rejected");
      setRejecting(null);
      setReason("");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pending = items.filter((i) => i.status === "pending");
  const past = items.filter((i) => i.status !== "pending");

  if (loading) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Loading approvals…</Card>;
  }

  return (
    <>
      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Timer className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Pending your approval</h3>
            <span className="text-xs text-muted-foreground">
              (auto-approves after 2 hours)
            </span>
          </div>
          {pending.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No pending approvals.
            </p>
          ) : (
            <div className="space-y-3">
              {pending.map((row) => (
                <div key={row.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-muted-foreground">
                        {row.tickets?.ticket_number ?? "—"}
                      </p>
                      <p className="text-sm font-medium truncate">
                        {row.tickets?.department} · {row.tickets?.subcategory}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Requested {rel(row.created_at)}
                      </p>
                    </div>
                    {row.ticket_id ? (
                      <Link
                        to="/staff/ticket/$id"
                        params={{ id: row.ticket_id }}
                        className="text-xs text-primary hover:underline shrink-0"
                      >
                        View ticket
                      </Link>
                    ) : null}
                  </div>
                  <p className="text-sm mb-2 line-clamp-2 text-muted-foreground">
                    {row.tickets?.description}
                  </p>
                  {row.reason ? (
                    <p className="text-xs italic text-muted-foreground mb-2">{row.reason}</p>
                  ) : null}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => approve(row)} disabled={busy}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRejecting(row)}
                      disabled={busy}
                    >
                      <X className="h-3.5 w-3.5 mr-1.5" /> Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {past.length > 0 ? (
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">Recent decisions</h3>
            <div className="space-y-2">
              {past.slice(0, 10).map((row) => (
                <div key={row.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">
                      {row.tickets?.ticket_number}
                    </p>
                    <p className="truncate">
                      {row.tickets?.department} · {row.tickets?.subcategory}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full border ${
                      row.status === "approved"
                        ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                        : "bg-destructive/10 text-destructive border-destructive/30"
                    }`}
                  >
                    {row.status}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>

      <Dialog open={!!rejecting} onOpenChange={(v) => !v && setRejecting(null)}>
        <DialogContent
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Reject resolution</DialogTitle>
            <DialogDescription>
              Tell the analyst why this ticket isn't ready to close yet. It will
              go back to In Progress.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What still needs to happen?"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejecting(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitReject} disabled={busy}>
              Send rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
