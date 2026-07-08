import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { getAnalystWorkload, listLowConfidenceQueue } from "@/lib/analyst-workspace.functions";
import { Sparkles, Users } from "lucide-react";
import { fmt, priorityClasses } from "@/lib/format";

export function AnalystWorkspacePanel() {
  const workloadFn = useServerFn(getAnalystWorkload);
  const queueFn = useServerFn(listLowConfidenceQueue);
  const [workload, setWorkload] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([workloadFn(), queueFn()])
      .then(([w, q]) => {
        setWorkload(w as any[]);
        setQueue(q as any[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Workload dashboard */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Analyst workload</h3>
        </div>
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : workload.length === 0 ? (
          <p className="text-xs text-muted-foreground">No analysts configured yet.</p>
        ) : (
          <div className="space-y-2">
            {workload.map((a) => (
              <div key={a.user_id} className="rounded border p-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${a.online ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                    <span className="font-medium">{a.name}</span>
                    {a.department ? <span className="text-xs text-muted-foreground">· {a.department}</span> : null}
                  </div>
                  <span className="text-xs text-muted-foreground">{a.active}/{a.max_concurrent} active</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full ${a.utilization > 85 ? "bg-destructive" : a.utilization > 60 ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${a.utilization}%` }}
                  />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <span>Urgent: <strong className="text-foreground">{a.urgent}</strong></span>
                  <span>High: <strong className="text-foreground">{a.high}</strong></span>
                  <span>Resolved 24h: <strong className="text-foreground">{a.resolved_24h}</strong></span>
                  {a.skills?.length ? <span>Skills: {a.skills.slice(0, 3).join(", ")}</span> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Low-confidence review queue */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Low-confidence review queue</h3>
        </div>
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : queue.length === 0 ? (
          <p className="text-xs text-muted-foreground">No low-confidence classifications right now. 🎉</p>
        ) : (
          <div className="space-y-2">
            {queue.map((t) => (
              <Link
                key={t.id}
                to="/staff/ticket/$id"
                params={{ id: t.id }}
                className="block rounded border p-2 hover:bg-accent"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">{t.ticket_number}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${priorityClasses(t.priority)}`}>{t.priority}</span>
                </div>
                <p className="text-sm line-clamp-2 mt-1">{t.description}</p>
                <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>{t.department} · {t.subcategory}</span>
                  <span className="text-amber-600 font-medium">{Math.round((t.confidence ?? 0) * 100)}% conf</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{fmt(t.created_at)}</p>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
