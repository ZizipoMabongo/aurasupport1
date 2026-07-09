import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { submitTicket } from "@/lib/tickets.functions";
import { searchGuests } from "@/lib/guest.functions";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, X, AlertCircle, CheckCircle2, Clock, RotateCcw } from "lucide-react";
import { estimatedResponseWindow, suggestedFollowUps } from "@/lib/format.eta";

interface Guest {
  guest_id: string;
  full_name: string;
  cabin_number: string;
}

interface SubmissionResult {
  created: Array<{
    id: string;
    ticket_number: string;
    department: string | null;
    priority: string | null;
    subcategory: string | null;
  }>;
  rejected: Array<{ department: string; subcategory: string; reason: string }>;
}

interface RecentTicket {
  id: string;
  ticket_number: string;
  description: string;
  department: string | null;
  status: string;
}

export function SubmitTicketForm({
  onSubmitted,
  showOnBehalf,
  recentTickets = [],
}: {
  onSubmitted?: () => void;
  showOnBehalf: boolean; // crew only
  recentTickets?: RecentTicket[];
}) {

  const { session } = useSession();
  const [mode, setMode] = useState<"self" | "on_behalf_of_guest">("self");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [showResult, setShowResult] = useState(false);

  // guest picker (crew)
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Guest[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Guest | null>(null);

  const submit = useServerFn(submitTicket);
  const search = useServerFn(searchGuests);

  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const rows = await search({ data: { query: query.trim() } });
      setResults(rows as Guest[]);
    } catch (e) {
      toast.error("Could not search guests");
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async () => {
    if (!session) return;
    if (!description.trim() || description.trim().length < 5) {
      toast.error("Please describe your request");
      return;
    }
    if (showOnBehalf && mode === "on_behalf_of_guest" && !picked) {
      toast.error("Pick a guest first");
      return;
    }
    setBusy(true);
    try {
      const submitter =
        session.kind === "guest"
          ? ({ kind: "guest" as const, guest_id: session.guest_id })
          : ({
              kind: "staff" as const,
              mode,
              on_behalf_of_guest_id: picked?.guest_id,
            });
      const res = (await submit({
        data: { description: description.trim(), submitter },
      })) as SubmissionResult;
      setResult(res);
      setShowResult(true);
      setDescription("");
      setPicked(null);
      setQuery("");
      setResults([]);
      onSubmitted?.();
    } catch (e) {
      toast.error((e as Error).message ?? "Could not submit request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="p-6 glass-card">
        <h2 className="text-lg font-semibold tracking-tight mb-1">Submit a request</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Describe your issue in plain language. Our AI will route it to the right team.
        </p>

        {showOnBehalf ? (
          <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)} className="mb-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="self">My Request</TabsTrigger>
              <TabsTrigger value="on_behalf_of_guest">Guest Request</TabsTrigger>
            </TabsList>
            <TabsContent value="on_behalf_of_guest" className="mt-4">
              <Label className="mb-2 block">Find guest by ID, cabin number, or name</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="G1001 or C-101 or Alice"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), runSearch())}
                />
                <Button type="button" variant="secondary" onClick={runSearch} disabled={searching}>
                  <Search className="h-4 w-4 mr-1" />
                  Search
                </Button>
              </div>
              {picked ? (
                <div className="mt-3 flex items-center justify-between rounded-md border bg-primary/5 px-3 py-2 text-sm">
                  <span>
                    <strong>{picked.full_name}</strong> · {picked.guest_id} · Cabin {picked.cabin_number}
                  </span>
                  <button onClick={() => setPicked(null)} aria-label="Clear">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : results.length > 0 ? (
                <div className="mt-3 space-y-1 max-h-48 overflow-y-auto border rounded-md">
                  {results.map((g) => (
                    <button
                      key={g.guest_id}
                      type="button"
                      onClick={() => {
                        setPicked(g);
                        setResults([]);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent border-b last:border-0"
                    >
                      <span className="font-medium">{g.full_name}</span>
                      <span className="text-muted-foreground"> · {g.guest_id} · Cabin {g.cabin_number}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
        ) : null}

        {recentTickets.length > 0 ? (
          <div className="mb-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Re-submit a similar request
            </p>
            <div className="flex flex-wrap gap-1.5">
              {recentTickets.slice(0, 3).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDescription(t.description)}
                  className="inline-flex items-center gap-1 rounded-full border bg-secondary/60 hover:bg-secondary px-2.5 py-1 text-xs text-left max-w-full"
                  title={t.description}
                >
                  <RotateCcw className="h-3 w-3 shrink-0" />
                  <span className="truncate max-w-[220px]">
                    {t.department ? `${t.department}: ` : ""}
                    {t.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <Label htmlFor="desc" className="mb-2 block">Describe your request</Label>
        <Textarea
          id="desc"
          rows={5}
          placeholder="e.g. The WiFi in my cabin keeps dropping and the air conditioning is too cold."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="mt-4 flex justify-end">
          <Button onClick={handleSubmit} disabled={busy}>
            {busy ? "Submitting..." : "Submit request"}
          </Button>
        </div>

      </Card>

      {/* Success/rejection modal — manual dismiss only */}
      <Dialog
        open={showResult}
        onOpenChange={(open) => {
          // Manual dismiss only: ignore overlay clicks unless user uses the close button.
          if (!open) return;
          setShowResult(open);
        }}
      >
        <DialogContent
          className="max-w-lg"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Request received</DialogTitle>
          </DialogHeader>

          {result ? (
            <div className="space-y-4">
              {result.created.length > 0 ? (
                <div>
                  <p className="text-sm text-muted-foreground mb-2 inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    {result.created.length === 1
                      ? "We've opened 1 ticket for you."
                      : `We've split your request into ${result.created.length} tickets.`}
                  </p>
                  <ul className="space-y-2">
                    {result.created.map((t) => {
                      const followUps = suggestedFollowUps(t.department);
                      return (
                        <li key={t.id} className="rounded-md border p-3 text-sm bg-card">
                          <div className="font-mono text-xs text-muted-foreground">{t.ticket_number}</div>
                          <div className="mt-1">
                            <span className="font-medium">{t.department}</span>
                            {t.subcategory ? <span className="text-muted-foreground"> · {t.subcategory}</span> : null}
                            {t.priority ? <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-secondary">{t.priority}</span> : null}
                          </div>
                          <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            Estimated first response {estimatedResponseWindow(t.priority)}.
                          </div>
                          {followUps.length > 0 ? (
                            <div className="mt-2">
                              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                                Anything else worth mentioning?
                              </p>
                              <ul className="list-disc pl-4 space-y-0.5 text-xs text-muted-foreground">
                                {followUps.map((q, i) => (
                                  <li key={i}>{q}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>

                </div>
              ) : null}

              {result.rejected.length > 0 ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-sm font-medium inline-flex items-center gap-1.5 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {result.rejected.length} item{result.rejected.length === 1 ? "" : "s"} could not be submitted
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {result.rejected.map((r, i) => (
                      <li key={i} className="text-muted-foreground">
                        <span className="font-medium text-foreground">{r.department} · {r.subcategory}:</span> {r.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button onClick={() => setShowResult(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
