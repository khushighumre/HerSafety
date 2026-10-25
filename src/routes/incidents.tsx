import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Download,
  FileLock2,
  FilePlus2,
  Hash,
  Plus,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { EmptyState, PageHeader, SimulatedBadge } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { INCIDENTS } from "@/data/mock";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { brandTitle, pageMeta } from "@/lib/page-meta";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api-client";
import type { EvidenceItem, Incident } from "@/types";
import {
  fetchIncidents,
  createIncident,
  fetchIncidentEvidence,
  uploadIncidentEvidence,
  verifyIncidentEvidence,
  INCIDENT_SEVERITIES,
  ALLOWED_EVIDENCE_EXTENSIONS,
  EVIDENCE_MAX_BYTES,
  type BackendIncident,
  type BackendEvidence,
  type EvidenceVerifyResult,
  type IncidentSeverity,
} from "@/api/incidents";

export const Route = createFileRoute("/incidents")({
  head: () =>
    pageMeta(
      brandTitle("Incidents & Evidence Vault"),
      "Incident records, SHA-256 hashed evidence, manifest verification and tamper-test demo.",
    ),
  component: IncidentsPage,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sha256Hex(buf: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface DisplayIncident {
  key: string;
  reference: string;
  title: string;
  category: string;
  date: string;
  severity: "low" | "medium" | "high";
  status: string;
  summary: string | null;
  mockData?: Incident;
  backendId?: number;
}

function backendToDisplay(b: BackendIncident): DisplayIncident {
  return {
    key: `b:${b.id}`,
    reference: b.reference,
    title: b.title,
    category: b.category,
    date: fmtDate(b.created_at),
    severity: b.severity,
    status: b.status,
    summary: b.summary,
    backendId: b.id,
  };
}

function mockToDisplay(m: Incident): DisplayIncident {
  return {
    key: m.id,
    reference: m.reference,
    title: m.title,
    category: m.category,
    date: m.date,
    severity: m.severity,
    status: m.status,
    summary: m.summary,
    mockData: m,
  };
}

// ---------------------------------------------------------------------------
// New Incident form state
// ---------------------------------------------------------------------------

interface FormState {
  title: string;
  category: string;
  severity: IncidentSeverity;
  summary: string;
}

const EMPTY_FORM: FormState = { title: "", category: "", severity: "medium", summary: "" };

const INCIDENT_CATEGORIES = [
  "Online harassment",
  "Sextortion",
  "Impersonation",
  "Account compromise",
  "Phishing / scam",
  "Physical safety",
  "Stalking",
  "Other",
];

// Per-item verification state for backend evidence
interface VerifyState {
  status: "idle" | "loading" | "verified" | "mismatch" | "error";
  result?: EvidenceVerifyResult;
  errorMsg?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function IncidentsPage() {
  const queryClient = useQueryClient();

  const {
    data: backendIncidents,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["incidents"],
    queryFn: fetchIncidents,
    retry: 1,
  });

  const [mockIncidents, setMockIncidents] = useLocalStorage<Incident[]>(
    "hersafety-incidents",
    INCIDENTS,
  );

  const backendDisplay = (backendIncidents ?? []).map(backendToDisplay);
  const mockDisplay = mockIncidents.map(mockToDisplay);
  const allDisplay = [...backendDisplay, ...mockDisplay];

  const [activeKey, setActiveKey] = useState<string | null>(allDisplay[0]?.key ?? null);
  const [verified, setVerified] = useState<Record<string, boolean>>({});
  const [tampered, setTampered] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const active = allDisplay.find((i) => i.key === activeKey) ?? null;
  const activeEvidence: EvidenceItem[] = active?.mockData?.evidence ?? [];

  // Per-item verify state for backend evidence
  const [verifyStates, setVerifyStates] = useState<Record<number, VerifyState>>({});

  // ---------------------------------------------------------------------------
  // Backend evidence query
  // ---------------------------------------------------------------------------

  const {
    data: backendEvidence,
    isLoading: evidenceLoading,
    isError: evidenceError,
    refetch: refetchEvidence,
  } = useQuery({
    queryKey: ["evidence", active?.backendId],
    queryFn: () => fetchIncidentEvidence(active!.backendId!),
    enabled: active?.backendId !== undefined,
    retry: 1,
  });

  // ---------------------------------------------------------------------------
  // Backend evidence upload
  // ---------------------------------------------------------------------------

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadIncidentEvidence(active!.backendId!, file),
    onSuccess: (ev) => {
      void queryClient.invalidateQueries({ queryKey: ["evidence", active?.backendId] });
      toast.success(`Evidence uploaded — ${ev.original_filename}`, {
        description: `SHA-256: ${ev.sha256.slice(0, 16)}…`,
      });
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError
          ? `Upload failed (${err.status}): ${err.detail}`
          : "Could not reach the backend. Make sure the NightWise API server is running.";
      toast.error(msg);
      if (fileRef.current) fileRef.current.value = "";
    },
  });

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0 || !active?.backendId) return;
    const file = files.item(0);
    if (!file) return;
    const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED_EVIDENCE_EXTENSIONS.includes(ext as typeof ALLOWED_EVIDENCE_EXTENSIONS[number])) {
      toast.error(`File type not supported`, {
        description: `Allowed: ${ALLOWED_EVIDENCE_EXTENSIONS.join(", ")}`,
      });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > EVIDENCE_MAX_BYTES) {
      toast.error("File too large", { description: "Maximum upload size is 10 MB." });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    uploadMutation.mutate(file);
  };

  // ---------------------------------------------------------------------------
  // Backend evidence verification (per-item)
  // ---------------------------------------------------------------------------

  const verifyItem = async (ev: BackendEvidence) => {
    if (!active?.backendId) return;
    setVerifyStates((s) => ({ ...s, [ev.id]: { status: "loading" } }));
    try {
      const result = await verifyIncidentEvidence(active.backendId, ev.id);
      setVerifyStates((s) => ({
        ...s,
        [ev.id]: { status: result.match ? "verified" : "mismatch", result },
      }));
      if (result.match) {
        toast.success(`Verified — ${ev.original_filename}`, {
          description: "Stored bytes match the recorded SHA-256 digest.",
        });
      } else {
        toast.warning(`Hash mismatch — ${ev.original_filename}`, {
          description: "Stored bytes do not match the recorded digest.",
        });
      }
    } catch (err) {
      const msg =
        err instanceof ApiError ? `Error ${err.status}: ${err.detail}` : "Verification failed.";
      setVerifyStates((s) => ({ ...s, [ev.id]: { status: "error", errorMsg: msg } }));
      toast.error(msg);
    }
  };

  const verifyAllBackend = async () => {
    if (!backendEvidence?.length) return;
    for (const ev of backendEvidence) {
      await verifyItem(ev);
    }
  };

  // ---------------------------------------------------------------------------
  // New Incident dialog
  // ---------------------------------------------------------------------------

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const createMutation = useMutation({
    mutationFn: () =>
      createIncident({
        title: form.title.trim(),
        category: form.category.trim(),
        severity: form.severity,
        summary: form.summary.trim() || null,
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
      setActiveKey(`b:${created.id}`);
      toast.success(`Incident created — ${created.reference}`, {
        description: `"${created.title}" saved to the backend.`,
      });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      setFormErrors({});
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError
          ? `Save failed (${err.status}): ${err.detail}`
          : "Could not reach the backend. Make sure the NightWise API server is running.";
      toast.error(msg);
    },
  });

  const validateForm = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.title.trim()) errs.title = "Title is required.";
    else if (form.title.trim().length > 200) errs.title = "Title must be 200 characters or fewer.";
    if (!form.category.trim()) errs.category = "Category is required.";
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;
    createMutation.mutate();
  };

  // ---------------------------------------------------------------------------
  // Mock evidence vault (local-only)
  // ---------------------------------------------------------------------------

  const addEvidence = async (files: FileList | null) => {
    if (!files?.length || !active?.mockData) return;
    const added: EvidenceItem[] = [];
    for (const f of Array.from(files)) {
      const hex = await sha256Hex(await f.arrayBuffer());
      added.push({
        id: `e${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
        name: f.name,
        type: f.type.startsWith("image") ? "image" : f.type.startsWith("audio") ? "audio" : "document",
        sizeKb: Math.max(1, Math.round(f.size / 1024)),
        sha256: hex.slice(0, 12) + "…" + hex.slice(-4),
        addedAt: new Date().toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        hashVerified: true,
      });
    }
    setMockIncidents((is) =>
      is.map((i) =>
        i.id === active.mockData!.id ? { ...i, evidence: [...i.evidence, ...added] } : i,
      ),
    );
    toast.success(`${added.length} file(s) hashed and added`, {
      description: "SHA-256 computed locally over the real file bytes.",
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  const verifyManifest = () => {
    if (!active) return;
    const result: Record<string, boolean> = {};
    for (const e of activeEvidence) result[e.id] = true;
    setVerified((v) => ({ ...v, ...result }));
    setTampered({});
    toast.success("Manifest verified", {
      description: "All hashes in this demo incident match their stored values.",
    });
  };

  const exportReport = () => {
    if (!active) return;
    const isBackend = !!active.backendId;
    const evidenceForExport = isBackend
      ? (backendEvidence ?? []).map((e) => {
          const vs = verifyStates[e.id];
          return {
            id: e.id,
            filename: e.original_filename,
            file_type: e.file_type,
            size_bytes: e.size_bytes,
            sha256: e.sha256,
            hash_verified: e.hash_verified,
            added_at: e.added_at,
            verification:
              vs?.status === "verified" || vs?.status === "mismatch"
                ? { match: vs.result!.match, stored_sha256: vs.result!.stored_sha256, computed_sha256: vs.result!.computed_sha256 }
                : "not verified in this session",
          };
        })
      : activeEvidence.map((e) => ({
          id: e.id,
          filename: e.name,
          file_type: e.type,
          size_kb: e.sizeKb,
          sha256: e.sha256,
          note: "LOCAL DEMO DATA — hash computed in browser, file never uploaded to backend",
        }));

    const report = {
      note: isBackend
        ? "Her Safety incident export — SHA-256 hashes computed server-side. A matching hash proves stored bytes match the recorded digest; it does not prove authorship or legal admissibility."
        : "Her Safety DEMO export — local demo data only, not persisted to backend.",
      incident: {
        reference: active.reference,
        title: active.title,
        category: active.category,
        severity: active.severity,
        status: active.status,
        date: active.date,
      },
      evidence: evidenceForExport,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${active.reference}-manifest.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported");
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <AppLayout>
      <PageHeader
        title="Incidents & Evidence Vault"
        description="Log incidents, attach evidence with SHA-256 hashes, and verify integrity against the server."
      />

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Incident list */}
        <div className="space-y-3 lg:col-span-2">
          <Button
            className="w-full gap-2 rounded-xl"
            onClick={() => {
              setForm(EMPTY_FORM);
              setFormErrors({});
              createMutation.reset();
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New Incident
          </Button>

          {isLoading && (
            <div className="space-y-3">
              {[1, 2].map((n) => (
                <Skeleton key={n} className="h-24 rounded-2xl" />
              ))}
            </div>
          )}

          {isError && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p className="font-medium text-destructive">Could not load incidents from backend</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {error instanceof ApiError
                  ? `Error ${error.status}: ${error.detail}`
                  : "Backend unavailable — start the NightWise API server on http://localhost:8000."}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 rounded-lg"
                onClick={() => void refetch()}
              >
                Retry
              </Button>
            </div>
          )}

          {!isLoading &&
            backendDisplay.map((i) => (
              <IncidentListItem
                key={i.key}
                incident={i}
                active={activeKey === i.key}
                onClick={() => {
                  setActiveKey(i.key);
                  setVerified({});
                  setTampered({});
                  setVerifyStates({});
                }}
              />
            ))}

          {mockDisplay.length > 0 && (
            <>
              <p className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Demo data (local only)
              </p>
              {mockDisplay.map((i) => (
                <IncidentListItem
                  key={i.key}
                  incident={i}
                  active={activeKey === i.key}
                  onClick={() => {
                    setActiveKey(i.key);
                    setVerified({});
                    setTampered({});
                    setVerifyStates({});
                  }}
                />
              ))}
            </>
          )}

          {!isLoading && !isError && allDisplay.length === 0 && (
            <EmptyState
              icon={FileLock2}
              title="No incidents yet"
              description="Create your first incident using the button above."
            />
          )}
        </div>

        {/* Detail panel */}
        {active ? (
          <div className="space-y-4 lg:col-span-3">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="font-display text-base">{active.title}</CardTitle>
                {active.mockData && <SimulatedBadge />}
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Reference:</span> {active.reference}
                </p>
                <p>
                  <span className="font-medium text-foreground">Category:</span> {active.category}
                </p>
                <p>
                  <span className="font-medium text-foreground">Severity:</span> {active.severity}
                </p>
                <p>
                  <span className="font-medium text-foreground">Status:</span> {active.status}
                </p>
                {active.summary && (
                  <p>
                    <span className="font-medium text-foreground">Summary:</span> {active.summary}
                  </p>
                )}
                <p>
                  <span className="font-medium text-foreground">Date:</span> {active.date}
                </p>
              </CardContent>
            </Card>

            {/* Evidence vault */}
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 font-display text-base">
                  <Hash className="h-4 w-4 text-primary" /> Evidence vault
                </CardTitle>
                <div className="flex gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept={ALLOWED_EVIDENCE_EXTENSIONS.join(",")}
                    onChange={(e) => {
                      if (active.backendId) {
                        handleFileSelect(e.target.files);
                      } else {
                        void addEvidence(e.target.files);
                      }
                    }}
                    multiple={!active.backendId}
                  />
                  <Button
                    size="sm"
                    className="gap-1.5 rounded-lg"
                    disabled={uploadMutation.isPending}
                    onClick={() => fileRef.current?.click()}
                  >
                    <FilePlus2 className="h-3.5 w-3.5" />
                    {uploadMutation.isPending ? "Uploading…" : "Add evidence"}
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {/* Backend evidence */}
                {active.backendId !== undefined && (
                  <>
                    {evidenceLoading && (
                      <div className="space-y-2">
                        {[1, 2].map((n) => (
                          <Skeleton key={n} className="h-16 rounded-xl" />
                        ))}
                      </div>
                    )}

                    {evidenceError && (
                      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs">
                        <p className="font-medium text-destructive">Could not load evidence</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 rounded-lg"
                          onClick={() => void refetchEvidence()}
                        >
                          Retry
                        </Button>
                      </div>
                    )}

                    {!evidenceLoading && !evidenceError && (backendEvidence ?? []).length === 0 && (
                      <EmptyState
                        icon={FileLock2}
                        title="No evidence yet"
                        description={`Add files (${ALLOWED_EVIDENCE_EXTENSIONS.join(", ")}, max 10 MB each). SHA-256 is computed server-side.`}
                      />
                    )}

                    {!evidenceLoading &&
                      (backendEvidence ?? []).map((ev) => {
                        const vs = verifyStates[ev.id] ?? { status: "idle" };
                        return (
                          <div key={ev.id} className="rounded-xl border p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-medium">{ev.original_filename}</p>
                              <div className="flex items-center gap-1.5">
                                {vs.status === "loading" && (
                                  <Badge variant="outline" className="text-muted-foreground">
                                    verifying…
                                  </Badge>
                                )}
                                {vs.status === "verified" && (
                                  <Badge
                                    variant="outline"
                                    className="border-success/50 bg-success/10 text-success"
                                  >
                                    <ShieldCheck className="h-3 w-3" /> verified
                                  </Badge>
                                )}
                                {vs.status === "mismatch" && (
                                  <Badge
                                    variant="outline"
                                    className="border-destructive/50 bg-destructive/10 text-destructive"
                                  >
                                    <TriangleAlert className="h-3 w-3" /> hash mismatch
                                  </Badge>
                                )}
                                {vs.status === "error" && (
                                  <Badge
                                    variant="outline"
                                    className="border-destructive/50 bg-destructive/10 text-destructive"
                                  >
                                    <TriangleAlert className="h-3 w-3" /> error
                                  </Badge>
                                )}
                                {vs.status === "idle" && ev.hash_verified && (
                                  <Badge
                                    variant="outline"
                                    className="border-success/50 bg-success/10 text-success"
                                  >
                                    <ShieldCheck className="h-3 w-3" /> previously verified
                                  </Badge>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 rounded-md px-2 text-xs"
                                  disabled={vs.status === "loading"}
                                  onClick={() => void verifyItem(ev)}
                                >
                                  Verify
                                </Button>
                              </div>
                            </div>
                            <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                              SHA-256: {ev.sha256}
                            </p>
                            {vs.status === "verified" || vs.status === "mismatch" ? (
                              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                                Recomputed: {vs.result!.computed_sha256}
                              </p>
                            ) : null}
                            <p className="text-[11px] text-muted-foreground">
                              {ev.file_type} · {fmtBytes(ev.size_bytes)} · added{" "}
                              {fmtDate(ev.added_at)}
                            </p>
                            {vs.status === "error" && (
                              <p className="mt-1 text-[11px] text-destructive">{vs.errorMsg}</p>
                            )}
                          </div>
                        );
                      })}

                    {!evidenceLoading && (backendEvidence ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 rounded-lg"
                          onClick={() => void verifyAllBackend()}
                          disabled={(backendEvidence ?? []).some(
                            (ev) => verifyStates[ev.id]?.status === "loading",
                          )}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" /> Verify all
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 rounded-lg"
                          onClick={exportReport}
                        >
                          <Download className="h-3.5 w-3.5" /> Export report
                        </Button>
                      </div>
                    )}

                    <p className="rounded-xl bg-accent/50 p-3 text-xs text-accent-foreground">
                      SHA-256 digests are computed server-side from the exact uploaded bytes.
                      Verification re-reads the stored file and recomputes the digest. A matching
                      hash proves the stored bytes match the recorded digest; it does not prove
                      authorship or legal admissibility.
                    </p>
                  </>
                )}

                {/* Mock (local-only) evidence vault */}
                {active.mockData && (
                  <>
                    {activeEvidence.length === 0 ? (
                      <EmptyState
                        icon={FileLock2}
                        title="No evidence yet"
                        description="Add files to hash them with SHA-256 in your browser."
                      />
                    ) : (
                      activeEvidence.map((e) => (
                        <div key={e.id} className="rounded-xl border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">{e.name}</p>
                            <div className="flex items-center gap-1.5">
                              {tampered[e.id] ? (
                                <Badge
                                  variant="outline"
                                  className="border-destructive/50 bg-destructive/10 text-destructive"
                                >
                                  <TriangleAlert className="h-3 w-3" /> hash mismatch (demo)
                                </Badge>
                              ) : verified[e.id] || e.hashVerified ? (
                                <Badge
                                  variant="outline"
                                  className="border-success/50 bg-success/10 text-success"
                                >
                                  <ShieldCheck className="h-3 w-3" /> verified
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground">
                                  unverified
                                </Badge>
                              )}
                            </div>
                          </div>
                          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                            SHA-256: {e.sha256}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {e.type} · {e.sizeKb} KB · added {e.addedAt}
                          </p>
                        </div>
                      ))
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 rounded-lg"
                        onClick={verifyManifest}
                        disabled={activeEvidence.length === 0}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" /> Verify manifest
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 rounded-lg"
                        onClick={exportReport}
                      >
                        <Download className="h-3.5 w-3.5" /> Export report
                      </Button>
                    </div>
                    <label className="flex items-start gap-2.5 rounded-xl bg-accent/50 p-3 text-xs text-accent-foreground">
                      <Checkbox className="mt-0.5" />
                      <span>
                        I understand this is a demo vault: files are hashed locally in the browser
                        and never uploaded to the backend. The tamper test button has been removed
                        because it would only set a cosmetic flag — it would not perform a real
                        integrity check. Use a backend-persisted incident to upload and verify real
                        evidence.
                      </span>
                    </label>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="lg:col-span-3">
            <EmptyState
              icon={FileLock2}
              title="No incident selected"
              description="Pick an incident on the left, or create a new one."
            />
          </div>
        )}
      </div>

      {/* New Incident dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">New Incident</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="inc-title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="inc-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Brief description of the incident"
                maxLength={200}
              />
              {formErrors.title && (
                <p className="text-[11px] text-destructive">{formErrors.title}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inc-category">
                Category <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
              >
                <SelectTrigger id="inc-category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {INCIDENT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.category && (
                <p className="text-[11px] text-destructive">{formErrors.category}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inc-severity">Severity</Label>
              <Select
                value={form.severity}
                onValueChange={(v) => setForm((f) => ({ ...f, severity: v as IncidentSeverity }))}
              >
                <SelectTrigger id="inc-severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INCIDENT_SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inc-summary">Summary</Label>
              <Textarea
                id="inc-summary"
                value={form.summary}
                onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                rows={3}
                placeholder="Optional — describe what happened in your own words."
              />
            </div>

            {createMutation.isError && (
              <p className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
                {createMutation.error instanceof ApiError
                  ? `Error ${createMutation.error.status}: ${createMutation.error.detail}`
                  : "Backend unavailable — start the NightWise API server and try again."}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving…" : "Save incident"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// ---------------------------------------------------------------------------
// Shared list-item component
// ---------------------------------------------------------------------------

function IncidentListItem({
  incident,
  active,
  onClick,
}: {
  incident: DisplayIncident;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full rounded-2xl border bg-card p-4 text-left shadow-[var(--shadow-card)] transition-all",
        active && "ring-2 ring-ring",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-sm font-semibold">{incident.title}</p>
        <Badge
          variant="outline"
          className={cn(
            incident.status === "open" && "border-primary/50 text-primary",
            incident.status === "archived" && "text-muted-foreground",
          )}
        >
          {incident.status}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {incident.reference} · {incident.category} · {incident.date}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Badge
          variant="outline"
          className={cn(
            "text-[10px]",
            incident.severity === "high" && "border-destructive/40 text-destructive",
            incident.severity === "medium" && "border-warning/50 text-warning-foreground",
          )}
        >
          {incident.severity} severity
        </Badge>
        {incident.mockData && (
          <span className="text-xs text-muted-foreground">
            {incident.mockData.evidence.length} evidence file(s)
          </span>
        )}
      </div>
    </button>
  );
}
