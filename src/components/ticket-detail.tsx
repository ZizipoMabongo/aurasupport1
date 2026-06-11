import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  acceptTicket,
  escalateTicket,
  generateAIDraft,
  rejectEscalation,
  resolveTicket,
  respondTicket,
} from "@/lib/tickets.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSession } from "@/hooks/use-session";
import { TicketChat } from "./ticket-chat";
import { fmt, priorityClasses, statusClasses } from "@/lib/format";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, MessageSquare, Sparkles, ShieldAlert, X } from "lucide-react";

const TEMPLATES = [
  "Thank you for letting us know. A team member is on the way and will reach you within 15 minutes.",
  "We've logged the issue and our maintenance team will visit your cabin shortly. Apologies for the inconvenience.",
  "We've adjusted your account and you should see the correction reflected within one billing cycle.",
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
  const [body, setBody] = useState("");
  const [isNote, setIsNote] = useState(false);
  const [escReason, setEscReason] = useState("");
  const [busy, setBusy] = useState(false);

  const accept = useServerFn(acceptTicket);
  const respond = useServerFn(respondTicket);
  const resolve = useServerFn(resolveTicket);
  const escalate = useServerFn(escalateTicket);
  const rejectEsc = useServerFn(rejectEscalation);
  const draftAI = useServerFn(generateAIDraft);

  const role = session?.kind === "staff" ? session.role : null;
  const isAdmin = role === "admin";
  const isAnalyst = role === "analyst";

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

  const handleResolve = async () => {
    setBusy(true);
    try {
      await resolve({ data: { ticket_id: ticket.id } });
      toast.success("Ticket resolved");
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
    setBusy(true);
    try {
      await escalate({ data: { ticket_id: ticket.id, reason: escReason.trim() || undefined } });
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
    setBusy(true);
    try {
      await rejectEsc({ data: { ticket_id: ticket.id } });
      toast.success("Escalation rejected");
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
                  <p className="text-xs text-muted-foreground">Resolved</p>
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
          <Card className="p-4">
            <div className="flex flex-wrap gap-2">
              {ticket.status === "New" || ticket.status === "Needs Review" ? (
                <Button onClick={handleAccept} disabled={busy}>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Accept ticket
                </Button>
              ) : null}
              {ticket.status === "Escalated" && isAdmin ? (
                <>
                  <Button onClick={handleAccept} disabled={busy}>
                    <CheckCircle2 className="h-4 w-4 mr-1.5" /> Accept escalation
                  </Button>
                  <Button variant="outline" onClick={handleRejectEsc} disabled={busy}>
                    <X className="h-4 w-4 mr-1.5" /> Reject escalation
                  </Button>
                </>
              ) : null}
              <Button variant="secondary" onClick={() => setResponseOpen(true)} disabled={busy || ticket.status === "Resolved"}>
                <MessageSquare className="h-4 w-4 mr-1.5" /> Respond
              </Button>
              {isAnalyst && ticket.status !== "Escalated" && ticket.status !== "Resolved" ? (
                <Button variant="outline" onClick={() => setEscalateOpen(true)} disabled={busy}>
                  <ShieldAlert className="h-4 w-4 mr-1.5" /> Escalate
                </Button>
              ) : null}
              {ticket.status !== "Resolved" && ticket.status !== "Rejected" ? (
                <Button variant="outline" onClick={handleResolve} disabled={busy}>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Resolve
                </Button>
              ) : null}
            </div>
          </Card>
        ) : null}
      </div>

      {/* Right: chat */}
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
            <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your response..." />
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
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The conversation thread will be preserved. Admins will be notified.
          </p>
          <Textarea
            rows={3}
            placeholder="Reason (optional)"
            value={escReason}
            onChange={(e) => setEscReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEscalateOpen(false)}>Cancel</Button>
            <Button onClick={handleEscalate} disabled={busy}>Escalate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
