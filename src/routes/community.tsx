import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { BadgeCheck, Flag, HeartHandshake, MapPin, Plus, ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { EmptyState, PageHeader, SimulatedBadge } from "@/components/shared";
import { MapView } from "@/components/map/map-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORY_COLORS, COMMUNITY_REPORTS, DEMO_LOCATIONS, REPORT_CATEGORIES } from "@/data/mock";
import { useTheme } from "@/lib/theme";
import { brandTitle, pageMeta } from "@/lib/page-meta";
import { cn } from "@/lib/utils";
import type { CommunityReport, ReportCategory } from "@/types";

export const Route = createFileRoute("/community")({
  head: () => pageMeta(brandTitle("Community Safety"), "Browse and file community safety reports with verification badges and a demo moderator queue."),
  component: CommunitySafety,
});

const STATUS_STYLES = {
  verified: "border-success/50 bg-success/10 text-success",
  pending: "border-warning/50 bg-warning/10 text-warning-foreground",
  flagged: "border-destructive/40 bg-destructive/10 text-destructive",
} as const;

function CommunitySafety() {
  const { theme } = useTheme();
  const [reports, setReports] = useState<CommunityReport[]>(COMMUNITY_REPORTS);
  const [filter, setFilter] = useState<ReportCategory | "all">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [fCategory, setFCategory] = useState<ReportCategory>("poor-lighting");
  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fArea, setFArea] = useState(DEMO_LOCATIONS[1].name);

  const filtered = useMemo(
    () => (filter === "all" ? reports : reports.filter((r) => r.category === filter)),
    [reports, filter],
  );

  const markers = useMemo(
    () =>
      filtered.map((r) => ({
        lat: r.lat,
        lng: r.lng,
        label: `${r.title} · ${r.status}`,
        tone: (r.status === "verified" ? "success" : r.status === "pending" ? "warning" : "destructive") as
          | "success"
          | "warning"
          | "destructive",
      })),
    [filtered],
  );

  const submit = () => {
    if (!fTitle.trim()) return;
    const area = DEMO_LOCATIONS.find((l) => l.name === fArea) ?? DEMO_LOCATIONS[1];
    setReports((rs) => [
      {
        id: `r${Date.now()}`,
        category: fCategory,
        title: fTitle.trim(),
        description: fDesc.trim() || "(no description)",
        area: area.name,
        lat: area.lat + (Math.random() - 0.5) * 0.004,
        lng: area.lng + (Math.random() - 0.5) * 0.004,
        reportedAt: "Just now",
        status: "pending",
        verifications: 0,
        reporter: "You (demo)",
      },
      ...rs,
    ]);
    setFTitle("");
    setFDesc("");
    setFormOpen(false);
    toast.success("Report filed (demo)", { description: "It enters the moderator queue as 'pending'. Nothing is published." });
  };

  const verify = (id: string) => {
    setReports((rs) =>
      rs.map((r) => (r.id === id ? { ...r, verifications: r.verifications + 1, status: r.verifications + 1 >= 5 ? "verified" : r.status } : r)),
    );
    toast("Confirmation added (demo)");
  };

  const moderate = (id: string, status: "verified" | "flagged") => {
    setReports((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    toast(`Report marked ${status} (moderator demo)`);
  };

  const queue = reports.filter((r) => r.status !== "verified");

  return (
    <AppLayout>
      <PageHeader
        title="Community Safety"
        description="A neighbourhood watch layer built from demo reports. Verified badges mean community confirmations — not official facts."
        actions={
          <Button className="gap-1.5 rounded-xl" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> File a report
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="overflow-hidden lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base">Report map (demo)</CardTitle>
          </CardHeader>
          <CardContent>
            <MapView dark={theme === "dark"} center={[12.955, 77.61]} zoom={12} markers={markers} className="h-[440px] w-full" />
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                onClick={() => setFilter("all")}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  filter === "all" ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
                )}
              >
                All ({reports.length})
              </button>
              {REPORT_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setFilter(c.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    filter === c.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_COLORS[c.id] }} />
                  {c.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <Tabs defaultValue="reports">
            <TabsList className="w-full">
              <TabsTrigger value="reports" className="flex-1">Reports</TabsTrigger>
              <TabsTrigger value="moderation" className="flex-1">Moderator (demo)</TabsTrigger>
            </TabsList>
            <TabsContent value="reports" className="mt-3 space-y-3">
              {filtered.length === 0 ? (
                <EmptyState icon={HeartHandshake} title="No reports here" description="No demo reports match this category yet." />
              ) : (
                filtered.map((r) => (
                  <div key={r.id} className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-card)]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-semibold">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CATEGORY_COLORS[r.category] }} />
                          {r.title}
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" /> {r.area} · {r.reportedAt} · {r.reporter}
                        </p>
                      </div>
                      <Badge variant="outline" className={STATUS_STYLES[r.status]}>
                        {r.status === "verified" && <BadgeCheck className="h-3 w-3" />}
                        {r.status}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{r.description}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{r.verifications} confirmations</span>
                      <Button variant="outline" size="sm" className="h-7 gap-1.5 rounded-lg text-xs" onClick={() => verify(r.id)}>
                        <ShieldCheck className="h-3 w-3" /> I can confirm
                      </Button>
                    </div>
                  </div>
                ))
              )}
              <p className="text-center text-xs text-muted-foreground">
                Demo reports only — not verified real-world safety information.
              </p>
            </TabsContent>
            <TabsContent value="moderation" className="mt-3 space-y-3">
              <div className="rounded-xl bg-accent/50 p-3 text-xs text-accent-foreground">
                Demo moderator view. In a real product, moderators would confirm reports before they appear publicly.
              </div>
              {queue.length === 0 ? (
                <EmptyState icon={ShieldCheck} title="Queue is clear" description="No pending or flagged demo reports." />
              ) : (
                queue.map((r) => (
                  <div key={r.id} className="rounded-xl border bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{r.title}</p>
                      <Badge variant="outline" className={STATUS_STYLES[r.status]}>{r.status}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{r.area} · {r.reporter}</p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 gap-1 rounded-lg text-xs text-success" onClick={() => moderate(r.id, "verified")}>
                        <BadgeCheck className="h-3 w-3" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1 rounded-lg text-xs text-destructive" onClick={() => moderate(r.id, "flagged")}>
                        <Flag className="h-3 w-3" /> Flag
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Submit dialog */}
      <div className={cn("fixed inset-0 z-50 hidden items-center justify-center", formOpen && "flex")} aria-hidden={!formOpen} />
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setFormOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-semibold">File a community report</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Demo form — reports stay in this browser and enter the demo moderation queue.
            </p>
            <div className="mt-4 space-y-3">
              <Select value={fCategory} onValueChange={(v) => setFCategory(v as ReportCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPORT_CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="Short title, e.g. 'Streetlights out near gate 2'" />
              <Textarea value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="What happened? Avoid personal details." rows={3} />
              <Select value={fArea} onValueChange={setFArea}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEMO_LOCATIONS.map((l) => (
                    <SelectItem key={l.name} value={l.name}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Safety note: file reports without identifying any individual.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setFormOpen(false)}>
                  Cancel
                </Button>
                <Button className="flex-1 rounded-xl" onClick={submit} disabled={!fTitle.trim()}>
                  Submit report
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
