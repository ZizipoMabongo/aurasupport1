import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getReport } from "@/lib/analytics.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Download, FileText } from "lucide-react";

interface Report {
  tickets: any[];
  kpis: {
    total: number; guest: number; crew: number; resolved: number;
    rejected: number; escalated: number; avgResponseMin: number; avgResolveHr: number;
  };
  byDept: Record<string, number>;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  topIssues: [string, number][];
  summary: string;
}

export function ReportPanel() {
  const [from, setFrom] = useState(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [dept, setDept] = useState("all");
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const fn = useServerFn(getReport);

  const generate = async () => {
    setBusy(true);
    try {
      const r = (await fn({
        data: {
          from: new Date(from).toISOString(),
          to: new Date(to + "T23:59:59").toISOString(),
          department: dept,
        },
      })) as Report;
      setReport(r);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const exportCSV = () => {
    if (!report) return;
    const rows: (string | number)[][] = [
      ["Aura Seas — Operational report"],
      ["Period", `${from} to ${to}`],
      ["Department filter", dept === "all" ? "All" : dept],
      ["Generated", new Date().toISOString()],
      [],
      ["Executive summary"],
      [report.summary],
      [],
      ["KPI", "Value"],
      ["Total tickets", report.kpis.total],
      ["Guest issues", report.kpis.guest],
      ["Crew issues", report.kpis.crew],
      ["Resolved", report.kpis.resolved],
      ["Rejected", report.kpis.rejected],
      ["Escalated", report.kpis.escalated],
      ["Avg first response (min)", report.kpis.avgResponseMin],
      ["Avg resolution (hr)", report.kpis.avgResolveHr],
      [],
      ["Department", "Count"],
      ...Object.entries(report.byDept),
      [],
      ["Status", "Count"],
      ...Object.entries(report.byStatus),
      [],
      ["Priority", "Count"],
      ...Object.entries(report.byPriority),
      [],
      ["Top subcategories"],
      ...report.topIssues,
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aura-seas-report-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    if (!report) return;
    setBusy(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTableMod = await import("jspdf-autotable");
      const autoTable: any = (autoTableMod as any).default ?? autoTableMod;

      const doc = new jsPDF({ unit: "pt", format: "letter" });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 48;
      const navy: [number, number, number] = [15, 52, 96];
      const muted: [number, number, number] = [100, 116, 139];

      // Header band
      doc.setFillColor(...navy);
      doc.rect(0, 0, pageW, 90, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text("AURA SEAS", margin, 42);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text("Operational Report", margin, 62);
      doc.setFontSize(9);
      doc.text(
        `${from}  to  ${to}   ·   Department: ${dept === "all" ? "All" : dept}`,
        margin,
        78,
      );

      let y = 120;
      doc.setTextColor(...navy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("Executive summary", margin, y);
      y += 8;
      doc.setDrawColor(...navy);
      doc.setLineWidth(0.6);
      doc.line(margin, y, margin + 110, y);
      y += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(33, 33, 33);
      const summaryLines = doc.splitTextToSize(report.summary || "—", pageW - margin * 2);
      doc.text(summaryLines, margin, y);
      y += summaryLines.length * 13 + 14;

      // KPI grid
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...navy);
      doc.setFontSize(13);
      doc.text("Key metrics", margin, y);
      y += 8;
      doc.line(margin, y, margin + 90, y);
      y += 12;

      const kpis: Array<[string, string | number]> = [
        ["Total tickets", report.kpis.total],
        ["Guest issues", report.kpis.guest],
        ["Crew issues", report.kpis.crew],
        ["Resolved", report.kpis.resolved],
        ["Rejected", report.kpis.rejected],
        ["Escalated", report.kpis.escalated],
        ["Avg first response", `${report.kpis.avgResponseMin} min`],
        ["Avg resolution", `${report.kpis.avgResolveHr} hr`],
      ];
      const colW = (pageW - margin * 2) / 4;
      const rowH = 52;
      kpis.forEach((k, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
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
        doc.setFontSize(14);
        doc.setTextColor(...navy);
        doc.text(String(k[1]), x + 14, yy + 36);
      });
      y += Math.ceil(kpis.length / 4) * rowH + 6;

      const tableHead = { fillColor: navy, textColor: 255, fontStyle: "bold" as const };
      const tableTheme = "grid" as const;

      autoTable(doc, {
        startY: y,
        head: [["Department", "Tickets"]],
        body: Object.entries(report.byDept).map(([k, v]) => [k, String(v)]),
        margin: { left: margin, right: margin },
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: tableHead,
        theme: tableTheme,
      });
      y = (doc as any).lastAutoTable.finalY + 16;

      autoTable(doc, {
        startY: y,
        head: [["Status", "Tickets"]],
        body: Object.entries(report.byStatus).map(([k, v]) => [k, String(v)]),
        margin: { left: margin, right: margin },
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: tableHead,
        theme: tableTheme,
      });
      y = (doc as any).lastAutoTable.finalY + 16;

      autoTable(doc, {
        startY: y,
        head: [["Priority", "Tickets"]],
        body: Object.entries(report.byPriority).map(([k, v]) => [k, String(v)]),
        margin: { left: margin, right: margin },
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: tableHead,
        theme: tableTheme,
      });
      y = (doc as any).lastAutoTable.finalY + 16;

      autoTable(doc, {
        startY: y,
        head: [["Top subcategory", "Tickets"]],
        body: report.topIssues.length
          ? report.topIssues.map(([k, v]) => [k, String(v)])
          : [["—", "—"]],
        margin: { left: margin, right: margin },
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: tableHead,
        theme: tableTheme,
      });

      // Footer
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(...muted);
        doc.text(
          `Aura Seas · Generated ${new Date().toLocaleString()}`,
          margin,
          doc.internal.pageSize.getHeight() - 20,
        );
        doc.text(
          `Page ${i} of ${pageCount}`,
          pageW - margin,
          doc.internal.pageSize.getHeight() - 20,
          { align: "right" },
        );
      }

      doc.save(`aura-seas-report-${from}-to-${to}.pdf`);
    } catch (e) {
      console.error(e);
      toast.error("Could not generate PDF");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
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
        <Button onClick={generate} disabled={busy}>
          {busy ? "Generating..." : "Generate report"}
        </Button>
        {report ? (
          <>
            <Button variant="outline" onClick={exportPDF} disabled={busy}>
              <FileText className="h-4 w-4 mr-1.5" /> Export PDF
            </Button>
            <Button variant="outline" onClick={exportCSV} disabled={busy}>
              <Download className="h-4 w-4 mr-1.5" /> Export CSV
            </Button>
          </>
        ) : null}
      </Card>

      {report ? (
        <Card className="p-0 overflow-hidden">
          <div className="bg-primary text-primary-foreground px-6 py-5">
            <p className="text-xs uppercase tracking-[0.2em] opacity-80">Aura Seas</p>
            <h3 className="text-2xl font-semibold tracking-tight mt-0.5">Operational report</h3>
            <p className="text-xs opacity-80 mt-1">
              {from} — {to} · Department: {dept === "all" ? "All" : dept}
            </p>
          </div>

          <div className="p-6 space-y-6">
            <section>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Executive summary
              </h4>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{report.summary}</p>
            </section>

            <section className="grid gap-3 sm:grid-cols-4">
              <Kpi label="Total" value={report.kpis.total} />
              <Kpi label="Guest" value={report.kpis.guest} />
              <Kpi label="Crew" value={report.kpis.crew} />
              <Kpi label="Resolved" value={report.kpis.resolved} />
              <Kpi label="Rejected" value={report.kpis.rejected} />
              <Kpi label="Escalated" value={report.kpis.escalated} />
              <Kpi label="Avg response" value={`${report.kpis.avgResponseMin} min`} />
              <Kpi label="Avg resolution" value={`${report.kpis.avgResolveHr} hr`} />
            </section>

            <div className="grid gap-6 md:grid-cols-2">
              <Section title="By department" data={report.byDept} />
              <Section title="By status" data={report.byStatus} />
              <Section title="By priority" data={report.byPriority} />
              <Section title="Top subcategories" data={Object.fromEntries(report.topIssues)} />
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border rounded-md p-3 bg-card">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-xl font-semibold tracking-tight mt-1">{value}</p>
    </div>
  );
}

function Section({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data);
  const max = entries.reduce((m, [, v]) => Math.max(m, v), 0) || 1;
  return (
    <section>
      <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </h4>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No data.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map(([k, v]) => (
            <li key={k} className="text-sm">
              <div className="flex justify-between mb-1">
                <span>{k}</span>
                <span className="text-muted-foreground tabular-nums">{v}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${(v / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
