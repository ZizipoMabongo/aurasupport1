import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getAnalytics } from "@/lib/analytics.functions";
import { Card } from "@/components/ui/card";
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function fmtMs(ms: number): string {
  if (!ms) return "—";
  const min = ms / 60000;
  if (min < 60) return `${Math.round(min * 10) / 10} min`;
  const hr = min / 60;
  if (hr < 24) return `${Math.round(hr * 10) / 10} hr`;
  return `${Math.round((hr / 24) * 10) / 10} d`;
}

export function AnalyticsPanel() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const fn = useServerFn(getAnalytics);

  useEffect(() => {
    fn({ data: undefined as never })
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <Card className="p-8 text-center text-sm text-muted-foreground">Loading analytics...</Card>;
  if (!data) return <Card className="p-8 text-center text-sm text-destructive">Could not load analytics.</Card>;

  const deptData = Object.entries(data.byDept as Record<string, number>).map(([name, value]) => ({ name, value }));
  const statusData = Object.entries(data.byStatus as Record<string, number>).map(([name, value]) => ({ name, value }));
  const priorityData = Object.entries(data.byPriority as Record<string, number>).map(([name, value]) => ({ name, value }));
  const sourceData = [
    { name: "Guest", value: data.totals.guest },
    { name: "Crew", value: data.totals.crew },
  ];

  const exportCSV = () => {
    const rows: (string | number)[][] = [
      ["Aura Seas — Analytics export"],
      ["Generated", new Date().toISOString()],
      [],
      ["KPI", "Value"],
      ["Today's tickets", data.todayCount],
      ["Open tickets (7d)", data.openCount],
      ["Escalated (7d)", data.escalatedCount],
      ["Urgent (7d)", data.urgentCount],
      ["Avg first response", fmtMs(data.avgResponseMs)],
      ["Avg resolution time", fmtMs(data.avgResolveMs)],
      ["Resolution rate (%)", data.resolutionRate],
      ["SLA met (%)", data.slaRate],
      [],
      ["Department", "Count"],
      ...deptData.map((d) => [d.name, d.value]),
      [],
      ["Status", "Count"],
      ...statusData.map((d) => [d.name, d.value]),
      [],
      ["Priority", "Count"],
      ...priorityData.map((d) => [d.name, d.value]),
      [],
      ["Date", "Created", "Resolved"],
      ...(data.trend as Array<{ date: string; created: number; resolved: number }>).map((t) => [t.date, t.created, t.resolved]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aura-seas-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Operations overview</h2>
          <p className="text-xs text-muted-foreground">Rolling 7-day window. SLA targets: Urgent 15m · High 1h · Medium 4h · Low 24h.</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Today's tickets" value={data.todayCount} />
        <Kpi label="Open" value={data.openCount} />
        <Kpi label="Escalated" value={data.escalatedCount} />
        <Kpi label="Urgent" value={data.urgentCount} />
        <Kpi label="Avg first response" value={fmtMs(data.avgResponseMs)} />
        <Kpi label="Avg resolution time" value={fmtMs(data.avgResolveMs)} />
        <Kpi label="Resolution rate" value={`${data.resolutionRate}%`} />
        <Kpi label="SLA met" value={`${data.slaRate}%`} accent={data.slaRate >= 80 ? "good" : data.slaRate >= 60 ? "warn" : "bad"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 lg:col-span-2">
          <h3 className="font-medium mb-3">7-day trend</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Legend />
              <Line type="monotone" dataKey="created" name="Created" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="resolved" name="Resolved" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="font-medium mb-3">Volume by department</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={deptData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Bar dataKey="value" name="Tickets" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="font-medium mb-3">Status distribution</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85} paddingAngle={2}>
                {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Legend />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="font-medium mb-3">Priority mix</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={priorityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Bar dataKey="value" name="Tickets" fill="var(--chart-3)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="font-medium mb-3">Guest issues vs Crew issues</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={sourceData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
              <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={12} width={80} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Bar dataKey="value" name="Tickets" fill="var(--chart-2)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2">
            Guest issues include guest submissions and crew submissions on behalf of guests. Crew issues are personal crew requests.
          </p>
        </Card>

        <Card className="p-5">
          <h3 className="font-medium mb-3">Top subcategories</h3>
          {(data.topIssues as [string, number][]).length === 0 ? (
            <p className="text-sm text-muted-foreground">No data.</p>
          ) : (
            <ul className="space-y-2">
              {(data.topIssues as [string, number][]).map(([k, v]) => {
                const max = (data.topIssues as [string, number][])[0][1] || 1;
                return (
                  <li key={k} className="text-sm">
                    <div className="flex justify-between mb-1">
                      <span>{k}</span>
                      <span className="text-muted-foreground tabular-nums">{v}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${(v / max) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: React.ReactNode; accent?: "good" | "warn" | "bad" }) {
  const accentCls =
    accent === "good" ? "text-emerald-600" :
    accent === "warn" ? "text-amber-600" :
    accent === "bad" ? "text-destructive" : "";
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-semibold tracking-tight mt-1 ${accentCls}`}>{value}</p>
    </Card>
  );
}
