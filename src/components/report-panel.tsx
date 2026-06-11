import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getReport } from "@/lib/analytics.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Download } from "lucide-react";

export function ReportPanel() {
  const [from, setFrom] = useState(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [dept, setDept] = useState("all");
  const [report, setReport] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const fn = useServerFn(getReport);

  const generate = async () => {
    setBusy(true);
    try {
      const r = await fn({ data: { from: new Date(from).toISOString(), to: new Date(to + "T23:59:59").toISOString(), department: dept } });
      setReport(r);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const exportText = () => {
    if (!report) return;
    const lines: string[] = [];
    lines.push(`AURA SEAS — Operational Report`);
    lines.push(`Period: ${from} to ${to}`);
    lines.push(`Department: ${dept === "all" ? "All" : dept}`);
    lines.push("");
    lines.push("EXECUTIVE SUMMARY");
    lines.push(report.summary);
    lines.push("");
    lines.push("KPIS");
    lines.push(`Total tickets: ${report.kpis.total}`);
    lines.push(`Guest issues: ${report.kpis.guest}`);
    lines.push(`Crew issues: ${report.kpis.crew}`);
    lines.push(`Resolved: ${report.kpis.resolved}`);
    lines.push("");
    lines.push("BY DEPARTMENT");
    Object.entries(report.byDept).forEach(([k, v]) => lines.push(`  ${k}: ${v}`));
    lines.push("");
    lines.push("TOP ISSUES");
    (report.topIssues as [string, number][]).forEach(([k, v]) => lines.push(`  ${k}: ${v}`));
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aura-seas-report-${from}-to-${to}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div>
          <Label className="text-xs">Department</Label>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="IT">IT</SelectItem>
              <SelectItem value="HR">HR</SelectItem>
              <SelectItem value="Finance">Finance</SelectItem>
              <SelectItem value="Operations">Operations</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={generate} disabled={busy}>{busy ? "Generating..." : "Generate report"}</Button>
        {report ? <Button variant="outline" onClick={exportText}><Download className="h-4 w-4 mr-1.5" />Export</Button> : null}
      </Card>

      {report ? (
        <Card className="p-6 space-y-4">
          <header>
            <h3 className="text-lg font-semibold tracking-tight">Operational report</h3>
            <p className="text-xs text-muted-foreground">{from} — {to}</p>
          </header>
          <section>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Executive summary</h4>
            <p className="text-sm whitespace-pre-wrap">{report.summary}</p>
          </section>
          <section className="grid gap-3 sm:grid-cols-4">
            <Kpi label="Total" value={report.kpis.total} />
            <Kpi label="Guest" value={report.kpis.guest} />
            <Kpi label="Crew" value={report.kpis.crew} />
            <Kpi label="Resolved" value={report.kpis.resolved} />
          </section>
          <section>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Department breakdown</h4>
            <ul className="text-sm space-y-1">
              {Object.entries(report.byDept).map(([k, v]) => <li key={k}>{k}: <strong>{v as number}</strong></li>)}
            </ul>
          </section>
          <section>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Top issues</h4>
            <ul className="text-sm space-y-1">
              {(report.topIssues as [string, number][]).map(([k, v]) => <li key={k}>{k}: <strong>{v}</strong></li>)}
            </ul>
          </section>
        </Card>
      ) : null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border rounded-md p-3">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
