import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listRoutingRules,
  upsertRoutingRule,
  deleteRoutingRule,
  listAnalysts,
  listAutomationEvents,
  rerouteQueuedTickets,
} from "@/lib/routing.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Pencil, RefreshCw, Zap } from "lucide-react";

type Dept = "IT" | "HR" | "Finance" | "Operations";
type Prio = "Low" | "Medium" | "High" | "Urgent";

interface RuleForm {
  id?: string;
  name: string;
  department: Dept;
  subcategory: string;
  keywords: string;
  required_skills: string;
  priority_boost: Prio | "none";
  preferred_analyst: string | "none";
  is_active: boolean;
  weight: number;
}

const empty: RuleForm = {
  name: "",
  department: "IT",
  subcategory: "",
  keywords: "",
  required_skills: "",
  priority_boost: "none",
  preferred_analyst: "none",
  is_active: true,
  weight: 10,
};

interface Analyst {
  id: string;
  full_name: string;
  email: string;
  online: boolean;
  department: string | null;
  skill_tags: string[];
  max_concurrent: number;
}

interface Rule {
  id: string;
  name: string;
  department: Dept;
  subcategory: string | null;
  keywords: string[];
  required_skills: string[];
  priority_boost: Prio | null;
  preferred_analyst: string | null;
  is_active: boolean;
  weight: number;
}

interface Event {
  id: string;
  ticket_id: string | null;
  event_type: string;
  reason: string | null;
  assigned_to: string | null;
  created_at: string;
}

export function RoutingRulesPanel() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RuleForm>(empty);
  const [busy, setBusy] = useState(false);

  const load = useServerFn(listRoutingRules);
  const loadA = useServerFn(listAnalysts);
  const loadE = useServerFn(listAutomationEvents);
  const upsert = useServerFn(upsertRoutingRule);
  const remove = useServerFn(deleteRoutingRule);
  const reroute = useServerFn(rerouteQueuedTickets);

  const refresh = async () => {
    try {
      const [r, a, e] = await Promise.all([
        load({ data: undefined as never }),
        loadA({ data: undefined as never }),
        loadE({ data: { limit: 25 } }),
      ]);
      setRules(r as Rule[]);
      setAnalysts(a as Analyst[]);
      setEvents(e as Event[]);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  useEffect(() => { refresh(); }, []);

  const analystName = (id: string | null) =>
    id ? analysts.find((a) => a.id === id)?.full_name ?? "—" : "—";

  const openNew = () => { setForm(empty); setOpen(true); };
  const openEdit = (r: Rule) => {
    setForm({
      id: r.id,
      name: r.name,
      department: r.department,
      subcategory: r.subcategory ?? "",
      keywords: r.keywords.join(", "),
      required_skills: r.required_skills.join(", "),
      priority_boost: r.priority_boost ?? "none",
      preferred_analyst: r.preferred_analyst ?? "none",
      is_active: r.is_active,
      weight: r.weight,
    });
    setOpen(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await upsert({
        data: {
          id: form.id,
          name: form.name,
          department: form.department,
          subcategory: form.subcategory || null,
          keywords: form.keywords.split(",").map((s) => s.trim()).filter(Boolean),
          required_skills: form.required_skills.split(",").map((s) => s.trim()).filter(Boolean),
          priority_boost: form.priority_boost === "none" ? null : form.priority_boost,
          preferred_analyst: form.preferred_analyst === "none" ? null : form.preferred_analyst,
          is_active: form.is_active,
          weight: form.weight,
        },
      });
      toast.success(form.id ? "Rule updated" : "Rule created");
      setOpen(false);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this rule?")) return;
    try {
      await remove({ data: { id } });
      toast.success("Deleted");
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const runReroute = async () => {
    try {
      const r = (await reroute({ data: undefined as never })) as { rerouted: number };
      toast.success(`Rerouted ${r.rerouted} queued ticket(s)`);
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold">Routing rules</h2>
            <p className="text-xs text-muted-foreground">Auto-assign incoming tickets to the right analyst by department, keywords and skills.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={runReroute}><RefreshCw className="h-4 w-4 mr-1" />Retry queue</Button>
            <Button size="sm" onClick={openNew}>New rule</Button>
          </div>
        </div>

        <div className="space-y-2">
          {rules.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No rules yet. Tickets still auto-assign to the least-loaded online analyst in the matching department.
            </p>
          )}
          {rules.map((r) => (
            <div key={r.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{r.name}</span>
                  <Badge variant="outline">{r.department}</Badge>
                  {r.subcategory && <Badge variant="secondary">{r.subcategory}</Badge>}
                  {r.priority_boost && <Badge>Boost → {r.priority_boost}</Badge>}
                  {!r.is_active && <Badge variant="destructive">Inactive</Badge>}
                  <span className="text-xs text-muted-foreground">weight {r.weight}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                  {r.keywords.length > 0 && <div><span className="font-medium text-foreground/70">Keywords:</span> {r.keywords.join(", ")}</div>}
                  {r.required_skills.length > 0 && <div><span className="font-medium text-foreground/70">Skills:</span> {r.required_skills.join(", ")}</div>}
                  {r.preferred_analyst && <div><span className="font-medium text-foreground/70">Preferred analyst:</span> {analystName(r.preferred_analyst)}</div>}
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => del(r.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Analyst availability</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {analysts.map((a) => (
            <div key={a.id} className="border rounded p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{a.full_name}</span>
                <Badge variant={a.online ? "default" : "outline"} className={a.online ? "bg-emerald-600" : ""}>
                  {a.online ? "Online" : "Offline"}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {a.department ?? "Any dept"} · capacity {a.max_concurrent}
                {a.skill_tags.length > 0 && <> · skills: {a.skill_tags.join(", ")}</>}
              </div>
            </div>
          ))}
          {analysts.length === 0 && <p className="text-sm text-muted-foreground">No analysts yet.</p>}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><Zap className="h-4 w-4" />Recent routing decisions</h2>
        <div className="space-y-1 max-h-72 overflow-auto">
          {events.map((e) => (
            <div key={e.id} className="text-xs border-b py-2 flex justify-between gap-3">
              <div>
                <Badge variant={e.event_type === "queued" ? "destructive" : "outline"} className="mr-2">{e.event_type}</Badge>
                {e.reason}
                {e.assigned_to && <> → <span className="font-medium">{analystName(e.assigned_to)}</span></>}
              </div>
              <span className="text-muted-foreground whitespace-nowrap">{new Date(e.created_at).toLocaleTimeString()}</span>
            </div>
          ))}
          {events.length === 0 && <p className="text-sm text-muted-foreground">No routing activity yet.</p>}
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()} className="max-w-lg">
          <DialogHeader><DialogTitle>{form.id ? "Edit rule" : "New routing rule"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Wi-Fi issues → Networking team" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Department</Label>
                <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v as Dept })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["IT", "HR", "Finance", "Operations"] as Dept[]).map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Weight (1-100)</Label>
                <Input type="number" min={1} max={100} value={form.weight} onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })} />
              </div>
            </div>
            <div><Label>Subcategory (optional)</Label><Input value={form.subcategory} onChange={(e) => setForm({ ...form, subcategory: e.target.value })} /></div>
            <div><Label>Keywords (comma-separated)</Label><Input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="wifi, internet, connection" /></div>
            <div><Label>Required analyst skills (comma-separated)</Label><Input value={form.required_skills} onChange={(e) => setForm({ ...form, required_skills: e.target.value })} placeholder="networking, hardware" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priority boost</Label>
                <Select value={form.priority_boost} onValueChange={(v) => setForm({ ...form, priority_boost: v as Prio | "none" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(["Low", "Medium", "High", "Urgent"] as Prio[]).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Preferred analyst</Label>
                <Select value={form.preferred_analyst} onValueChange={(v) => setForm({ ...form, preferred_analyst: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Any</SelectItem>
                    {analysts.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy || !form.name}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
