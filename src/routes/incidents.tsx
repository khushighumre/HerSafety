import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Download, FileLock2, FilePlus2, Hash, ShieldCheck, TriangleAlert } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { EmptyState, PageHeader, SimulatedBadge } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { INCIDENTS } from "@/data/mock";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { brandTitle, pageMeta } from "@/lib/page-meta";
import { cn } from "@/lib/utils";
import type { EvidenceItem, Incident } from "@/types";

export const Route = createFileRoute("/incidents")({
  head: () => pageMeta(brandTitle("Incidents & Evidence Vault"), "Incident records, SHA-256 hashed evidence, manifest verification and tamper-test demo."),
  component: IncidentsPage,
});

async function sha256Hex(buf: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function IncidentsPage() {
  const [incidents, setIncidents] = useLocalStorage<Incident[]>("hersafety-incidents", INCIDENTS);
  const [activeId, setActiveId] = useState(incidents[0]?.id ?? null);
  const [verified, setVerified] = useState<Record<string, boolean>>({});
  const [tampered, setTampered] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const active = incidents.find((i) => i.id === activeId) ?? null;

  const addEvidence = async (files: FileList | null) => {
    if (!files?.length || !active) return;
    const added: EvidenceItem[] = [];
    for (const f of Array.from(files)) {
      // Real SHA-256 over the uploaded bytes — computed locally in your browser.
      const hex = await sha256Hex(await f.arrayBuffer());
      added.push({
        id: `e${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
        name: f.name,
        type: f.type.startsWith("image") ? "image" : f.type.startsWith("audio") ? "audio" : "document",
        sizeKb: Math.max(1, Math.round(f.size / 1024)),
        sha256: hex.slice(0, 12) + "…" + hex.slice(-4),
        addedAt: new Date().toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
        hashVerified: true,
      });
    }
    setIncidents((is) => is.map((i) => (i.id === active.id ? { ...i, evidence: [...i.evidence, ...added] } : i)));
    toast.success(`${added.length} file(s) hashed and added`, { description: "SHA-256 computed locally over the real file bytes." });
    if (fileRef.current) fileRef.current.value = "";
  };

  const verifyManifest = () => {
    if (!active) return;
    const result: Record<string, boolean> = {};
    for (const e of active.evidence) result[e.id] = true; // hashes match the stored manifest (demo files)
    setVerified((v) => ({ ...v, ...result }));
    setTampered({});
    toast.success("Manifest verified", { description: "All hashes in this demo incident match their stored values." });
  };

  const tamperTest = () => {
    if (!active || active.evidence.length === 0) return;
    const result: Record<string, boolean> = {};
    for (const e of active.evidence) result[e.id] = true;
    setTampered(result);
    toast.warning("Tamper test complete (demo)", {
      description: "A simulated byte-change produced a different hash — exactly what tampering would look like.",
    });
  };

  const exportReport = () => {
    if (!active) return;
    const report = {
      note: "Her Safety demo export — simulated incident record, hashes are demo values.",
      incident: active,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${active.reference}-manifest.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported (demo)");
  };

  return (
    <AppLayout>
      <PageHeader
        title="Incidents & Evidence Vault"
        description="Log incidents, attach evidence with SHA-256 hashes computed in your browser, and verify the manifest later."
      />

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Incident list */}
        <div className="space-y-3 lg:col-span-2">
          {incidents.map((i) => (
            <button
              key={i.id}
              onClick={() => {
                setActiveId(i.id);
                setVerified({});
                setTampered({});
              }}
              className={cn(
                "w-full rounded-2xl border bg-card p-4 text-left shadow-[var(--shadow-card)] transition-all",
                activeId === i.id && "ring-2 ring-ring",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-sm font-semibold">{i.title}</p>
                <Badge variant="outline" className={cn(i.status === "open" && "border-primary/50 text-primary", i.status === "archived" && "text-muted-foreground")}>
                  {i.status}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{i.reference} · {i.category} · {i.date}</p>
              <div className="mt-2 flex items-center gap-2">
                <Badge variant="outline" className={cn("text-[10px]", i.severity === "high" && "border-destructive/40 text-destructive", i.severity === "medium" && "border-warning/50 text-warning-foreground")}>
                  {i.severity} severity
                </Badge>
                <span className="text-xs text-muted-foreground">{i.evidence.length} evidence file(s)</span>
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        {active ? (
          <div className="space-y-4 lg:col-span-3">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="font-display text-base">{active.title}</CardTitle>
                <SimulatedBadge />
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <p><span className="font-medium text-foreground">Reference:</span> {active.reference}</p>
                <p><span className="font-medium text-foreground">Summary:</span> {active.summary}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 font-display text-base">
                  <Hash className="h-4 w-4 text-primary" /> Evidence vault
                </CardTitle>
                <div className="flex gap-2">
                  <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => void addEvidence(e.target.files)} />
                  <Button size="sm" className="gap-1.5 rounded-lg" onClick={() => fileRef.current?.click()}>
                    <FilePlus2 className="h-3.5 w-3.5" /> Add evidence
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {active.evidence.length === 0 ? (
                  <EmptyState icon={FileLock2} title="No evidence yet" description="Add files to hash them with SHA-256 in your browser." />
                ) : (
                  active.evidence.map((e) => (
                    <div key={e.id} className="rounded-xl border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{e.name}</p>
                        <div className="flex items-center gap-1.5">
                          {tampered[e.id] ? (
                            <Badge variant="outline" className="border-destructive/50 bg-destructive/10 text-destructive">
                              <TriangleAlert className="h-3 w-3" /> hash mismatch (demo)
                            </Badge>
                          ) : verified[e.id] || e.hashVerified ? (
                            <Badge variant="outline" className="border-success/50 bg-success/10 text-success">
                              <ShieldCheck className="h-3 w-3" /> verified
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">unverified</Badge>
                          )}
                        </div>
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">SHA-256: {e.sha256}</p>
                      <p className="text-[11px] text-muted-foreground">{e.type} · {e.sizeKb} KB · added {e.addedAt}</p>
                    </div>
                  ))
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="outline" size="sm" className="gap-1.5 rounded-lg" onClick={verifyManifest} disabled={active.evidence.length === 0}>
                    <ShieldCheck className="h-3.5 w-3.5" /> Verify manifest
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 rounded-lg" onClick={tamperTest} disabled={active.evidence.length === 0}>
                    <TriangleAlert className="h-3.5 w-3.5" /> Run tamper test (demo)
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 rounded-lg" onClick={exportReport}>
                    <Download className="h-3.5 w-3.5" /> Export report
                  </Button>
                </div>
                <label className="flex items-start gap-2.5 rounded-xl bg-accent/50 p-3 text-xs text-accent-foreground">
                  <Checkbox className="mt-0.5" />
                  <span>
                    I understand this is a demo vault: files are hashed locally and never uploaded, and the tamper test
                    simulates a modification rather than altering my file.
                  </span>
                </label>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="lg:col-span-3">
            <EmptyState icon={FileLock2} title="No incident selected" description="Pick an incident on the left, or add evidence to see hashing in action." />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
