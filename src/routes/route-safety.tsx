import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, Bike, Building2, Bus, Car, Clock3, Compass, Eye, EyeOff, Footprints, Lightbulb, MapPin, MoonStar, Radar, Route as RouteIcon, ShieldAlert, Sparkles, Video } from "lucide-react";

import { AppLayout } from "@/components/layout/app-layout";
import { PageHeader, SafetyBanner } from "@/components/shared";
import { MapView } from "@/components/map/map-view";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CATEGORY_COLORS, COMMUNITY_REPORTS, DEMO_LOCATIONS } from "@/data/mock";
import { useTheme } from "@/lib/theme";
import { brandTitle, pageMeta } from "@/lib/page-meta";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api-client";
import { compareRoutes } from "@/api/routes";
import type { RouteAlternative, RouteCompareResponse } from "@/api/routes";
import { fetchSafetyData } from "@/api/safety-data";
import type { DemoSafetyRecord } from "@/api/safety-data";
import type { MapMarker, RouteOption, SafetyLevel, TransportMode } from "@/types";

export const Route = createFileRoute("/route-safety")({
  head: () =>
    pageMeta(
      brandTitle("Route Safety"),
      "Compare Fastest, Balanced and Safest routes with demo night-activity scores, data coverage and freshness flags.",
    ),
  component: RouteSafety,
});

const ROUTE_COLORS: Record<string, string> = { fastest: "#8b5cf6", balanced: "#e060a8", safest_available_data: "#22a06b" };

const FALLBACK_ORIGIN = { name: "MG Road Metro", lat: 12.9756, lng: 77.6068 };
const FALLBACK_DEST = { name: "Koramangala 5th Block", lat: 12.9345, lng: 77.622 };
const MODE_LABEL: Record<TransportMode, string> = { walk: "Walking", car: "Car", bike: "Bike" };

const TONE_STYLES = {
  high: "border-success/40 bg-success/10 text-success",
  medium: "border-warning/40 bg-warning/10 text-warning-foreground",
  limited: "border-destructive/30 bg-destructive/10 text-destructive",
} as const;

function getSignalConfig(signalType: string) {
  switch (signalType) {
    case "public_transport":
      return {
        label: "Public transport",
        tone: "primary" as const,
        icon: Bus,
        description: "Transit connectivity",
        badgeClass: "border-primary/30 bg-primary/10 text-primary",
      };
    case "assistance_point":
      return {
        label: "Assistance points",
        tone: "success" as const,
        icon: ShieldAlert,
        description: "Help points & kiosks",
        badgeClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      };
    case "lighting":
      return {
        label: "Street lighting",
        tone: "warning" as const,
        icon: Lightbulb,
        description: "Illuminated corridors",
        badgeClass: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      };
    case "cctv":
      return {
        label: "CCTV",
        tone: "pink" as const,
        icon: Video,
        description: "Public observation points",
        badgeClass: "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300",
      };
    case "community_safety_report":
    default:
      return {
        label: "Community reports",
        tone: "destructive" as const,
        icon: AlertCircle,
        description: "Local community observations",
        badgeClass: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
      };
  }
}

/** Derive a SafetyLevel tone from the backend confidence string and nightScore. */
function toTone(alt: RouteAlternative): SafetyLevel {
  if (alt.confidence === "high") return "high";
  if (alt.confidence === "low") return "limited";
  return "medium";
}

/** Map a backend RouteAlternative to the RouteOption shape the existing card UI expects. */
function toRouteOption(alt: RouteAlternative): RouteOption {
  return {
    id: alt.id,
    label: alt.label,
    tone: toTone(alt),
    distanceKm: alt.distanceKm,
    durationMin: alt.durationMin,
    detourPct: alt.detourPct,
    nightScore: alt.nightScore,
    dataCoveragePct: alt.dataCoveragePct,
    freshnessHours: alt.freshnessHours,
    gaps:
      alt.gap.gap_km > 0
        ? [{ from: alt.gap.gap_from, to: alt.gap.gap_to, note: alt.gap.note }]
        : [],
    notes: alt.notes,
    coords: alt.coords,
    evidence: alt.evidence,
    demo_context: alt.demo_context,
  };
}


/** Extract the RouteOptions from the backend response in display order. */
function toRouteOptions(data: RouteCompareResponse): RouteOption[] {
  if (data.routes && data.routes.length > 0) {
    return data.routes.map(toRouteOption);
  }
  const result: RouteOption[] = [];
  if (data.fastest) result.push(toRouteOption(data.fastest));
  if (data.balanced && data.balanced.id !== data.fastest?.id) {
    result.push(toRouteOption(data.balanced));
  }
  if (
    data.safest_available_data &&
    data.safest_available_data.id !== data.fastest?.id &&
    data.safest_available_data.id !== data.balanced?.id
  ) {
    result.push(toRouteOption(data.safest_available_data));
  }
  return result;
}

function RouteSafety() {
  const [origin, setOrigin] = useState("MG Road Metro");
  const [destination, setDestination] = useState("Koramangala 5th Block");
  const [mode, setMode] = useState<TransportMode>("walk");
  const [selected, setSelected] = useState("balanced");
  const [showReports, setShowReports] = useState(true);
  const [showDemoSignals, setShowDemoSignals] = useState(true);
  const [demoSignalFilter, setDemoSignalFilter] = useState<string>("all");
  const { theme } = useTheme();

  const safetyDataQuery = useQuery({
    queryKey: ["safety-data", demoSignalFilter],
    queryFn: () => fetchSafetyData(demoSignalFilter === "all" ? undefined : demoSignalFilter),
    staleTime: 5 * 60 * 1000,
  });

  const demoRecords = safetyDataQuery.data?.records ?? [];

  const mutation = useMutation({
    mutationFn: () =>
      compareRoutes({
        origin: origin.trim(),
        destination: destination.trim(),
        mode,
      }),
    onSuccess: (data) => {
      const opts = toRouteOptions(data);
      if (opts.length === 0) return;
      const hasBalanced = opts.some((o) => o.id === "balanced");
      if (hasBalanced) {
        setSelected("balanced");
      } else {
        setSelected(opts[0]?.id ?? "fastest");
      }
    },
  });

  const routes: RouteOption[] = useMemo(
    () => (mutation.data ? toRouteOptions(mutation.data) : []),
    [mutation.data],
  );

  const points = useMemo(() => {
    if (routes.length > 0 && routes[0]?.coords.length) {
      const coords = routes[0].coords;
      const first = coords[0] ?? [FALLBACK_ORIGIN.lat, FALLBACK_ORIGIN.lng];
      const last = coords[coords.length - 1] ?? [FALLBACK_DEST.lat, FALLBACK_DEST.lng];
      return {
        o: { name: origin, lat: first[0], lng: first[1] },
        d: { name: destination, lat: last[0], lng: last[1] },
      };
    }
    const o = DEMO_LOCATIONS.find((l) => l.name === origin) ?? FALLBACK_ORIGIN;
    const d = DEMO_LOCATIONS.find((l) => l.name === destination) ?? FALLBACK_DEST;
    return { o, d };
  }, [routes, origin, destination]);

  const polylines = useMemo(() => {
    if (!routes.length) return [];
    return routes.map((r) => ({
      coords: r.coords,
      color: ROUTE_COLORS[r.id] ?? "#8b5cf6",
      weight: selected === r.id ? 6 : 3.5,
      dashed: r.tone === "limited",
      opacity: selected === r.id ? 0.95 : 0.45,
    }));
  }, [routes, selected]);

  const reportCircles = useMemo(() => {
    if (!routes.length || !showReports) return [];
    return COMMUNITY_REPORTS.map((r) => ({
      lat: r.lat,
      lng: r.lng,
      radiusM: 220,
      color: CATEGORY_COLORS[r.category],
    }));
  }, [routes, showReports]);

  const mapMarkers = useMemo(() => {
    const list: MapMarker[] = [
      { lat: points.o.lat, lng: points.o.lng, label: `From: ${points.o.name}`, tone: "primary" },
      { lat: points.d.lat, lng: points.d.lng, label: `To: ${points.d.name}`, tone: "pink" },
    ];
    if (showDemoSignals && demoRecords.length > 0) {
      for (const rec of demoRecords) {
        const cfg = getSignalConfig(rec.signal_type);
        list.push({
          lat: rec.latitude,
          lng: rec.longitude,
          label: `${rec.location} (${cfg.label})`,
          subLabel: rec.description,
          tone: cfg.tone,
          isDemo: true,
        });
      }
    }
    return list;
  }, [points, showDemoSignals, demoRecords]);

  const errorMessage = useMemo(() => {
    if (!mutation.error) return null;
    if (mutation.error instanceof ApiError) {
      if (mutation.error.status === 404) {
        return (
          mutation.error.detail ||
          "Location or route not found. Please check spelling or enter coordinates (lat, lng)."
        );
      }
      if (mutation.error.status === 503) {
        return (
          mutation.error.detail ||
          "Routing provider is not configured. OPENROUTESERVICE_API_KEY is missing."
        );
      }
      if (mutation.error.status === 429) {
        return (
          mutation.error.detail ||
          "Routing provider rate limit reached. Please try again shortly."
        );
      }
      if (mutation.error.status === 502 || mutation.error.status === 504) {
        return (
          mutation.error.detail ||
          "Routing provider service error or timeout. Please try again."
        );
      }
      return `Backend error (${mutation.error.status}): ${mutation.error.detail}`;
    }
    if (
      mutation.error instanceof TypeError ||
      mutation.error.name === "TypeError" ||
      mutation.error.message?.toLowerCase().includes("fetch")
    ) {
      return "Could not reach the backend. Make sure the FastAPI server is running on port 8000.";
    }
    return mutation.error.message || "An unexpected error occurred. Please try again.";
  }, [mutation.error]);

  const isAnalyzing = mutation.isPending;
  const isAnalyzed = mutation.isSuccess && routes.length > 0;

  return (
    <AppLayout>
      <PageHeader
        title="Route Safety"
        description="Compare real route alternatives with estimated night-activity indicators and available corridor context."
      />

      <SafetyBanner>
        Route geometry, distance, and duration are provided live by OpenRouteService.
        Night activity scores and safety signals provide illustrative context to assist travel evaluation.
        They do not replace personal judgement or verify real-time conditions.
      </SafetyBanner>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Controls */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <Compass className="h-4 w-4 text-primary" /> Plan a trip
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">From</label>
                <Input
                  value={origin}
                  onChange={(e) => {
                    setOrigin(e.target.value);
                    mutation.reset();
                  }}
                  placeholder="e.g. MG Road Metro, Bengaluru or 12.9756, 77.6068"
                  list="origin-suggestions"
                />
                <datalist id="origin-suggestions">
                  {DEMO_LOCATIONS.map((l) => (
                    <option key={l.name} value={l.name} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">To</label>
                <Input
                  value={destination}
                  onChange={(e) => {
                    setDestination(e.target.value);
                    mutation.reset();
                  }}
                  placeholder="e.g. Koramangala 5th Block or 12.9345, 77.622"
                  list="destination-suggestions"
                />
                <datalist id="destination-suggestions">
                  {DEMO_LOCATIONS.map((l) => (
                    <option key={l.name} value={l.name} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mode</label>
                <ToggleGroup
                  type="single"
                  value={mode}
                  onValueChange={(v) => v && setMode(v as TransportMode)}
                  className="w-full"
                  variant="outline"
                >
                  <ToggleGroupItem value="walk" className="flex-1 gap-1.5" aria-label="Walking">
                    <Footprints className="h-4 w-4" /> Walk
                  </ToggleGroupItem>
                  <ToggleGroupItem value="car" className="flex-1 gap-1.5" aria-label="Car">
                    <Car className="h-4 w-4" /> Car
                  </ToggleGroupItem>
                  <ToggleGroupItem value="bike" className="flex-1 gap-1.5" aria-label="Bike">
                    <Bike className="h-4 w-4" /> Bike
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              <Button
                onClick={() => mutation.mutate()}
                disabled={
                  isAnalyzing ||
                  !origin.trim() ||
                  !destination.trim() ||
                  origin.trim().toLowerCase() === destination.trim().toLowerCase()
                }
                className="w-full rounded-xl"
              >
                {isAnalyzing ? "Analyzing…" : isAnalyzed ? "Re-analyze" : "Analyze routes"}
              </Button>
              <p className="text-xs text-muted-foreground">
                {MODE_LABEL[mode]} · OpenRouteService live routing · safety heuristics are simulated demo data
              </p>
            </CardContent>
          </Card>

          {/* Error state */}
          {mutation.isError && errorMessage && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {/* Loading skeletons */}
          {isAnalyzing && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-40 rounded-2xl" />
              ))}
            </div>
          )}

          {/* Route cards */}
          {isAnalyzed && !isAnalyzing && (
            <div className="space-y-3">
              {routes.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                  className={cn(
                    "w-full rounded-2xl border bg-card p-4 text-left shadow-[var(--shadow-card)] transition-all",
                    selected === r.id ? "ring-2 ring-ring" : "hover:border-ring/50",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-2 font-display font-semibold">
                      <RouteIcon className="h-4 w-4" style={{ color: ROUTE_COLORS[r.id] ?? "#8b5cf6" }} />
                      {r.label}
                    </p>
                    {r.evidence?.status === "available" ? (
                      <Badge
                        variant="outline"
                        className="border-success/40 bg-success/10 text-success text-[11px] font-medium"
                      >
                        Mapped context
                      </Badge>
                    ) : r.demo_context ? (
                      <Badge
                        variant="outline"
                        className="border-border bg-muted/60 text-muted-foreground text-[11px] font-medium"
                      >
                        Safety context
                      </Badge>
                    ) : r.evidence ? (
                      <Badge
                        variant="outline"
                        className="border-muted text-muted-foreground text-[11px] font-normal"
                      >
                        Data unavailable
                      </Badge>
                    ) : (
                      <Badge variant="outline" className={TONE_STYLES[r.tone]}>
                        {r.tone === "high" ? "Better coverage" : r.tone === "medium" ? "Mixed signals" : "Limited data"}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <span className="flex items-center gap-1.5">
                      <RouteIcon className="h-3.5 w-3.5 text-muted-foreground" /> {r.distanceKm} km
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock3 className="h-3.5 w-3.5 text-muted-foreground" /> {r.durationMin} min
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Compass className="h-3.5 w-3.5 text-muted-foreground" /> +{r.detourPct}% detour
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Radar className="h-3.5 w-3.5 text-muted-foreground" /> {r.dataCoveragePct}% coverage index
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-xs font-medium">
                        <span className="flex items-center gap-1.5">
                          <MoonStar className="h-3.5 w-3.5 text-primary" /> Night Activity Score
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-normal">
                            Estimated
                          </span>
                        </span>
                        <span className="font-semibold text-foreground">{r.nightScore}/100</span>
                      </div>
                      <Progress value={r.nightScore} className="h-1.5" />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Activity indicator from available corridor signals · {r.freshnessHours}h update index
                    </p>
                    {r.gaps.length > 0 && (
                      <ul className="space-y-1">
                        {r.gaps.map((g, i) => (
                          <li key={i} className="rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-800 dark:text-amber-200">
                            Segment with limited recorded activity: {g.from} – {g.to} · {g.note}
                          </li>
                        ))}
                      </ul>
                    )}
                    <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                      {r.notes.map((n, i) => (
                        <li key={i}>• {n}</li>
                      ))}
                    </ul>

                    {/* Safety Context Section */}
                    {(r.demo_context || r.evidence) && (
                      <div className="mt-3.5 rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                            <Building2 className="h-3.5 w-3.5 text-primary" /> Safety context
                          </p>
                          <span className="text-[10px] text-muted-foreground font-normal">
                            {r.evidence?.status === "available"
                              ? "OpenStreetMap verified"
                              : "Illustrative data"}
                          </span>
                        </div>

                        {/* Live OSM status — calm notice when OSM is unavailable */}
                        {r.evidence && r.evidence.status !== "available" && (
                          <p className="text-[10.5px] text-muted-foreground leading-normal">
                            Live geographic context unavailable · Displaying illustrative corridor information ({r.demo_context?.filter_description || "Corridor proximity"}). Unrecorded data in public databases does not indicate an area is unsafe.
                          </p>
                        )}

                        {/* If Live OSM is available, show real counts first */}
                        {r.evidence?.status === "available" && (
                          <div className="space-y-1.5 border-b border-border/40 pb-2">
                            <p className="text-[10px] text-muted-foreground">Mapped context ({r.evidence.attribution})</p>
                            <div className="grid grid-cols-2 gap-1.5 text-xs">
                              <div className="flex items-center justify-between rounded-lg bg-card/80 px-2.5 py-1.5 border border-border/40">
                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                  <Bus className="h-3 w-3 text-primary/70" /> Public transport:
                                </span>
                                <span className="font-semibold text-foreground">{r.evidence.counts.transport_stops} stops</span>
                              </div>
                              <div className="flex items-center justify-between rounded-lg bg-card/80 px-2.5 py-1.5 border border-border/40">
                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                  <ShieldAlert className="h-3 w-3 text-primary/70" /> Assistance:
                                </span>
                                <span className="font-semibold text-foreground">{r.evidence.counts.assistance_amenities} points</span>
                              </div>
                              <div className="flex items-center justify-between rounded-lg bg-card/80 px-2.5 py-1.5 border border-border/40">
                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                  <Lightbulb className="h-3 w-3 text-primary/70" /> Street lighting:
                                </span>
                                <span className="font-semibold text-foreground">
                                  {r.evidence.counts.street_lamps + r.evidence.counts.lit_path_segments} tagged
                                </span>
                              </div>
                              <div className="flex items-center justify-between rounded-lg bg-card/80 px-2.5 py-1.5 border border-border/40">
                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                  <Video className="h-3 w-3 text-primary/70" /> CCTV:
                                </span>
                                <span className="font-semibold text-foreground">{r.evidence.counts.surveillance_points} cameras</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Category Breakdown (Public Transport, Assistance Points, Street Lighting, CCTV, Community Reports) */}
                        {r.demo_context && (
                          <div className="grid grid-cols-2 gap-1.5 text-xs">
                            <div className="flex items-center justify-between rounded-lg bg-card px-2.5 py-1.5 border border-border/50">
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <Bus className="h-3.5 w-3.5 text-primary/80 shrink-0" /> Public transport:
                              </span>
                              <span className="font-medium text-foreground">
                                {r.demo_context.counts.public_transport} {r.demo_context.counts.public_transport === 1 ? "stop" : "stops"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between rounded-lg bg-card px-2.5 py-1.5 border border-border/50">
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <ShieldAlert className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" /> Assistance:
                              </span>
                              <span className="font-medium text-foreground">
                                {r.demo_context.counts.assistance_points} {r.demo_context.counts.assistance_points === 1 ? "point" : "points"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between rounded-lg bg-card px-2.5 py-1.5 border border-border/50">
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <Lightbulb className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" /> Street lighting:
                              </span>
                              <span className="font-medium text-foreground">
                                {r.demo_context.counts.lighting} {r.demo_context.counts.lighting === 1 ? "segment" : "segments"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between rounded-lg bg-card px-2.5 py-1.5 border border-border/50">
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <Video className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 shrink-0" /> CCTV:
                              </span>
                              <span className="font-medium text-foreground">
                                {r.demo_context.counts.cctv} {r.demo_context.counts.cctv === 1 ? "camera" : "cameras"}
                              </span>
                            </div>
                            <div className="col-span-2 flex items-center justify-between rounded-lg bg-card px-2.5 py-1.5 border border-border/50">
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <AlertCircle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" /> Community reports:
                              </span>
                              <span className="font-medium text-foreground">
                                {r.demo_context.counts.community_safety_reports} {r.demo_context.counts.community_safety_reports === 1 ? "report" : "reports"}
                              </span>
                            </div>
                          </div>
                        )}

                        <p className="text-[10px] leading-tight text-muted-foreground/75 border-t border-border/40 pt-1.5">
                          Illustrative data is sample information to demonstrate feature capabilities. Scores and context do not certify real-world safety.
                        </p>
                      </div>
                    )}
                  </div>
                </button>
              ))}

              {mutation.data && (
                <p className="px-1 text-[11px] text-muted-foreground">{mutation.data.disclaimer}</p>
              )}
            </div>
          )}

          {/* Empty state — no results despite success */}
          {mutation.isSuccess && routes.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                The backend returned no route options for this pair.
              </CardContent>
            </Card>
          )}

          {/* Idle state */}
          {!isAnalyzed && !isAnalyzing && !mutation.isError && (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Pick an origin and destination, then run the analysis to see the three route options.
              </CardContent>
            </Card>
          )}
        </div>

        {/* Map & Available Signals */}
        <div className="space-y-4 lg:col-span-3">
          <Card className="overflow-hidden">
            <CardHeader className="flex-row items-center justify-between pb-3 flex-wrap gap-2">
              <div>
                <CardTitle className="font-display text-base">Route Map</CardTitle>
                <p className="text-xs text-muted-foreground">Live routing geometry with mapped safety indicators</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={showDemoSignals ? "secondary" : "outline"}
                  size="sm"
                  className="gap-1.5 rounded-lg text-xs font-medium"
                  onClick={() => setShowDemoSignals((s) => !s)}
                  title="Toggle illustrative safety context markers on map"
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Safety markers
                </Button>
                <Button
                  variant={showReports ? "secondary" : "outline"}
                  size="sm"
                  className="gap-1.5 rounded-lg text-xs font-medium"
                  onClick={() => setShowReports((s) => !s)}
                >
                  {showReports ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  Community areas
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <MapView
                dark={theme === "dark"}
                center={[points.o.lat, points.o.lng]}
                zoom={13}
                polylines={polylines}
                circles={reportCircles}
                markers={mapMarkers}
                className="h-[420px] w-full"
              />
              <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground flex-wrap">
                <span>
                  Base map © OpenStreetMap contributors. Route geometry calculated live via OpenRouteService.
                </span>
                {showDemoSignals && (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rotate-45 border border-primary/60 bg-primary/30 rounded-xs" />
                    Diamonds denote illustrative safety signals
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Available Safety Signals Panel */}
          <Card>
            <CardHeader className="space-y-1.5 pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Radar className="h-4 w-4 text-primary" />
                  <CardTitle className="font-display text-base">Available safety signals</CardTitle>
                </div>
                <Badge variant="outline" className="border-border text-muted-foreground font-normal text-[10px]">
                  Illustrative data
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Sample mapped infrastructure and community observations across Bengaluru corridors to preview signal tracking and category filtering.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filter Pills */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: "all", label: "All signals" },
                  { id: "public_transport", label: "Public transport" },
                  { id: "assistance_point", label: "Assistance points" },
                  { id: "lighting", label: "Street lighting" },
                  { id: "cctv", label: "CCTV" },
                  { id: "community_safety_report", label: "Community reports" },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setDemoSignalFilter(cat.id)}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors border",
                      demoSignalFilter === cat.id
                        ? "border-primary bg-primary text-primary-foreground shadow-xs"
                        : "border-border bg-card hover:bg-muted text-muted-foreground",
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Status & Error Handling */}
              {safetyDataQuery.isLoading && (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 rounded-xl" />
                  ))}
                </div>
              )}

              {safetyDataQuery.isError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Could not retrieve sample safety signals. Live route calculation and OpenRouteService navigation remain active.
                  </AlertDescription>
                </Alert>
              )}

              {/* Records List */}
              {!safetyDataQuery.isLoading && !safetyDataQuery.isError && (
                <>
                  <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1">
                    {demoRecords.map((r) => {
                      const cfg = getSignalConfig(r.signal_type);
                      const Icon = cfg.icon;
                      return (
                        <div
                          key={r.id}
                          className="rounded-xl border border-border/60 bg-card p-3 space-y-1.5 text-xs shadow-xs hover:border-primary/40 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 font-medium text-foreground">
                              <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                              <span className="truncate">{r.location}</span>
                            </div>
                            <span className={cn("rounded-md border px-1.5 py-0.5 text-[9.5px] font-medium shrink-0", cfg.badgeClass)}>
                              {cfg.label}
                            </span>
                          </div>
                          <p className="text-muted-foreground text-[11px] leading-relaxed">
                            {r.description}
                          </p>
                          <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-1 font-mono">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}
                            </span>
                            <span className="font-normal text-muted-foreground">
                              Sample observation
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2 text-[10.5px] text-muted-foreground flex items-center justify-between">
                    <span>Showing {demoRecords.length} sample safety signals</span>
                    <span className="font-normal text-muted-foreground">Illustrative data for demonstration</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
