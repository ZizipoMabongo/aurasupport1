import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generatePrediction, listPredictions } from "@/lib/predictions.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Sparkles, TrendingUp, TrendingDown, AlertTriangle, ShieldCheck } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend, Area, ComposedChart,
} from "recharts";

interface DeptForecast {
  department: string;
  history: { date: string; count: number }[];
  forecast: { date: string; predicted: number; lower: number; upper: number }[];
  weeklyAvg: number;
  trend: number;
  confidence: number;
  slaRisk: "low" | "medium" | "high";
  riskReason: string;
}
interface Prediction {
  id: string;
  generated_at: string;
  generated_by_name: string | null;
  horizon_days: number;
  history_days: number;
  total_history: number;
  confidence: number;
  notes: string | null;
  forecast: {
    overall: { history: { date: string; count: number }[]; forecast: { date: string; predicted: number; lower: number; upper: number }[] };
    departments: DeptForecast[];
  };
  sla_risk: { high: string[]; medium: string[]; surgeDays: string[] };
}

export function PredictionsPanel() {
  const [current, setCurrent] = useState<Prediction | null>(null);
  const [history, setHistory] = useState<Prediction[]>([]);
  const [horizon, setHorizon] = useState("7");
  const [busy, setBusy] = useState(false);
  const gen = useServerFn(generatePrediction);
  const list = useServerFn(listPredictions);

  const load = async () => {
    const rows = (await list({ data: undefined as never })) as unknown as Prediction[];
    setHistory(rows);
    if (rows.length && !current) setCurrent(rows[0]);
  };
  useEffect(() => { load().catch(() => {}); }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const p = (await gen({ data: { horizon_days: parseInt(horizon, 10) } })) as Prediction;
      setCurrent(p);
      await load();
      toast.success("Forecast generated");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-5 flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Predictive Insights
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Forecasts ticket volume, department workload, and SLA risk from the last 60 days of operations.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Horizon</label>
            <Select value={horizon} onValueChange={setHorizon}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Next 3 days</SelectItem>
                <SelectItem value="7">Next 7 days</SelectItem>
                <SelectItem value="14">Next 14 days</SelectItem>
                <SelectItem value="30">Next 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={generate} disabled={busy}>{busy ? "Generating..." : "Generate forecast"}</Button>
        </div>
      </Card>

      {!current ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No forecasts yet. Click "Generate forecast" to build one from current data.
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Forecast confidence" value={`${Math.round(current.confidence * 100)}%`} tone={current.confidence >= 0.7 ? "good" : current.confidence >= 0.5 ? "warn" : "bad"} />
            <Metric label="Horizon" value={`${current.horizon_days} days`} />
            <Metric label="Training data" value={`${current.total_history} tickets`} />
            <Metric
              label="SLA risk"
              value={current.sla_risk.high.length ? `${current.sla_risk.high.length} dept at risk` : "All within capacity"}
              tone={current.sla_risk.high.length ? "bad" : current.sla_risk.medium.length ? "warn" : "good"}
            />
          </div>

          {(current.sla_risk.high.length > 0 || current.sla_risk.surgeDays.length > 0) && (
            <Card className="p-5 border-amber-300 bg-amber-50/50">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-900">SLA risk indicator</p>
                  {current.sla_risk.high.length > 0 && (
                    <p className="text-amber-800 mt-1">
                      High risk: {current.sla_risk.high.join(", ")} — projected workload likely to exceed current resolution throughput.
                    </p>
                  )}
                  {current.sla_risk.medium.length > 0 && (
                    <p className="text-amber-800 mt-1">
                      Medium risk: {current.sla_risk.medium.join(", ")} — monitor closely.
                    </p>
                  )}
                  {current.sla_risk.surgeDays.length > 0 && (
                    <p className="text-amber-800 mt-1">
                      Possible surge on: {current.sla_risk.surgeDays.join(", ")}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          )}

          <Card className="p-5">
            <h3 className="font-medium mb-1">Ticket volume forecast</h3>
            <p className="text-xs text-muted-foreground mb-3">Historical (last 30 days) vs predicted next {current.horizon_days} days.</p>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={buildOverallSeries(current)}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Legend />
                <Area type="monotone" dataKey="band" name="Confidence band" fill="var(--chart-3)" stroke="none" fillOpacity={0.15} />
                <Line type="monotone" dataKey="actual" name="Actual" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="predicted" name="Predicted" stroke="var(--chart-2)" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-5">
            <h3 className="font-medium mb-3">Department workload forecast</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={current.forecast.departments.map((d) => ({
                department: d.department,
                projected: Math.round(d.forecast.reduce((a, p) => a + p.predicted, 0)),
                weeklyAvg: d.weeklyAvg * 7,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="department" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Legend />
                <Bar dataKey="weeklyAvg" name="Recent weekly" fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="projected" name={`Next ${current.horizon_days}d projection`} fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {current.forecast.departments.map((d) => (
              <Card key={d.department} className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">{d.department}</h4>
                  <RiskBadge level={d.slaRisk} />
                </div>
                <div className="flex items-baseline gap-3 mb-3">
                  <span className="text-2xl font-semibold tabular-nums">{Math.round(d.forecast.reduce((a, p) => a + p.predicted, 0))}</span>
                  <span className="text-xs text-muted-foreground">projected over {current.horizon_days}d</span>
                  <span className={`text-xs flex items-center gap-1 ${d.trend > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                    {d.trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {d.trend > 0 ? "+" : ""}{d.trend}% vs prev week
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{d.riskReason}</p>
                <p className="text-xs">Confidence: <span className="font-medium">{Math.round(d.confidence * 100)}%</span></p>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={[...d.history.slice(-14).map((h) => ({ date: h.date.slice(5), actual: h.count })), ...d.forecast.map((f) => ({ date: f.date.slice(5), predicted: f.predicted }))]}>
                    <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} />
                    <YAxis hide />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                    <Line type="monotone" dataKey="actual" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="predicted" stroke="var(--chart-2)" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            ))}
          </div>

          {history.length > 1 && (
            <Card className="p-5">
              <h3 className="font-medium mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Prediction history</h3>
              <ul className="divide-y text-sm">
                {history.map((h) => (
                  <li key={h.id} className="py-2 flex justify-between items-center gap-3">
                    <div>
                      <p className="font-medium">{new Date(h.generated_at).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{h.horizon_days}-day horizon · {h.total_history} tickets · by {h.generated_by_name ?? "system"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{Math.round(h.confidence * 100)}% conf</Badge>
                      <Button variant="ghost" size="sm" onClick={() => setCurrent(h)}>View</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function buildOverallSeries(p: Prediction) {
  const hist = p.forecast.overall.history.slice(-30).map((h) => ({ date: h.date.slice(5), actual: h.count, predicted: null as number | null, band: null as number | null }));
  const fc = p.forecast.overall.forecast.map((f) => ({ date: f.date.slice(5), actual: null as number | null, predicted: f.predicted, band: [f.lower, f.upper] as unknown as number }));
  return [...hist, ...fc];
}

function Metric({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "good" | "warn" | "bad" }) {
  const cls = tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : tone === "bad" ? "text-destructive" : "";
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-semibold tracking-tight mt-1 ${cls}`}>{value}</p>
    </Card>
  );
}

function RiskBadge({ level }: { level: "low" | "medium" | "high" }) {
  if (level === "high") return <Badge className="bg-destructive text-destructive-foreground">High risk</Badge>;
  if (level === "medium") return <Badge className="bg-amber-500 text-white">Medium</Badge>;
  return <Badge variant="outline" className="border-emerald-500 text-emerald-700">Low</Badge>;
}
