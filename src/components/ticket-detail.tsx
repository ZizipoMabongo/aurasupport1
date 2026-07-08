import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  acceptTicket,
  escalateTicket,
  generateAIDraft,
  rejectEscalation,
  rejectTicket,
  resolveTicket,
  respondTicket,
} from "@/lib/tickets.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSession } from "@/hooks/use-session";
import { TicketChat } from "./ticket-chat";
import { AiWorkspacePanel } from "./ai-workspace-panel";
import { fmt, priorityClasses, statusClasses } from "@/lib/format";
import { toast } from "sonner";
import { AlertTriangle, Ban, CheckCircle2, MessageSquare, Sparkles, ShieldAlert, X } from "lucide-react";

const TEMPLATES = [
  "Thank you for letting us know about this — a team member is already on the way and will be with you within the next 15 minutes.",
  "We're sorry for the inconvenience. Our maintenance team has been notified and will stop by your cabin shortly to take care of it.",
  "Thanks for flagging this. We've adjusted your account and you should see the correction reflected within one billing cycle.",
];

interface Props {
  ticket: any;
  responses: any[];
  chat: any[];
  audit: any[];
  guest: any | null;
  submitterStaff: any | null;
  isStaff: boolean;
  onChange?: () => void;
}

export function TicketDetail({
  ticket,
  responses,
  chat,
  audit,
  guest,
  submitterStaff,
  isStaff,
  onChange,
}: Props) {
  const { session } = useSession();
  const [responseOpen, setResponseOpen] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectEscOpen, setRejectEscOpen] = useState(false);
  const [body, setBody] = useState("");
  const [isNote, setIsNote] = useState(false);
  const [escReason, setEscReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectEscReason, setRejectEscReason] = useState("");
  const [busy, setBusy] = useState(false);

  const accept = useServerFn(acceptTicket);
  const respond = useServerFn(respondTicket);
  const resolve = useServerFn(resolveTicket);
  const escalate = useServerFn(escalateTicket);
  const rejectEsc = useServerFn(rejectEscalation);
  const rejectT = useServerFn(rejectTicket);
  const draftAI = useServerFn(generateAIDraft);

  const role = session?.kind === "staff" ? session.role : null;
  const userId = session?.kind === "staff" ? session.user_id : null;
  const isAdmin = role === "admin";
  const isAnalyst = role === "analyst";

  const isClosed = ticket.status === "Resolved" || ticket.status === "Rejected";
  const isEscalated = ticket.status === "Escalated";

  // Admins can only act on tickets that were escalated to them (currently
  // escalated, or already accepted by an admin so escalated_to is set).
  const adminCanAct = isAdmin && (isEscalated || ticket.escalated_to === userId);

  // Analyst rules: cannot resolve a ticket they themselves escalated,
  // unless the escalation got rejected (escalated_by cleared back to null).
  const analystEscalatedThis =
    isAnalyst && ticket.escalated_by && ticket.escalated_by === userId;
  const analystCanResolve =
    isAnalyst && !isEscalated && !analystEscalatedThis && !isClosed;
  const analystCanEscalate =
    isAnalyst && !isEscalated && !isClosed && !analystEscalatedThis;

  const canResolve = isClosed ? false : isAdmin ? adminCanAct : analystCanResolve;
  const canReject = isClosed ? false : isAdmin ? adminCanAct : analystCanResolve;
  const canRespond = !isClosed && (isAdmin ? adminCanAct : true);
  const canAcceptNew =
    !isClosed && !isEscalated && (ticket.status === "New" || ticket.status === "Needs Review") && isAnalyst;

  const submitterLabel = guest
    ? `${guest.full_name} (${guest.guest_id}, Cabin ${guest.cabin_number})${ticket.on_behalf_of_guest_id ? " — submitted by crew on guest's behalf" : ""}`
    : submitterStaff
      ? `${submitterStaff.full_name} (Crew)`
      : "Unknown";

  const handleAccept = async () => {
    setBusy(true);
    try {
      await accept({ data: { ticket_id: ticket.id } });
      toast.success("Ticket accepted");
      onChange?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleResolveConfirm = async () => {
    setBusy(true);
    try {
      await resolve({ data: { ticket_id: ticket.id } });
      toast.success("Ticket resolved");
      setResolveOpen(false);
      onChange?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (rejectReason.trim().length < 3) {
      toast.error("Please provide a reason");
      return;
    }
    setBusy(true);
    try {
      await rejectT({ data: { ticket_id: ticket.id, reason: rejectReason.trim() } });
      toast.success("Ticket rejected");
      setRejectReason("");
      setRejectOpen(false);
      onChange?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleRespondSubmit = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await respond({ data: { ticket_id: ticket.id, body: body.trim(), is_internal_note: isNote } });
      toast.success(isNote ? "Note added" : "Response sent");
      setBody("");
      setIsNote(false);
      setResponseOpen(false);
      onChange?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleEscalate = async () => {
    if (escReason.trim().length < 3) {
      toast.error("Please provide an escalation reason");
      return;
    }
    setBusy(true);
    try {
      await escalate({ data: { ticket_id: ticket.id, reason: escReason.trim() } });
      toast.success("Escalated to admin");
      setEscReason("");
      setEscalateOpen(false);
      onChange?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleRejectEsc = async () => {
    if (rejectEscReason.trim().length < 3) {
      toast.error("Please provide a reason");
      return;
    }
    setBusy(true);
    try {
      await rejectEsc({ data: { ticket_id: ticket.id, reason: rejectEscReason.trim() } });
      toast.success("Escalation rejected");
      setRejectEscReason("");
      setRejectEscOpen(false);
      onChange?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleAIDraft = async () => {
    setBusy(true);
    try {
      const { draft } = await draftAI({ data: { ticket_id: ticket.id } });
      setBody(draft);
      toast.success("Draft generated");
    } catch (e) {
      toast.error("Could not generate draft");
    } finally {
      setBusy(false);
    }
  };

  // Show an explanatory banner for admin view-only or analyst-locked states.
  const lockBanner = (() => {
    if (isAdmin && !adminCanAct && !isClosed)
      return "Admins can act only on escalated tickets. This is a view-only view.";
    if (analystEscalatedThis && !isClosed)
      return "You escalated this ticket. You can resolve it only if the admin rejects the escalation back to you.";
    return null;
  })();

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left: ticket info */}
      <div className="lg:col-span-2 space-y-4">
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <div className="font-mono text-xs text-muted-foreground">{ticket.ticket_number}</div>
              <h1 className="mt-1 text-xl font-semibold tracking-tight">{ticket.department ?? "—"}</h1>
              <p className="text-sm text-muted-foreground">{ticket.subcategory}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`text-xs px-2 py-1 rounded-full border ${statusClasses(ticket.status)}`}>{ticket.status}</span>
              <span className={`text-xs px-2 py-1 rounded-full border ${priorityClasses(ticket.priority)}`}>
                {ticket.priority ?? "—"}
              </span>
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                Description
              </p>
              <p className="whitespace-pre-wrap">{ticket.description}</p>
            </div>
            {ticket.escalation_reason ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/20 p-3">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Escalation reason</p>
                <p className="text-sm">{ticket.escalation_reason}</p>
              </div>
            ) : null}
            {ticket.escalation_rejection_reason ? (
              <div className="rounded-md border bg-card p-3">
                <p className="text-xs font-medium text-muted-foreground">Escalation rejected — reason</p>
                <p className="text-sm">{ticket.escalation_rejection_reason}</p>
              </div>
            ) : null}
            {ticket.rejection_reason ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-xs font-medium text-destructive">Rejection reason</p>
                <p className="text-sm">{ticket.rejection_reason}</p>
              </div>
            ) : null}
            <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t">
              <div>
                <p className="text-xs text-muted-foreground">Submitter</p>
                <p>{submitterLabel}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Submitted</p>
                <p>{fmt(ticket.created_at)}</p>
              </div>
              {ticket.resolved_at ? (
                <div>
                  <p className="text-xs text-muted-foreground">{ticket.status === "Rejected" ? "Closed" : "Resolved"}</p>
                  <p>{fmt(ticket.resolved_at)}</p>
                </div>
              ) : null}
              {ticket.first_response_at ? (
                <div>
                  <p className="text-xs text-muted-foreground">First response</p>
                  <p>{fmt(ticket.first_response_at)}</p>
                </div>
              ) : null}
            </div>
          </div>
        </Card>

        {/* Responses & timeline */}
        <Card className="p-6">
          <Tabs defaultValue="responses">
            <TabsList>
              <TabsTrigger value="responses">Responses</TabsTrigger>
              {isStaff ? <TabsTrigger value="notes">Internal notes</TabsTrigger> : null}
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
            </TabsList>
            <TabsContent value="responses" className="mt-4 space-y-3">
              {responses.filter((r) => !r.is_internal_note).length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No responses yet.</p>
              ) : (
                responses
                  .filter((r) => !r.is_internal_note)
                  .map((r) => (
                    <div key={r.id} className="rounded-md border bg-card p-3">
                      <p className="text-xs text-muted-foreground mb-1">{fmt(r.created_at)}</p>
                      <p className="whitespace-pre-wrap text-sm">{r.body}</p>
                    </div>
                  ))
              )}
            </TabsContent>
            {isStaff ? (
              <TabsContent value="notes" className="mt-4 space-y-3">
                {responses.filter((r) => r.is_internal_note).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No internal notes.</p>
                ) : (
                  responses
                    .filter((r) => r.is_internal_note)
                    .map((r) => (
                      <div key={r.id} className="rounded-md border border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/20 p-3">
                        <p className="text-xs text-muted-foreground mb-1">Internal · {fmt(r.created_at)}</p>
                        <p className="whitespace-pre-wrap text-sm">{r.body}</p>
                      </div>
                    ))
                )}
              </TabsContent>
            ) : null}
            <TabsContent value="timeline" className="mt-4 space-y-2">
              {audit.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No activity yet.</p>
              ) : (
                audit.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 text-sm">
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p>
                        <span className="font-medium">{a.actor_name}</span>{" "}
                        <span className="text-muted-foreground">{a.action.replace(/_/g, " ").replace(/\./g, ": ")}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{fmt(a.created_at)}</p>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </Card>

        {/* Staff actions */}
        {isStaff ? (
          <Card className="p-4 space-y-3">
            {lockBanner ? (
              <p className="text-xs text-muted-foreground bg-muted/40 border rounded-md p-2">{lockBanner}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {canAcceptNew ? (
                <Button onClick={handleAccept} disabled={busy}>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Accept ticket
                </Button>
              ) : null}
              {isEscalated && isAdmin ? (
                <>
                  <Button onClick={handleAccept} disabled={busy}>
                    <CheckCircle2 className="h-4 w-4 mr-1.5" /> Accept escalation
                  </Button>
                  <Button variant="outline" onClick={() => setRejectEscOpen(true)} disabled={busy}>
                    <X className="h-4 w-4 mr-1.5" /> Reject escalation
                  </Button>
                </>
              ) : null}
              {canRespond ? (
                <Button variant="secondary" onClick={() => setResponseOpen(true)} disabled={busy}>
                  <MessageSquare className="h-4 w-4 mr-1.5" /> Respond
                </Button>
              ) : null}
              {analystCanEscalate ? (
                <Button variant="outline" onClick={() => setEscalateOpen(true)} disabled={busy}>
                  <ShieldAlert className="h-4 w-4 mr-1.5" /> Escalate
                </Button>
              ) : null}
              {canResolve ? (
                <Button variant="outline" onClick={() => setResolveOpen(true)} disabled={busy}>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Resolve
                </Button>
              ) : null}
              {canReject ? (
                <Button variant="ghost" onClick={() => setRejectOpen(true)} disabled={busy} className="text-destructive hover:text-destructive">
                  <Ban className="h-4 w-4 mr-1.5" /> Reject ticket
                </Button>
              ) : null}
            </div>
          </Card>
        ) : null}
      </div>

      {/* Right: chat + AI workspace */}
      <div className="space-y-4">
        <Card className="p-0">
          <div className="p-3 border-b">
            <h3 className="font-semibold text-sm">Conversation</h3>
            <p className="text-xs text-muted-foreground">Real-time, preserved across escalation.</p>
          </div>
          <div className="p-3">
            <TicketChat ticketId={ticket.id} initialMessages={chat} />
          </div>
        </Card>
        {isStaff && (isAnalyst || isAdmin) ? (
          <AiWorkspacePanel
            ticket={ticket}
            canEdit={(isAnalyst && analystCanResolve) || (isAdmin && adminCanAct)}
            onChange={onChange}
          />
        ) : null}
      </div>

      {/* Response modal — manual dismiss only */}
      <Dialog open={responseOpen} onOpenChange={setResponseOpen}>
        <DialogContent
          className="max-w-lg"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{isNote ? "Add internal note" : "Send response"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((t, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setBody(t)}
                  className="text-xs px-2 py-1 rounded border bg-secondary hover:bg-accent"
                >
                  Template {i + 1}
                </button>
              ))}
              <Button size="sm" variant="outline" type="button" onClick={handleAIDraft} disabled={busy}>
                <Sparkles className="h-3.5 w-3.5 mr-1" /> AI draft
              </Button>
            </div>
            <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a warm, specific response..." />
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isNote} onChange={(e) => setIsNote(e.target.checked)} />
              Save as internal note (not visible to guest/crew)
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResponseOpen(false)}>Cancel</Button>
            <Button onClick={handleRespondSubmit} disabled={busy || !body.trim()}>
              {isNote ? "Save note" : "Send response"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve confirmation */}
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent
          className="max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Confirm ticket resolution
            </DialogTitle>
            <DialogDescription>
              Mark ticket <span className="font-mono">{ticket.ticket_number}</span> as resolved? The submitter will see this in their history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResolveOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={handleResolveConfirm} disabled={busy}>
              {busy ? "Resolving..." : "Approve resolution"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject ticket (with reason) */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent
          className="max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2">
              <Ban className="h-4 w-4 text-destructive" /> Reject ticket
            </DialogTitle>
            <DialogDescription>
              Provide a reason. The submitter will be able to see why their request was rejected.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            placeholder="Reason for rejection (required)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={handleRejectConfirm} disabled={busy || rejectReason.trim().length < 3}>
              Confirm rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Escalate dialog (reason required) */}
      <Dialog open={escalateOpen} onOpenChange={setEscalateOpen}>
        <DialogContent
          className="max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Escalate to admin
            </DialogTitle>
            <DialogDescription>
              The conversation thread is preserved. Admins will be notified. After escalating, you will not be able to resolve this ticket unless the admin rejects the escalation back to you.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            placeholder="Reason for escalation (required)"
            value={escReason}
            onChange={(e) => setEscReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEscalateOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={handleEscalate} disabled={busy || escReason.trim().length < 3}>Escalate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject escalation dialog (reason required) */}
      <Dialog open={rejectEscOpen} onOpenChange={setRejectEscOpen}>
        <DialogContent
          className="max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2">
              <X className="h-4 w-4 text-destructive" /> Reject escalation
            </DialogTitle>
            <DialogDescription>
              The ticket will be returned to the analyst queue with your reason attached.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            placeholder="Reason for rejecting the escalation (required)"
            value={rejectEscReason}
            onChange={(e) => setRejectEscReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectEscOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={handleRejectEsc} disabled={busy || rejectEscReason.trim().length < 3}>
              Reject escalation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
