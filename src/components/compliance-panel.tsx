import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listAiDecisions, reviewAiDecision, getRiskReport, logRiskReportEvent } from "@/lib/compliance.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ShieldAlert, FileText, Download, CheckCircle2, XCircle, AlertTriangle, Eye } from "lucide-react";
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";

interface AiDecision {
  id: string;
  created_at: string;
  decision_type: string;
  ticket_id: string | null;
  prediction_id: string | null;
  model: string | null;
  confidence: number;
  input_summary: string | null;
  output_summary: string | null;
  explanation: string | null;
  flags: string[];
  needs_review: boolean;
  review_status: string;
  reviewed_by_name: string | null;
  reviewer_comment: string | null;
  reviewed_at: string | null;
}

interface RiskReport {
  period: { from: string; to: string };
  totals: { total: number; flagged: number; avgConfidence: number; flagRate: number; reviewRate: number; complianceStatus: string };
  byType: Record<string, number>;
  confidenceBuckets: Record<string, number>;
  flagCounts: Record<string, number>;
  reviewOutcomes: Record<string, number>;
  overrides: Array<{ id: string; decision_type: string; comment: string | null; reviewer: string | null; created_at: string }>;
  highRisk: AiDecision[];
  transparency: string;
}

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function CompliancePanel() {
  const [decisions, setDecisions] = useState<AiDecision[]>([]);
  const list = useServerFn(listAiDecisions);
  const review = useServerFn(reviewAiDecision);
  const reportFn = useServerFn(getRiskReport);
  const logEvent = useServerFn(logRiskReportEvent);

  const [reviewTarget, setReviewTarget] = useState<AiDecision | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "override" | "reject">("approve");
  const [reviewComment, setReviewComment] = useState("");
  const [busy, setBusy] = useState(false);

  const [from, setFrom] = useState(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<RiskReport | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const load = async () => {
    const rows = (await list({ data: { scope: "all", limit: 200 } })) as AiDecision[];
    setDecisions(rows);
  };
  useEffect(() => { load().catch(() => {}); }, []);

  const queue = useMemo(() => decisions.filter((d) => d.needs_review && d.review_status === "pending"), [decisions]);
  const reviewed = useMemo(() => decisions.filter((d) => ["approved", "overridden", "rejected"].includes(d.review_status)), [decisions]);
  const flagged = useMemo(() => decisions.filter((d) => d.flags?.length > 0), [decisions]);

  const overview = useMemo(() => {
    const total = decisions.length || 1;
    const avgConf = decisions.length ? Math.round(decisions.reduce((a, d) => a + Number(d.confidence ?? 0), 0) / decisions.length * 100) : 0;
    return {
      total: decisions.length,
      avgConf,
      flagged: flagged.length,
      queue: queue.length,
      flagRate: Math.round((flagged.length / total) * 100),
    };
  }, [decisions, flagged, queue]);

  const openReview = (d: AiDecision, action: "approve" | "override" | "reject") => {
    setReviewTarget(d);
    setReviewAction(action);
    setReviewComment("");
  };

  const submitReview = async () => {
    if (!reviewTarget) return;
    if (reviewComment.trim().length < 3) { toast.error("Please provide a comment"); return; }
    setBusy(true);
    try {
      await review({ data: { id: reviewTarget.id, action: reviewAction, comment: reviewComment.trim() } });
      toast.success(`Decision ${reviewAction}d`);
      setReviewTarget(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  const generateReport = async () => {
    setReportBusy(true);
    try {
      const r = (await reportFn({
        data: { from: new Date(from).toISOString(), to: new Date(to + "T23:59:59").toISOString() },
      })) as RiskReport;
      setReport(r);
      setPreviewOpen(true);
      await logEvent({ data: { action: "previewed", period_from: from, period_to: to } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setReportBusy(false); }
  };

  const downloadPDF = async () => {
    if (!report) return;
    setReportBusy(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTableMod = await import("jspdf-autotable");
      const autoTable: any = (autoTableMod as any).default ?? autoTableMod;
      const doc = new jsPDF({ unit: "pt", format: "letter" });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 48;
      const navy: [number, number, number] = [15, 52, 96];
      const muted: [number, number, number] = [100, 116, 139];

      doc.setFillColor(...navy);
      doc.rect(0, 0, pageW, 90, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text("AURA SEAS", margin, 42);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text("AI Risk & Compliance Evaluation Report", margin, 62);
      doc.setFontSize(9);
      doc.text(`${from} to ${to}  ·  ${report.totals.total} AI decisions reviewed`, margin, 78);

      let y = 120;
      doc.setTextColor(...navy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("Compliance status", margin, y);
      y += 8;
      doc.setDrawColor(...navy);
      doc.line(margin, y, margin + 110, y);
      y += 18;
      doc.setFontSize(18);
      doc.text(report.totals.complianceStatus, margin, y);
      y += 24;

      const kpis: Array<[string, string]> = [
        ["Total AI decisions", String(report.totals.total)],
        ["Avg confidence", `${report.totals.avgConfidence}%`],
        ["Flag rate", `${report.totals.flagRate}%`],
        ["High-risk items", String(report.totals.flagged)],
        ["Review completion", `${report.totals.reviewRate}%`],
        ["Overrides", String(report.reviewOutcomes.overridden ?? 0)],
      ];
      const colW = (pageW - margin * 2) / 3;
      const rowH = 56;
      kpis.forEach((k, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = margin + col * colW;
        const yy = y + row * rowH;
        doc.setDrawColor(220, 226, 235);
        doc.setFillColor(247, 250, 254);
        doc.roundedRect(x + 4, yy, colW - 8, rowH - 8, 6, 6, "FD");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...muted);
        doc.text(k[0].toUpperCase(), x + 14, yy + 16);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.setTextColor(...navy);
        doc.text(k[1], x + 14, yy + 38);
      });
      y += Math.ceil(kpis.length / 3) * rowH + 10;

      const tableHead = { fillColor: navy, textColor: 255, fontStyle: "bold" as const };

      autoTable(doc, {
        startY: y,
        head: [["Decision type", "Count"]],
        body: Object.entries(report.byType).map(([k, v]) => [k, String(v)]),
        margin: { left: margin, right: margin }, styles: { fontSize: 10, cellPadding: 6 }, headStyles: tableHead, theme: "grid",
      });
      y = (doc as any).lastAutoTable.finalY + 14;

      autoTable(doc, {
        startY: y,
        head: [["Confidence range", "Decisions"]],
        body: Object.entries(report.confidenceBuckets).map(([k, v]) => [k, String(v)]),
        margin: { left: margin, right: margin }, styles: { fontSize: 10, cellPadding: 6 }, headStyles: tableHead, theme: "grid",
      });
      y = (doc as any).lastAutoTable.finalY + 14;

      autoTable(doc, {
        startY: y,
        head: [["Bias / risk flag", "Occurrences"]],
        body: Object.keys(report.flagCounts).length ? Object.entries(report.flagCounts).map(([k, v]) => [k, String(v)]) : [["No bias or risk flags detected", "0"]],
        margin: { left: margin, right: margin }, styles: { fontSize: 10, cellPadding: 6 }, headStyles: tableHead, theme: "grid",
      });
      y = (doc as any).lastAutoTable.finalY + 14;

      autoTable(doc, {
        startY: y,
        head: [["Review outcome", "Count"]],
        body: Object.entries(report.reviewOutcomes).map(([k, v]) => [k, String(v)]),
        margin: { left: margin, right: margin }, styles: { fontSize: 10, cellPadding: 6 }, headStyles: tableHead, theme: "grid",
      });
      y = (doc as any).lastAutoTable.finalY + 14;

      if (report.overrides.length) {
        autoTable(doc, {
          startY: y,
          head: [["Override reason", "Reviewer", "Date"]],
          body: report.overrides.map((o) => [o.comment ?? "—", o.reviewer ?? "—", new Date(o.created_at).toLocaleDateString()]),
          margin: { left: margin, right: margin }, styles: { fontSize: 9, cellPadding: 5 }, headStyles: tableHead, theme: "grid",
        });
        y = (doc as any).lastAutoTable.finalY + 14;
      }

      if (y > 680) { doc.addPage(); y = 60; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...navy);
      doc.text("Transparency notes", margin, y);
      y += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(33, 33, 33);
      const lines = doc.splitTextToSize(report.transparency, pageW - margin * 2);
      doc.text(lines, margin, y);

      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(...muted);
        doc.text(`Aura Seas · AI Risk Report · ${new Date().toLocaleString()}`, margin, doc.internal.pageSize.getHeight() - 20);
        doc.text(`Page ${i} of ${pageCount}`, pageW - margin, doc.internal.pageSize.getHeight() - 20, { align: "right" });
      }

      doc.save(`aura-seas-ai-risk-report-${from}-to-${to}.pdf`);
      await logEvent({ data: { action: "downloaded", period_from: from, period_to: to } });
      toast.success("Report downloaded");
    } catch (e) {
      toast.error("Could not generate PDF");
      console.error(e);
    } finally { setReportBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="AI decisions" value={overview.total} />
        <Metric label="Avg confidence" value={`${overview.avgConf}%`} tone={overview.avgConf >= 75 ? "good" : overview.avgConf >= 60 ? "warn" : "bad"} />
        <Metric label="Flag rate" value={`${overview.flagRate}%`} tone={overview.flagRate <= 5 ? "good" : overview.flagRate <= 15 ? "warn" : "bad"} />
        <Metric label="Review queue" value={overview.queue} tone={overview.queue === 0 ? "good" : overview.queue < 5 ? "warn" : "bad"} />
        <Metric label="Flagged total" value={overview.flagged} />
      </div>

      <Tabs defaultValue="queue">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="queue">Review queue {queue.length > 0 ? <Badge className="ml-2" variant="secondary">{queue.length}</Badge> : null}</TabsTrigger>
          <TabsTrigger value="monitoring">Confidence monitoring</TabsTrigger>
          <TabsTrigger value="bias">Bias alerts {flagged.length > 0 ? <Badge className="ml-2" variant="secondary">{flagged.length}</Badge> : null}</TabsTrigger>
          <TabsTrigger value="audit">Decision log</TabsTrigger>
          <TabsTrigger value="report">Risk report</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4 space-y-3">
          {queue.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">Queue empty. All AI decisions are either auto-approved or already reviewed.</Card>
          ) : queue.map((d) => <DecisionCard key={d.id} d={d} onApprove={() => openReview(d, "approve")} onOverride={() => openReview(d, "override")} onReject={() => openReview(d, "reject")} />)}
        </TabsContent>

        <TabsContent value="monitoring" className="mt-4 space-y-4">
          <Card className="p-5">
            <h3 className="font-medium mb-3">Confidence distribution</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={confBuckets(decisions)}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="bucket" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Bar dataKey="count" name="Decisions" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card className="p-5">
            <h3 className="font-medium mb-3">Decision mix</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={typeBreakdown(decisions)} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85} paddingAngle={2}>
                  {typeBreakdown(decisions).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </TabsContent>

        <TabsContent value="bias" className="mt-4 space-y-3">
          {flagged.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">No bias or risk flags detected in the most recent decisions.</Card>
          ) : flagged.map((d) => <DecisionCard key={d.id} d={d} onApprove={() => openReview(d, "approve")} onOverride={() => openReview(d, "override")} onReject={() => openReview(d, "reject")} />)}
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-3 font-medium">Time</th>
                  <th className="p-3 font-medium">Type</th>
                  <th className="p-3 font-medium">Confidence</th>
                  <th className="p-3 font-medium">Flags</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Reviewer</th>
                </tr>
              </thead>
              <tbody>
                {decisions.slice(0, 100).map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="p-3 text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()}</td>
                    <td className="p-3 capitalize">{d.decision_type}</td>
                    <td className="p-3 tabular-nums">{Math.round(Number(d.confidence) * 100)}%</td>
                    <td className="p-3">{d.flags?.length ? d.flags.join(", ") : "—"}</td>
                    <td className="p-3">{statusBadge(d.review_status)}</td>
                    <td className="p-3 text-xs">{d.reviewed_by_name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {reviewed.length === 0 && decisions.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">No AI decisions yet.</p>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="report" className="mt-4 space-y-3">
          <Card className="p-5 flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <Button onClick={generateReport} disabled={reportBusy}>
              <FileText className="h-4 w-4 mr-1.5" /> {reportBusy ? "Generating..." : "Generate report"}
            </Button>
            {report && (
              <>
                <Button variant="outline" onClick={() => setPreviewOpen(true)}>
                  <Eye className="h-4 w-4 mr-1.5" /> Preview
                </Button>
                <Button variant="outline" onClick={downloadPDF} disabled={reportBusy}>
                  <Download className="h-4 w-4 mr-1.5" /> Download PDF
                </Button>
              </>
            )}
          </Card>
          {report && (
            <Card className="p-5">
              <h3 className="font-medium mb-2">Latest report</h3>
              <p className="text-sm text-muted-foreground">
                Period {report.period.from.slice(0, 10)} to {report.period.to.slice(0, 10)} · {report.totals.total} decisions ·
                <span className="ml-1 font-medium">Status: {report.totals.complianceStatus}</span>
              </p>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={reviewTarget !== null} onOpenChange={(o) => !o && setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{reviewAction} AI decision</DialogTitle>
          </DialogHeader>
          {reviewTarget && (
            <div className="space-y-3 text-sm">
              <div className="text-xs text-muted-foreground">
                {reviewTarget.decision_type} · {Math.round(Number(reviewTarget.confidence) * 100)}% confidence
                {reviewTarget.flags?.length ? ` · flags: ${reviewTarget.flags.join(", ")}` : ""}
              </div>
              <div>
                <Label className="text-xs">AI output</Label>
                <p className="text-sm bg-muted/40 rounded p-2 mt-1 whitespace-pre-wrap">{reviewTarget.output_summary}</p>
              </div>
              <div>
                <Label className="text-xs">Reviewer comment</Label>
                <Textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder={reviewAction === "override" ? "Explain your override decision..." : reviewAction === "reject" ? "Reason for rejecting this AI output..." : "Confirmation note..."} rows={4} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTarget(null)}>Cancel</Button>
            <Button onClick={submitReview} disabled={busy}>{busy ? "Saving..." : "Submit"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI Risk Evaluation Report — Preview</DialogTitle>
          </DialogHeader>
          {report && (
            <div className="space-y-5 text-sm">
              <div className="bg-primary text-primary-foreground p-5 rounded-md">
                <p className="text-xs uppercase tracking-[0.2em] opacity-80">Aura Seas</p>
                <h3 className="text-xl font-semibold mt-0.5">AI Risk & Compliance Report</h3>
                <p className="text-xs opacity-80 mt-1">{from} — {to}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <Metric label="Compliance" value={report.totals.complianceStatus} tone={report.totals.complianceStatus === "Healthy" ? "good" : report.totals.complianceStatus === "Monitor" ? "warn" : "bad"} />
                <Metric label="Decisions" value={report.totals.total} />
                <Metric label="Avg confidence" value={`${report.totals.avgConfidence}%`} />
                <Metric label="Flag rate" value={`${report.totals.flagRate}%`} />
                <Metric label="High-risk items" value={report.totals.flagged} />
                <Metric label="Overrides" value={report.reviewOutcomes.overridden ?? 0} />
              </div>
              <Section title="Confidence distribution" data={report.confidenceBuckets} />
              <Section title="Decision types" data={report.byType} />
              <Section title="Bias / risk flags" data={Object.keys(report.flagCounts).length ? report.flagCounts : { "No flags detected": 0 }} />
              <Section title="Review outcomes" data={report.reviewOutcomes} />
              {report.overrides.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Reviewer overrides</h4>
                  <ul className="space-y-2">
                    {report.overrides.map((o) => (
                      <li key={o.id} className="text-sm border rounded p-2">
                        <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()} · {o.reviewer}</p>
                        <p>{o.comment}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Transparency notes</h4>
                <p className="text-sm leading-relaxed">{report.transparency}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close preview</Button>
            <Button onClick={downloadPDF} disabled={reportBusy}>
              <Download className="h-4 w-4 mr-1.5" /> Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DecisionCard({ d, onApprove, onOverride, onReject }: { d: AiDecision; onApprove: () => void; onOverride: () => void; onReject: () => void }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="capitalize font-medium text-foreground">{d.decision_type}</span>
            <span>·</span>
            <span>{new Date(d.created_at).toLocaleString()}</span>
            <span>·</span>
            <span className="tabular-nums">{Math.round(Number(d.confidence) * 100)}% confidence</span>
          </div>
          {d.flags?.length > 0 && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {d.flags.map((f) => (
                <Badge key={f} variant="outline" className="border-amber-500 text-amber-700 gap-1">
                  <AlertTriangle className="h-3 w-3" />{f}
                </Badge>
              ))}
            </div>
          )}
        </div>
        {statusBadge(d.review_status)}
      </div>
      <div className="space-y-2 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Input</p>
          <p className="text-sm">{d.input_summary}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">AI output</p>
          <p className="text-sm bg-muted/40 rounded p-2 whitespace-pre-wrap">{d.output_summary}</p>
        </div>
        {d.explanation && (
          <div>
            <p className="text-xs text-muted-foreground">Why this decision</p>
            <p className="text-xs">{d.explanation}</p>
          </div>
        )}
      </div>
      <div className="flex gap-2 mt-3">
        <Button size="sm" variant="outline" onClick={onApprove}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Approve</Button>
        <Button size="sm" variant="outline" onClick={onOverride}><ShieldAlert className="h-3.5 w-3.5 mr-1" />Override</Button>
        <Button size="sm" variant="outline" onClick={onReject}><XCircle className="h-3.5 w-3.5 mr-1" />Reject</Button>
      </div>
    </Card>
  );
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

function Section({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data);
  const max = entries.reduce((m, [, v]) => Math.max(m, v), 0) || 1;
  return (
    <div>
      <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</h4>
      <ul className="space-y-1.5">
        {entries.map(([k, v]) => (
          <li key={k} className="text-sm">
            <div className="flex justify-between mb-1">
              <span className="capitalize">{k}</span>
              <span className="text-muted-foreground tabular-nums">{v}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${(v / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function statusBadge(status: string) {
  const map: Record<string, { cls: string; label: string }> = {
    pending: { cls: "bg-amber-500 text-white", label: "Pending review" },
    approved: { cls: "bg-emerald-600 text-white", label: "Approved" },
    overridden: { cls: "bg-blue-600 text-white", label: "Overridden" },
    rejected: { cls: "bg-destructive text-destructive-foreground", label: "Rejected" },
    "auto-approved": { cls: "bg-muted text-muted-foreground", label: "Auto-approved" },
  };
  const m = map[status] ?? map["auto-approved"];
  return <Badge className={m.cls}>{m.label}</Badge>;
}

function confBuckets(rows: AiDecision[]) {
  const buckets = [
    { bucket: "0-40%", min: 0, max: 0.4, count: 0 },
    { bucket: "40-60%", min: 0.4, max: 0.6, count: 0 },
    { bucket: "60-80%", min: 0.6, max: 0.8, count: 0 },
    { bucket: "80-100%", min: 0.8, max: 1.01, count: 0 },
  ];
  for (const r of rows) {
    const c = Number(r.confidence);
    const b = buckets.find((x) => c >= x.min && c < x.max);
    if (b) b.count++;
  }
  return buckets;
}

function typeBreakdown(rows: AiDecision[]) {
  const m: Record<string, number> = {};
  for (const r of rows) m[r.decision_type] = (m[r.decision_type] ?? 0) + 1;
  return Object.entries(m).map(([name, value]) => ({ name, value }));
}
