import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listAllTickets } from "@/lib/tickets.functions";

import { Card } from "@/components/ui/card";
import { TicketList } from "@/components/ticket-list";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AnalyticsPanel } from "@/components/analytics-panel";

export const Route = createFileRoute("/_authenticated/staff/analyst")({
  component: AnalystDashboard,
});

function AnalystDashboard() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dept, setDept] = useState("all");
  const [prio, setPrio] = useState("all");
  const [status, setStatus] = useState("all");
  const list = useServerFn(listAllTickets);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await list({ data: { department: dept, priority: prio, status } });
      setTickets(rows as any[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dept, prio, status]);

  return (
    <Tabs defaultValue="feed">
      <TabsList>
        <TabsTrigger value="feed">Live feed</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
      </TabsList>
      <TabsContent value="feed" className="mt-4 space-y-4">
        <Card className="p-4 flex flex-wrap gap-3">
          <FilterSelect label="Department" value={dept} setValue={setDept} options={["all", "IT", "HR", "Finance", "Operations"]} />
          <FilterSelect label="Priority" value={prio} setValue={setPrio} options={["all", "Low", "Medium", "High", "Urgent"]} />
          <FilterSelect label="Status" value={status} setValue={setStatus} options={["all", "New", "Needs Review", "In Progress", "Escalated", "Resolved", "Rejected"]} />
        </Card>
        {loading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Loading...</Card>
        ) : (
          <TicketList tickets={tickets} basePath="/staff/ticket" empty="No tickets match these filters." />
        )}
      </TabsContent>
      <TabsContent value="analytics" className="mt-4">
        <AnalyticsPanel />
      </TabsContent>
    </Tabs>
  );
}

function FilterSelect({
  label, value, setValue, options,
}: { label: string; value: string; setValue: (v: string) => void; options: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>{o === "all" ? "All" : o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
