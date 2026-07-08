import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sparkles, Wand2, Users, Copy, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import {
  getRelatedTickets,
  predictNextAction,
  reclassifyTicket,
  resolveSimilar,
} from "@/lib/analyst-workspace.functions";
import { fmt, priorityClasses, statusClasses } from "@/lib/format";

const DEPTS = ["IT", "HR", "Finance", "Operations"] as const;
const PRIOS = ["Low", "Medium", "High", "Urgent"] as const;

interface Props {
  ticket: any;
  canEdit: boolean;
  onChange?: () => void;
}

export function AiWorkspacePanel({ ticket, canEdit, onChange }: Props) {
  const getRelated = useServerFn(getRelatedTickets);
  const predict = useServerFn(predictNextAction);
  const reclass = useServerFn(reclassifyTicket);
  const doResolveSimilar = useServerFn(resolveSimilar);

  const [related, setRelated] = useState<any>(null);
  const [prediction, setPrediction] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const [reclassOpen, setReclassOpen] = useState(false);
  const [dept, setDept] = useState<string>(ticket.department ?? "IT");
  const [sub, setSub] = useState<string>(ticket.subcategory ?? "");
  const [prio, setPrio] = useState<string>(ticket.priority ?? "Medium");
  const [reason, setReason] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([
      getRelated({ data: { ticket_id: ticket.id } }),
      predict({ data: { ticket_id: ticket.id } }),
    ])
      .then(([r, p]) => {
        if (!alive) return;
        setRelated(r);
        setPrediction(p);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ticket.id, getRelated, predict]);

  const handleReclassify = async () => {
    if (!sub.trim()) {
      toast.error("Subcategory required");
      return;
    }
    setBusy(true);
    try {
      await reclass({
        data: {
          ticket_id: ticket.id,
          department: dept as (typeof DEPTS)[number],
          subcategory: sub.trim(),
          priority: prio as (typeof PRIOS)[number],
          reason: reason.trim() || undefined,
        },
      });
      toast.success("Ticket reclassified");
      setReclassOpen(false);
      setReason("");
      onChange?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleResolveSimilar = async (sourceId: string) => {
    setBusy(true);
    try {
      await doResolveSimilar({ data: { ticket_id: ticket.id, source_ticket_id: sourceId } });
      toast.success("Similar response applied");
      onChange?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confPct = ticket.ai_classified && ticket.confidence != null ? Math.round(ticket.confidence * 100) : null;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">AI workspace</h3>
      </div>

      {/* Predicted next action */}
      {prediction ? (
        <div className="rounded-md border bg-primary/5 p-3">
          <p className="text-xs font-medium uppercase tracking-wider text-primary/80">Predicted next action</p>
          <p className="mt-1 text-sm font-semibold">{prediction.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{prediction.reason}</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Analyzing…</p>
      )}

      {/* Classification snapshot */}
      <div className="text-xs space-y-1">
        <div className="flex justify-between"><span className="text-muted-foreground">AI classified</span><span>{ticket.ai_classified ? "Yes" : "No / corrected"}</span></div>
        {confPct != null ? (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Confidence</span>
            <span className={confPct < 60 ? "text-amber-600 font-medium" : ""}>{confPct}%</span>
          </div>
        ) : null}
        {canEdit ? (
          <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => setReclassOpen(true)}>
            <Wand2 className="h-3.5 w-3.5 mr-1" /> Reclassify
          </Button>
        ) : null}
      </div>

      {/* Resolved similar */}
      {related?.resolvedSimilar?.length ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Resolved similar</p>
          <div className="space-y-2">
            {related.resolvedSimilar.map((r: any) => (
              <div key={r.id} className="rounded border p-2 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Link to="/staff/ticket/$id" params={{ id: r.id }} className="font-mono text-[10px] hover:underline">
                    {r.ticket_number}
                  </Link>
                  <span className="text-[10px] text-muted-foreground">{fmt(r.resolved_at)}</span>
                </div>
                <p className="line-clamp-2 text-muted-foreground">{r.description}</p>
                {r.final_response && canEdit ? (
                  <Button size="sm" variant="secondary" className="w-full h-7" disabled={busy} onClick={() => handleResolveSimilar(r.id)}>
                    <Copy className="h-3 w-3 mr-1" /> Use this resolution
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Related tickets */}
      {related?.sameCategory?.length ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Related — same category</p>
          <div className="space-y-1.5">
            {related.sameCategory.slice(0, 4).map((r: any) => (
              <Link key={r.id} to="/staff/ticket/$id" params={{ id: r.id }} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs hover:bg-accent">
                <span className="font-mono text-[10px]">{r.ticket_number}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusClasses(r.status)}`}>{r.status}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {related?.sameGuest?.length ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
            <Users className="h-3 w-3" /> Same requester history
          </p>
          <div className="space-y-1.5">
            {related.sameGuest.slice(0, 4).map((r: any) => (
              <Link key={r.id} to="/staff/ticket/$id" params={{ id: r.id }} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs hover:bg-accent">
                <span className="font-mono text-[10px]">{r.ticket_number}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${priorityClasses(r.priority)}`}>{r.priority}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* Reclassify dialog */}
      <Dialog open={reclassOpen} onOpenChange={setReclassOpen}>
        <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Reclassify ticket</DialogTitle>
            <DialogDescription>Correct the AI's classification. This trains future routing and updates the audit trail.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Department</label>
              <Select value={dept} onValueChange={setDept}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DEPTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Subcategory</label>
              <Input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="e.g. Connectivity" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Priority</label>
              <Select value={prio} onValueChange={setPrio}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIOS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Reason (optional)</label>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why did you correct this?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReclassOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={handleReclassify} disabled={busy}>Save correction</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
