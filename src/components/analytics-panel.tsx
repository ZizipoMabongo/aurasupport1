import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getAnalytics } from "@/lib/analytics.functions";
import { Card } from "@/components/ui/card";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function AnalyticsPanel() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const fn = useServerFn(getAnalytics);

  useEffect(() => {
    fn({ data: undefined as never }).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <Card className="p-8 text-center text-sm text-muted-foreground">Loading analytics...</Card>;
  if (!data) return <Card className="p-8 text-center text-sm text-destructive">Could not load analytics.</Card>;

  const deptData = Object.entries(data.byDept as Record<string, number>).map(([name, value]) => ({ name, value }));
  const statusData = Object.entries(data.byStatus as Record<string, number>).map(([name, value]) => ({ name, value }));
  const sourceData = [
    { name: "Guest", value: data.totals.guest },
    { name: "Crew", value: data.totals.crew },
  ];

  const avgMin = Math.round((data.avgResponseMs / 60000) * 10) / 10;

  const exportCSV = () => {
    const rows = [
      ["Metric", "Value"],
      ["Today's tickets", data.todayCount],
      ["Avg response (min)", avgMin],
      ["Urgent tickets", data.urgentCount],
      ["Resolution rate (%)", data.resolutionRate],
      [],
      ["Department", "Count"],
      ...deptData.map((d) => [d.name, d.value]),
      [],
      ["Status", "Count"],
      ...statusData.map((d) => [d.name, d.value]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
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
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Operations overview</h2>
        <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Today's tickets" value={data.todayCount} />
        <Kpi label="Avg response" value={`${avgMin} min`} />
        <Kpi label="Urgent" value={data.urgentCount} />
        <Kpi label="Resolution rate" value={`${data.resolutionRate}%`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-medium mb-3">Volume by department</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={deptData}>
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip />
              <Bar dataKey="value" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <h3 className="font-medium mb-3">Status distribution</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
                {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <h3 className="font-medium mb-3">Guest issues vs Crew issues</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sourceData} layout="vertical">
              <XAxis type="number" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={12} width={80} />
              <Tooltip />
              <Bar dataKey="value" fill="var(--chart-2)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2">
            Guest issues include guest submissions and crew submissions on behalf of guests. Crew issues are personal crew requests.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-semibold tracking-tight mt-1">{value}</p>
    </Card>
  );
}
