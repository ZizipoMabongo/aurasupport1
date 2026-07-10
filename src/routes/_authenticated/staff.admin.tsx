import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listStaff, createStaff, deleteStaff } from "@/lib/staff.functions";
import { Card } from "@/components/ui/card";
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
import { RoutingRulesPanel } from "@/components/routing-rules-panel";
import { AdminOverviewPanel } from "@/components/admin-overview-panel";
import { AdminTicketsPanel } from "@/components/admin-tickets-panel";
import { AdminApprovalsPanel } from "@/components/admin-approvals-panel";
import { AuditLogPanel } from "@/components/audit-log-panel";

export const Route = createFileRoute("/_authenticated/staff/admin")({
  component: AdminDashboard,
});

function AdminDashboard() {
  return (
    <Tabs defaultValue="overview">
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="escalated">Escalated</TabsTrigger>
        <TabsTrigger value="tickets">All tickets</TabsTrigger>
        <TabsTrigger value="approvals">Approvals</TabsTrigger>
        <TabsTrigger value="users">Manage staff</TabsTrigger>
        <TabsTrigger value="routing">Routing rules</TabsTrigger>
        <TabsTrigger value="reports">Reports</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        <TabsTrigger value="predictions">Predictions</TabsTrigger>
        <TabsTrigger value="compliance">AI Compliance</TabsTrigger>
        <TabsTrigger value="audit">Audit log</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-4">
        <AdminOverviewPanel />
      </TabsContent>
      <TabsContent value="escalated" className="mt-4">
        <AdminTicketsPanel initialScope="escalated" />
      </TabsContent>
      <TabsContent value="tickets" className="mt-4">
        <AdminTicketsPanel initialScope="all" />
      </TabsContent>
      <TabsContent value="approvals" className="mt-4">
        <AdminApprovalsPanel />
      </TabsContent>
      <TabsContent value="users" className="mt-4">
        <ManageStaff />
      </TabsContent>
      <TabsContent value="routing" className="mt-4">
        <RoutingRulesPanel />
      </TabsContent>
      <TabsContent value="reports" className="mt-4">
        <ReportPanel />
      </TabsContent>
      <TabsContent value="analytics" className="mt-4">
        <AnalyticsPanel />
      </TabsContent>
      <TabsContent value="predictions" className="mt-4">
        <PredictionsPanel />
      </TabsContent>
      <TabsContent value="compliance" className="mt-4">
        <CompliancePanel />
      </TabsContent>
      <TabsContent value="audit" className="mt-4">
        <AuditLogPanel />
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
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">No staff members yet.</p>
        )}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between border rounded p-3 text-sm">
            <div>
              <p className="font-medium">{r.full_name}</p>
              <p className="text-xs text-muted-foreground">{r.email} · <span className="capitalize">{r.role ?? "no role"}</span></p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => remove(r.id)} aria-label={`Remove ${r.full_name}`}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
