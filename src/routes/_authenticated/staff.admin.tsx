import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listAllTickets } from "@/lib/tickets.functions";
import { listStaff, createStaff, deleteStaff } from "@/lib/staff.functions";
import { Card } from "@/components/ui/card";
import { TicketList } from "@/components/ticket-list";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { AnalyticsPanel } from "@/components/analytics-panel";
import { ReportPanel } from "@/components/report-panel";
import { PredictionsPanel } from "@/components/predictions-panel";
import { CompliancePanel } from "@/components/compliance-panel";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/staff/admin")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const [all, setAll] = useState<any[]>([]);
  const list = useServerFn(listAllTickets);

  const load = async () => {
    const rows = await list({ data: {} });
    setAll(rows as any[]);
  };

  useEffect(() => { load(); }, []);

  const escalated = all.filter((t) => t.status === "Escalated");

  return (
    <Tabs defaultValue="escalated">
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="escalated">Escalated <span className="ml-1 text-xs opacity-70">({escalated.length})</span></TabsTrigger>
        <TabsTrigger value="all">All tickets</TabsTrigger>
        <TabsTrigger value="users">Manage staff</TabsTrigger>
        <TabsTrigger value="reports">Reports</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
      </TabsList>
      <TabsContent value="escalated" className="mt-4">
        <TicketList tickets={escalated} basePath="/staff/ticket" empty="No escalations at the moment." />
      </TabsContent>
      <TabsContent value="all" className="mt-4">
        <TicketList tickets={all} basePath="/staff/ticket" empty="No tickets yet." />
      </TabsContent>
      <TabsContent value="users" className="mt-4">
        <ManageStaff />
      </TabsContent>
      <TabsContent value="reports" className="mt-4">
        <ReportPanel />
      </TabsContent>
      <TabsContent value="analytics" className="mt-4">
        <AnalyticsPanel />
      </TabsContent>
    </Tabs>
  );
}

function ManageStaff() {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "analyst" as "crew" | "analyst" | "admin" });
  const list = useServerFn(listStaff);
  const create = useServerFn(createStaff);
  const del = useServerFn(deleteStaff);

  const load = async () => {
    const r = await list({ data: undefined as never });
    setRows(r as any[]);
  };
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, []);

  const submit = async () => {
    setBusy(true);
    try {
      await create({ data: form });
      toast.success("Staff member created");
      setForm({ email: "", password: "", full_name: "", role: "analyst" });
      setOpen(false);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this staff member?")) return;
    try {
      await del({ data: { user_id: id } });
      toast.success("Removed");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Staff members</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>Add staff</Button></DialogTrigger>
          <DialogContent onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
            <DialogHeader><DialogTitle>Create staff member</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Password</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <div>
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as "crew" | "analyst" | "admin" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="crew">Crew</SelectItem>
                    <SelectItem value="analyst">Analyst</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={busy}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between border rounded p-3 text-sm">
            <div>
              <p className="font-medium">{r.full_name}</p>
              <p className="text-xs text-muted-foreground">{r.email} · <span className="capitalize">{r.role ?? "no role"}</span></p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
