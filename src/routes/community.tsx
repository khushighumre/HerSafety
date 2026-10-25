import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Flag,
  HeartHandshake,
  Info,
  KeyRound,
  Loader2,
  Locate,
  Lock,
  MapPin,
  Navigation,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  XCircle,
} from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { EmptyState, PageHeader } from "@/components/shared";
import { MapView } from "@/components/map/map-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORY_COLORS, DEMO_LOCATIONS, REPORT_CATEGORIES } from "@/data/mock";
import {
  createCommunityReport,
  fetchCommunityReports,
  fetchModerationReports,
  moderateReport,
  createReportPopupHtml,
  formatReportTime,
  formatReportRecency,
  getStatusMeta,
  buildCommunityReportMarkers,
  partitionReportsByCoordinates,
  DEFAULT_DEV_MODERATOR_KEY,
} from "@/api/community-reports";
import { useTheme } from "@/lib/theme";
import { brandTitle, pageMeta } from "@/lib/page-meta";
import { cn } from "@/lib/utils";
import type { CommunityReport, CommunityReportModeration, ReportCategory, ReportStatus } from "@/types";

export const Route = createFileRoute("/community")({
  head: () =>
    pageMeta(
      brandTitle("Community Safety"),
      "Browse, submit, and track community safety reports with verification states, trust indicators, and moderation.",
    ),
  component: CommunitySafety,
});

function CommunitySafety() {
  const queryClient = useQueryClient();
  const { theme } = useTheme();

  const [filter, setFilter] = useState<ReportCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | number | null>(null);

  // Moderation state
  const [moderatorKey, setModeratorKey] = useState<string>(DEFAULT_DEV_MODERATOR_KEY);
  const [modFilter, setModFilter] = useState<string>("all");
  const [confirmModal, setConfirmModal] = useState<{
    reportId: string | number;
    title: string;
    currentStatus: string;
    targetStatus: ReportStatus;
    actionLabel: string;
    note: string;
  } | null>(null);

  // Form states
  const [fCategory, setFCategory] = useState<ReportCategory>("poor-lighting");
  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fArea, setFArea] = useState<string>("Indiranagar 100ft Rd");
  const [fCustomArea, setFCustomArea] = useState("");
  const [isCustomArea, setIsCustomArea] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsNote, setGpsNote] = useState<string | null>(null);

  const [formErrors, setFormErrors] = useState<{ title?: string; description?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // Fetch public reports from FastAPI backend (persisted in SQLite)
  const reportsQuery = useQuery({
    queryKey: ["community-reports", filter, statusFilter],
    queryFn: () =>
      fetchCommunityReports({
        category: filter === "all" ? undefined : filter,
        status: statusFilter === "all" ? undefined : statusFilter,
        includeDemo: true,
      }),
    staleTime: 10 * 1000,
  });

  const reports = reportsQuery.data ?? [];

  // Filtered reports synchronized across map and list
  const filtered = useMemo(() => {
    let list = reports;
    if (filter !== "all") {
      list = list.filter((r) => r.category === filter);
    }
    if (statusFilter !== "all") {
      list = list.filter((r) => {
        const s = (r.status || "unverified").toLowerCase();
        if (statusFilter === "under_review") return s === "under_review" || s === "pending";
        return s === statusFilter;
      });
    }
    return list;
  }, [reports, filter, statusFilter]);

  const selectedReport = useMemo(() => {
    if (!selectedReportId) return null;
    return reports.find((r) => String(r.id) === String(selectedReportId)) ?? null;
  }, [reports, selectedReportId]);

  const { unmapped: unmappedReports } = useMemo(
    () => partitionReportsByCoordinates(filtered),
    [filtered],
  );

  const mapCenter = useMemo<[number, number]>(() => {
    if (
      selectedReport &&
      typeof selectedReport.lat === "number" &&
      typeof selectedReport.lng === "number" &&
      (selectedReport.lat !== 0 || selectedReport.lng !== 0)
    ) {
      return [selectedReport.lat, selectedReport.lng];
    }
    const firstWithCoords = filtered.find(
      (r) => typeof r.lat === "number" && typeof r.lng === "number" && (r.lat !== 0 || r.lng !== 0),
    );
    if (firstWithCoords && typeof firstWithCoords.lat === "number" && typeof firstWithCoords.lng === "number") {
      return [firstWithCoords.lat, firstWithCoords.lng];
    }
    return [12.955, 77.61]; // Default Bengaluru center
  }, [filtered, selectedReport]);

  // Map markers from reports with valid coordinates
  const markers = useMemo(
    () => buildCommunityReportMarkers(filtered, (id) => setSelectedReportId(id)),
    [filtered],
  );

  // Moderation review queue query (authorized)
  const moderationQuery = useQuery({
    queryKey: ["moderation-reports", moderatorKey, modFilter],
    queryFn: () =>
      fetchModerationReports({
        moderatorKey,
        status: modFilter === "all" ? undefined : modFilter,
        includeDemo: true,
      }),
    retry: false,
    staleTime: 5 * 1000,
  });

  const moderationReports = moderationQuery.data ?? [];

  // Create report mutation
  const createMutation = useMutation({
    mutationFn: createCommunityReport,
    onSuccess: (newReport) => {
      queryClient.invalidateQueries({ queryKey: ["community-reports"] });
      queryClient.invalidateQueries({ queryKey: ["moderation-reports"] });
      toast.success("Community report submitted", {
        description: `Observation #${newReport.id} saved in SQLite as unverified. Thank you for keeping NightWise informed.`,
      });
      // Reset form
      setFTitle("");
      setFDesc("");
      setFArea("Indiranagar 100ft Rd");
      setFCustomArea("");
      setIsCustomArea(false);
      setGpsCoords(null);
      setGpsNote(null);
      setFormErrors({});
      setServerError(null);
      setFormOpen(false);
      setSelectedReportId(newReport.id);
    },
    onError: (err: any) => {
      const msg = err?.detail || err?.message || "Could not save report to server.";
      setServerError(msg);
      toast.error("Submission failed", {
        description: msg,
      });
    },
  });

  // Moderation action mutation
  const moderationMutation = useMutation({
    mutationFn: ({
      reportId,
      status,
      note,
    }: {
      reportId: string | number;
      status: ReportStatus;
      note?: string;
    }) =>
      moderateReport(
        reportId,
        {
          status,
          moderator_note: note || undefined,
          moderator_name: "community-moderator",
        },
        moderatorKey,
      ),
    onSuccess: (updatedReport) => {
      queryClient.invalidateQueries({ queryKey: ["community-reports"] });
      queryClient.invalidateQueries({ queryKey: ["moderation-reports"] });
      const meta = getStatusMeta(updatedReport.status);
      toast.success(`Report #${updatedReport.id} status updated`, {
        description: `Review status changed to: ${meta.label}`,
      });
      setConfirmModal(null);
    },
    onError: (err: any) => {
      const msg = err?.detail || err?.message || "Failed to update report status.";
      toast.error("Moderation action failed", {
        description: msg,
      });
      setConfirmModal(null);
    },
  });

  // Form submit handler
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    const errors: { title?: string; description?: string } = {};

    if (!fDesc.trim()) {
      errors.description = "Please describe the safety observation.";
    } else if (fDesc.trim().length < 5) {
      errors.description = "Description must be at least 5 characters.";
    }

    if (fTitle.trim() && fTitle.trim().length < 3) {
      errors.title = "Title must be at least 3 characters if provided.";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const resolvedArea = isCustomArea ? fCustomArea.trim() : fArea;
    let resolvedLat: number | undefined = undefined;
    let resolvedLng: number | undefined = undefined;

    if (gpsCoords) {
      resolvedLat = gpsCoords.lat;
      resolvedLng = gpsCoords.lng;
    } else if (!isCustomArea && fArea) {
      const match = DEMO_LOCATIONS.find((l) => l.name === fArea);
      if (match) {
        resolvedLat = match.lat;
        resolvedLng = match.lng;
      }
    }

    createMutation.mutate({
      category: fCategory,
      title: fTitle.trim() || undefined,
      description: fDesc.trim(),
      area: resolvedArea || undefined,
      lat: resolvedLat,
      lng: resolvedLng,
    });
  };

  // GPS fetch simulation / browser geolocation
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setGpsNote("Geolocation not supported by your browser.");
      return;
    }
    setGpsLoading(true);
    setGpsNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
        setGpsLoading(false);
        setGpsNote("Current GPS coordinates attached.");
      },
      () => {
        setGpsLoading(false);
        setGpsNote("Location permission denied or unavailable. Using area coordinates.");
      },
      { timeout: 8000, enableHighAccuracy: false },
    );
  };

  return (
    <AppLayout>
      <PageHeader
        title="Community Safety"
        description="Crowd-sourced safety observations persisted in SQLite. Moderation review states distinguish verified community notes from unverified submissions."
        actions={
          <Button
            className="gap-1.5 rounded-xl shadow-xs"
            onClick={() => {
              setFormOpen(true);
              setServerError(null);
              setFormErrors({});
            }}
          >
            <Plus className="h-4 w-4" /> File a report
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Left column: Map & Category Filter */}
        <Card className="overflow-hidden lg:col-span-3 border-border/60 shadow-xs">
          <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="font-display text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" /> Report Map
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Click any marker to view trust status, recency, and verification notes.
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className="text-xs">
                {markers.length} on map
              </Badge>
              {unmappedReports.length > 0 && (
                <Badge
                  variant="secondary"
                  className="text-xs text-muted-foreground"
                  title="Reports with location label but no coordinates"
                >
                  {unmappedReports.length} in list only
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <MapView
              dark={theme === "dark"}
              center={mapCenter}
              zoom={12}
              markers={markers}
              fitAll={true}
              className="h-[430px] w-full"
            />
            {/* Category Filter Pills */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  filter === "all"
                    ? "border-primary bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "bg-card hover:bg-muted text-muted-foreground",
                )}
              >
                All categories ({reports.length})
              </button>
              {REPORT_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFilter(c.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    filter === c.id
                      ? "border-primary bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "bg-card hover:bg-muted text-muted-foreground",
                  )}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: CATEGORY_COLORS[c.id] ?? "#64748b" }}
                  />
                  {c.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Right column: Public Feed & Moderator Queue */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="feed">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="feed" className="text-xs">
                Community Feed ({filtered.length})
              </TabsTrigger>
              <TabsTrigger value="moderation" className="text-xs">
                Moderation Desk
              </TabsTrigger>
            </TabsList>

            {/* Public Reports Feed */}
            <TabsContent value="feed" className="mt-3 space-y-3">
              {/* Status Filter Bar */}
              <div className="flex flex-wrap items-center gap-1.5 pb-1">
                <span className="text-[11px] font-semibold text-muted-foreground mr-1">Status:</span>
                {[
                  { id: "all", label: "All" },
                  { id: "verified", label: "Verified only" },
                  { id: "under_review", label: "Under review" },
                  { id: "unverified", label: "Unverified" },
                  { id: "resolved", label: "Resolved" },
                  { id: "rejected", label: "Rejected" },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setStatusFilter(st.id)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                      statusFilter === st.id
                        ? "border-primary bg-primary text-primary-foreground font-semibold shadow-xs"
                        : "bg-muted/50 hover:bg-muted text-muted-foreground",
                    )}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              {/* Disclaimer notice */}
              <div className="rounded-xl border border-border/50 bg-muted/20 p-2.5 text-[11px] text-muted-foreground flex items-center gap-2">
                <Info className="h-4 w-4 text-primary shrink-0" />
                <span>
                  Community reports are crowd-sourced user observations. Moderator review assesses relevance and policy adherence, not official police evidence.
                </span>
              </div>

              {/* Selected Report Highlight Banner */}
              {selectedReport && (
                <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 flex items-start justify-between gap-2 shadow-xs animate-in fade-in duration-150">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px] border-primary/50 text-primary font-semibold">
                        Selected on map
                      </Badge>
                      {(() => {
                        const meta = getStatusMeta(selectedReport.status);
                        return (
                          <Badge variant="outline" className={cn("text-[10px]", meta.badgeClass)}>
                            {meta.badgeText}
                          </Badge>
                        );
                      })()}
                      <span className="text-xs font-semibold truncate">{selectedReport.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{selectedReport.description}</p>
                    <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-primary shrink-0" />
                      {selectedReport.area || selectedReport.location_label || "Location not specified"} · {formatReportTime(selectedReport.reported_at || selectedReport.reportedAt || selectedReport.created_at)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs rounded-lg shrink-0"
                    onClick={() => setSelectedReportId(null)}
                  >
                    Clear
                  </Button>
                </div>
              )}

              {reportsQuery.isLoading ? (
                <Card className="border-border/60">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="mt-2 text-xs font-medium text-muted-foreground">
                      Loading community reports from SQLite...
                    </p>
                  </CardContent>
                </Card>
              ) : reportsQuery.isError ? (
                <Card className="border-destructive/30 bg-destructive/5">
                  <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                    <AlertCircle className="h-6 w-6 text-destructive" />
                    <p className="mt-2 text-xs font-semibold text-destructive">
                      Failed to load community reports from server.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 rounded-xl text-xs"
                      onClick={() => reportsQuery.refetch()}
                    >
                      Retry
                    </Button>
                  </CardContent>
                </Card>
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={HeartHandshake}
                  title="No reports matching filters"
                  description="Try selecting a different status or category, or submit the first report."
                />
              ) : (
                filtered.map((r) => {
                  const statusMeta = getStatusMeta(r.status);
                  const isDemo = Boolean(r.is_demo);
                  const recency = formatReportRecency(r.reported_at || r.reportedAt || r.created_at);
                  const timeFormatted = formatReportTime(r.reported_at || r.reportedAt || r.created_at);

                  return (
                    <div
                      key={String(r.id)}
                      onClick={() => setSelectedReportId(r.id)}
                      className={cn(
                        "rounded-2xl border bg-card p-4 shadow-xs transition-all cursor-pointer hover:border-primary/50",
                        selectedReportId === r.id && "border-primary ring-1 ring-primary/40 bg-primary/[0.02]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-sm font-semibold">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: CATEGORY_COLORS[r.category as ReportCategory] ?? "#64748b" }}
                            />
                            {r.title}
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                              <span className="truncate">
                                {r.area || r.location_label || "Location not specified"}
                              </span>
                            </span>
                            <span>·</span>
                            <span className="shrink-0">{timeFormatted}</span>
                            <span className="text-[10px] text-muted-foreground/80">({recency})</span>
                            {typeof r.lat === "number" && typeof r.lng === "number" && (r.lat !== 0 || r.lng !== 0) ? (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                                Mapped
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground italic">
                                List only
                              </Badge>
                            )}
                          </p>
                        </div>

                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 shrink-0">
                          {isDemo ? (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                              Demo sample
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
                              Community report
                            </Badge>
                          )}
                          <Badge variant="outline" className={cn("text-[10px] font-medium", statusMeta.badgeClass)}>
                            {r.status === "verified" ? (
                              <BadgeCheck className="h-3 w-3 mr-1" />
                            ) : r.status === "unverified" ? (
                              <ShieldAlert className="h-3 w-3 mr-1" />
                            ) : r.status === "resolved" ? (
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                            ) : r.status === "rejected" ? (
                              <XCircle className="h-3 w-3 mr-1" />
                            ) : (
                              <Clock className="h-3 w-3 mr-1" />
                            )}
                            {statusMeta.badgeText}
                          </Badge>
                        </div>
                      </div>

                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{r.description}</p>

                      {/* Status Explanation Note */}
                      <div className="mt-2.5 rounded-lg bg-muted/40 p-2 text-[11px] text-muted-foreground border border-border/40 leading-relaxed">
                        <span className="font-semibold text-foreground/80">Status note:</span> {statusMeta.explanation}
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2.5">
                        <span className="text-xs text-muted-foreground">
                          {r.verifications} confirmations
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedReportId(r.id);
                          }}
                        >
                          View on map
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </TabsContent>

            {/* Moderation Desk Tab */}
            <TabsContent value="moderation" className="mt-3 space-y-3.5">
              {/* Security Boundary Notice */}
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <Lock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>Prototype Moderation Security Boundary</span>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                  NightWise operates in prototype mode without a centralized identity service. Moderation actions are guarded by the developer access header (<code>X-Moderator-Key</code>) to prevent unauthorized public status modifications. In production, this requires role-based JWT authentication.
                </p>
              </div>

              {/* Key Configuration */}
              <div className="rounded-xl border bg-card p-3 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="mod-key" className="text-xs font-semibold flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-primary" /> Moderator Access Key
                  </Label>
                  <span className="text-[10px] text-muted-foreground">Passed via X-Moderator-Key</span>
                </div>
                <Input
                  id="mod-key"
                  type="password"
                  value={moderatorKey}
                  onChange={(e) => setModeratorKey(e.target.value)}
                  placeholder="Enter X-Moderator-Key..."
                  className="h-8 text-xs font-mono"
                />
              </div>

              {/* Status Filter for Moderation */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: "all", label: "All reports" },
                  { id: "unverified", label: "Unverified queue" },
                  { id: "under_review", label: "Under review" },
                  { id: "verified", label: "Verified" },
                  { id: "resolved", label: "Resolved" },
                  { id: "rejected", label: "Rejected" },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setModFilter(st.id)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                      modFilter === st.id
                        ? "border-primary bg-primary text-primary-foreground font-semibold shadow-xs"
                        : "bg-muted/50 hover:bg-muted text-muted-foreground",
                    )}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              {moderationQuery.isLoading ? (
                <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading review queue...
                </div>
              ) : moderationQuery.isError ? (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  <p className="font-semibold">Authorization / Load Error</p>
                  <p className="text-[11px] mt-0.5">
                    {(moderationQuery.error as any)?.detail || "Invalid moderator key or server unreachable."}
                  </p>
                </div>
              ) : moderationReports.length === 0 ? (
                <EmptyState
                  icon={ShieldCheck}
                  title="Queue is clear"
                  description="No reports match the moderation filter."
                />
              ) : (
                moderationReports.map((r) => {
                  const meta = getStatusMeta(r.status);
                  const isDemo = Boolean(r.is_demo);

                  return (
                    <div key={String(r.id)} className="rounded-xl border bg-card p-3.5 shadow-xs space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: CATEGORY_COLORS[r.category as ReportCategory] ?? "#64748b" }}
                            />
                            #{r.id} · {r.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {r.area || r.location_label || "Area not specified"} · {formatReportTime(r.created_at || r.reported_at)}
                          </p>
                        </div>
                        <Badge variant="outline" className={cn("text-[10px] shrink-0", meta.badgeClass)}>
                          {meta.badgeText}
                        </Badge>
                      </div>

                      <p className="text-xs text-muted-foreground line-clamp-2">{r.description}</p>

                      {/* Display existing private moderator note if present */}
                      {r.moderator_notes && (
                        <div className="rounded-lg bg-accent/40 border border-accent p-2 text-[11px] text-accent-foreground">
                          <span className="font-semibold">Private Moderator Note:</span> {r.moderator_notes}
                        </div>
                      )}

                      {/* Action buttons based on lifecycle rules */}
                      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/50">
                        {r.status !== "verified" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                            onClick={() =>
                              setConfirmModal({
                                reportId: r.id,
                                title: r.title,
                                currentStatus: r.status,
                                targetStatus: "verified",
                                actionLabel: "Approve / Verify Report",
                                note: r.moderator_notes || "",
                              })
                            }
                          >
                            <BadgeCheck className="h-3 w-3 mr-1" /> Verify
                          </Button>
                        )}

                        {r.status !== "under_review" && r.status !== "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-sky-600 dark:text-sky-400 hover:bg-sky-500/10"
                            onClick={() =>
                              setConfirmModal({
                                reportId: r.id,
                                title: r.title,
                                currentStatus: r.status,
                                targetStatus: "under_review",
                                actionLabel: "Mark Under Review",
                                note: r.moderator_notes || "",
                              })
                            }
                          >
                            <Clock className="h-3 w-3 mr-1" /> Under Review
                          </Button>
                        )}

                        {r.status !== "resolved" && r.status === "verified" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-500/10"
                            onClick={() =>
                              setConfirmModal({
                                reportId: r.id,
                                title: r.title,
                                currentStatus: r.status,
                                targetStatus: "resolved",
                                actionLabel: "Mark Resolved",
                                note: r.moderator_notes || "",
                              })
                            }
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Resolve
                          </Button>
                        )}

                        {r.status !== "rejected" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-destructive hover:bg-destructive/10"
                            onClick={() =>
                              setConfirmModal({
                                reportId: r.id,
                                title: r.title,
                                currentStatus: r.status,
                                targetStatus: "rejected",
                                actionLabel: "Reject Report",
                                note: r.moderator_notes || "",
                              })
                            }
                          >
                            <XCircle className="h-3 w-3 mr-1" /> Reject
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Confirmation Modal for Moderation Decisions */}
      {confirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
          onClick={() => {
            if (!moderationMutation.isPending) setConfirmModal(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border/80 bg-card p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" /> Confirm Moderation Action
              </h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                You are changing Report <span className="font-semibold text-foreground">#{confirmModal.reportId}</span> (
                <em>{confirmModal.title}</em>) from <span className="font-semibold">{confirmModal.currentStatus}</span> to{" "}
                <span className="font-semibold text-primary">{confirmModal.targetStatus}</span>.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mod-note" className="text-xs font-semibold">
                Private Moderator Note (Optional)
              </Label>
              <Textarea
                id="mod-note"
                value={confirmModal.note}
                onChange={(e) =>
                  setConfirmModal({
                    ...confirmModal,
                    note: e.target.value,
                  })
                }
                placeholder="Internal investigation details or reason for moderation decision (never displayed publicly)..."
                rows={3}
                className="text-xs resize-none"
              />
              <p className="text-[10px] text-muted-foreground">
                Private notes are only accessible to authorized moderators.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
              <Button
                size="sm"
                variant="ghost"
                className="rounded-xl text-xs"
                onClick={() => setConfirmModal(null)}
                disabled={moderationMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="rounded-xl text-xs gap-1.5 shadow-xs"
                onClick={() =>
                  moderationMutation.mutate({
                    reportId: confirmModal.reportId,
                    status: confirmModal.targetStatus,
                    note: confirmModal.note,
                  })
                }
                disabled={moderationMutation.isPending}
              >
                {moderationMutation.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Applying...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Confirm {confirmModal.actionLabel}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Submission Dialog / Modal */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
          onClick={() => {
            if (!createMutation.isPending) setFormOpen(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border/80 bg-card p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <Navigation className="h-5 w-5 text-primary" /> File a community safety report
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Saved directly to SQLite backend (<code className="text-xs">POST /api/v1/community-reports</code>).
                All submissions start in an <span className="font-semibold text-amber-600 dark:text-amber-400">unverified</span> status.
              </p>
            </div>

            {/* Server Error Alert */}
            {serverError && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Server Error</p>
                  <p className="text-[11px] mt-0.5">{serverError}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-3.5">
              {/* Category */}
              <div className="space-y-1.5">
                <Label htmlFor="report-category" className="text-xs font-semibold">
                  Category <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={fCategory}
                  onValueChange={(v) => setFCategory(v as ReportCategory)}
                  disabled={createMutation.isPending}
                >
                  <SelectTrigger id="report-category" className="rounded-xl text-xs h-9">
                    <SelectValue placeholder="Select report category" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {REPORT_CATEGORIES.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: CATEGORY_COLORS[c.id] ?? "#64748b" }}
                          />
                          {c.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Title */}
              <div className="space-y-1.5">
                <Label htmlFor="report-title" className="text-xs font-semibold">
                  Title <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="report-title"
                  placeholder="Short summary (e.g. Broken streetlamp near bus stop)"
                  value={fTitle}
                  onChange={(e) => setFTitle(e.target.value)}
                  className="rounded-xl text-xs h-9"
                  disabled={createMutation.isPending}
                />
                {formErrors.title && (
                  <p className="text-[11px] font-medium text-destructive">{formErrors.title}</p>
                )}
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="report-desc" className="text-xs font-semibold">
                  Description <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="report-desc"
                  placeholder="Describe what you observed and why it affects night safety..."
                  value={fDesc}
                  onChange={(e) => setFDesc(e.target.value)}
                  className="rounded-xl text-xs resize-none"
                  rows={3}
                  disabled={createMutation.isPending}
                />
                {formErrors.description && (
                  <p className="text-[11px] font-medium text-destructive">{formErrors.description}</p>
                )}
              </div>

              {/* Location selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="report-area" className="text-xs font-semibold">
                    Location / Area
                  </Label>
                  <button
                    type="button"
                    onClick={() => setIsCustomArea(!isCustomArea)}
                    className="text-[11px] text-primary hover:underline"
                    disabled={createMutation.isPending}
                  >
                    {isCustomArea ? "Pick known area" : "Enter custom location"}
                  </button>
                </div>

                {isCustomArea ? (
                  <Input
                    placeholder="Enter street, landmark, or neighborhood"
                    value={fCustomArea}
                    onChange={(e) => setFCustomArea(e.target.value)}
                    className="rounded-xl text-xs h-9"
                    disabled={createMutation.isPending}
                  />
                ) : (
                  <Select
                    value={fArea}
                    onValueChange={setFArea}
                    disabled={createMutation.isPending}
                  >
                    <SelectTrigger id="report-area" className="rounded-xl text-xs h-9">
                      <SelectValue placeholder="Select known neighborhood" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {DEMO_LOCATIONS.map((loc) => (
                        <SelectItem key={loc.name} value={loc.name} className="text-xs">
                          {loc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* GPS Coordinates attach */}
              <div className="rounded-xl bg-muted/30 border border-border/50 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Locate className="h-3.5 w-3.5" /> Precise GPS coordinates
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 text-[11px] px-2 rounded-lg"
                    onClick={handleGetLocation}
                    disabled={gpsLoading || createMutation.isPending}
                  >
                    {gpsLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Locate className="h-3 w-3 mr-1" />
                    )}
                    {gpsCoords ? "Update GPS" : "Attach GPS"}
                  </Button>
                </div>
                {gpsCoords ? (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
                    ✓ Coordinates: {gpsCoords.lat.toFixed(5)}, {gpsCoords.lng.toFixed(5)}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Optional. Will map with area coordinates if not attached.
                  </p>
                )}
                {gpsNote && <p className="text-[11px] text-muted-foreground italic">{gpsNote}</p>}
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-xl text-xs"
                  onClick={() => setFormOpen(false)}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="rounded-xl text-xs gap-1.5 shadow-xs"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Submit report
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
