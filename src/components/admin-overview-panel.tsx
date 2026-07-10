import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getAdminOverview } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  ShieldAlert,
  Users,
  Bot,
  Sparkles,
  Activity,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Overview {
  alerts: Array<{ severity: "critical" | "warning"; title: string; detail: string; ticket_id?: string }>;
  analysts: Array<{ user_id: string; online: boolean; department: string | null; capacity: number; load: number; util: number }>;
  staffing: Array<{ department: string; open: number; capacity: number; online: number; recommendation: string; severity: "ok" | "warn" | "critical" }>;
  automation: {
    eventsWeek: number;
    eventsToday: number;
    eventCounts: Record<string, number>;
    decisionsWeek: number;
    decisionsFlagged: number;
    decisionsPending: number;
    pendingApprovals: number;
  };
  openCount: number;
}

export function AdminOverviewPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const load = useServerFn(getAdminOverview);

  const refresh = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await load({ data: undefined as never });
      setData(r as Overview);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 45_000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (err) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Couldn't load overview</AlertTitle>
        <AlertDescription className="flex items-center gap-3">
          {err}
          <Button size="sm" variant="outline" onClick={refresh}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;
  const criticals = data.alerts.filter((a) => a.severity === "critical");
  const warnings = data.alerts.filter((a) => a.severity === "warning");

  return (
    <div className="space-y-5">
      {/* Critical alerts */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-destructive" />
            <h2 className="font-semibold">Critical alerts</h2>
            {criticals.length > 0 && <Badge variant="destructive">{criticals.length}</Badge>}
          </div>
          <Button size="sm" variant="ghost" onClick={refresh} aria-label="Refresh overview">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        {data.alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            All clear — no urgent items right now.
          </p>
        ) : (
          <div className="space-y-2">
            {[...criticals, ...warnings].slice(0, 8).map((a, i) => (
              <div
                key={i}
                className={`flex items-start justify-between gap-3 rounded-md border p-3 ${
                  a.severity === "critical"
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-amber-500/30 bg-amber-500/5"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">{a.detail}</p>
                </div>
                {a.ticket_id ? (
                  <Link
                    to="/staff/ticket/$id"
                    params={{ id: a.ticket_id }}
                    className="text-xs text-primary hover:underline shrink-0 self-center"
                  >
                    Open →
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<Activity className="h-4 w-4" />} label="Open tickets" value={data.openCount} />
        <Kpi
          icon={<Sparkles className="h-4 w-4" />}
          label="Automation events (7d)"
          value={data.automation.eventsWeek}
          hint={`${data.automation.eventsToday} today`}
        />
        <Kpi
          icon={<Bot className="h-4 w-4" />}
          label="AI decisions (7d)"
          value={data.automation.decisionsWeek}
          hint={`${data.automation.decisionsPending} pending review`}
        />
        <Kpi
          icon={<Users className="h-4 w-4" />}
          label="Approvals pending"
          value={data.automation.pendingApprovals}
        />
      </div>

      {/* Staffing */}
      <Card className="p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Users className="h-4 w-4" /> Staffing recommendations
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {data.staffing.map((s) => (
            <div key={s.department} className="border rounded-md p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-medium">{s.department}</span>
                <Badge
                  variant={s.severity === "critical" ? "destructive" : "outline"}
                  className={s.severity === "warn" ? "border-amber-500/40 text-amber-700 dark:text-amber-300" : ""}
                >
                  {s.severity === "ok" ? "OK" : s.severity === "warn" ? "Watch" : "Action needed"}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mb-2">
                {s.open} open · {s.online} online · capacity {s.capacity}
              </div>
              <Progress value={s.capacity ? Math.min(100, (s.open / s.capacity) * 100) : 0} className="h-1.5" />
              <p className="text-xs mt-2">{s.recommendation}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Automation metrics */}
      <Card className="p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> Automation metrics (last 7 days)
        </h2>
        {Object.keys(data.automation.eventCounts).length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No automation activity yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.automation.eventCounts).map(([k, v]) => (
              <div key={k} className="border rounded-md px-3 py-1.5 text-xs">
                <span className="font-mono mr-1.5 text-muted-foreground">{k}</span>
                <span className="font-semibold">{v}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>Flagged AI decisions: <span className="font-semibold text-foreground">{data.automation.decisionsFlagged}</span></span>
          <span>Awaiting review: <span className="font-semibold text-foreground">{data.automation.decisionsPending}</span></span>
        </div>
      </Card>
    </div>
  );
}

function Kpi({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: number; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-2xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </Card>
  );
}
