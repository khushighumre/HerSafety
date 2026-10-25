import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Bike, Car, Clock3, Compass, Eye, EyeOff, Footprints, MoonStar, Radar, Route as RouteIcon } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { PageHeader, SafetyBanner } from "@/components/shared";
import { MapView } from "@/components/map/map-view";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { RouteOption, SafetyLevel, TransportMode } from "@/types";

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
  };
}

/** Extract the three RouteOptions from the backend response in display order. */
function toRouteOptions(data: RouteCompareResponse): RouteOption[] {
  return [
    toRouteOption(data.fastest),
    toRouteOption(data.balanced),
    toRouteOption(data.safest_available_data),
  ];
}

function RouteSafety() {
  const [origin, setOrigin] = useState("MG Road Metro");
  const [destination, setDestination] = useState("Koramangala 5th Block");
  const [mode, setMode] = useState<TransportMode>("walk");
  const [selected, setSelected] = useState("balanced");
  const [showReports, setShowReports] = useState(true);
  const { theme } = useTheme();

  const mutation = useMutation({
    mutationFn: () => compareRoutes({ origin, destination, mode }),
    onSuccess: () => setSelected("balanced"),
  });

  const routes: RouteOption[] = useMemo(
    () => (mutation.data ? toRouteOptions(mutation.data) : []),
    [mutation.data],
  );

  const points = useMemo(() => {
    const o = DEMO_LOCATIONS.find((l) => l.name === origin) ?? FALLBACK_ORIGIN;
    const d = DEMO_LOCATIONS.find((l) => l.name === destination) ?? FALLBACK_DEST;
    return { o, d };
  }, [origin, destination]);

  const polylines = useMemo(() => {
    if (!routes.length) return [];
    return routes.map((r) => ({
      coords: r.coords,
      color: ROUTE_COLORS[r.id] ?? "#8b5cf6",
      weight: selected === r.id ? 6 : 3.5,
      dashed: r.tone === "limited",
      ...(selected !== r.id ? { opacity: 0.45 } : {}),
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

  const errorMessage = useMemo(() => {
    if (!mutation.error) return null;
    if (mutation.error instanceof ApiError) {
      if (mutation.error.status === 404) {
        return "No route fixtures available for this origin/destination pair. Try MG Road Metro → Koramangala 5th Block.";
      }
      return `Backend error (${mutation.error.status}): ${mutation.error.detail}`;
    }
    if (mutation.error instanceof TypeError) {
      return "Could not reach the backend. Make sure the FastAPI server is running on port 8000.";
    }
    return "An unexpected error occurred. Please try again.";
  }, [mutation.error]);

  const isAnalyzing = mutation.isPending;
  const isAnalyzed = mutation.isSuccess && routes.length > 0;

  return (
    <AppLayout>
      <PageHeader
        title="Route Safety"
        description="Compare route options with demo night-activity heuristics. Scores are simulated and clearly flagged — not verified real-world information."
      />

      <SafetyBanner>
        Route scores are computed from demo data only. "Safest (Limited Data)" means fewer flagged spots in the demo
        dataset — it does not mean the route was verified safe. Always use your own judgement.
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
                <Select value={origin} onValueChange={(v) => { setOrigin(v); mutation.reset(); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Origin" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEMO_LOCATIONS.map((l) => (
                      <SelectItem key={l.name} value={l.name} disabled={l.name === destination}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">To</label>
                <Select value={destination} onValueChange={(v) => { setDestination(v); mutation.reset(); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEMO_LOCATIONS.map((l) => (
                      <SelectItem key={l.name} value={l.name} disabled={l.name === origin}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                disabled={isAnalyzing || origin === destination}
                className="w-full rounded-xl"
              >
                {isAnalyzing ? "Analyzing…" : isAnalyzed ? "Re-analyze" : "Analyze routes"}
              </Button>
              <p className="text-xs text-muted-foreground">
                {MODE_LABEL[mode]} · demo locations only · no live traffic or routing APIs
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
                    <Badge variant="outline" className={TONE_STYLES[r.tone]}>
                      {r.tone === "high" ? "Better coverage" : r.tone === "medium" ? "Mixed signals" : "Limited data"}
                    </Badge>
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
                      <Radar className="h-3.5 w-3.5 text-muted-foreground" /> {r.dataCoveragePct}% data coverage
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div>
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-medium">
                        <MoonStar className="h-3.5 w-3.5 text-primary" /> Night Activity Score
                        <span className="ml-auto font-bold">{r.nightScore}/100</span>
                      </p>
                      <Progress value={r.nightScore} className="h-1.5" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Data freshness: {r.freshnessHours}h old {r.freshnessHours > 8 && "· stale"}
                    </p>
                    {r.gaps.length > 0 && (
                      <ul className="space-y-1">
                        {r.gaps.map((g, i) => (
                          <li key={i} className="rounded-lg bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
                            Low-activity gap: {g.from} – {g.to} · {g.note}
                          </li>
                        ))}
                      </ul>
                    )}
                    <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                      {r.notes.map((n, i) => (
                        <li key={i}>• {n}</li>
                      ))}
                    </ul>
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

        {/* Map */}
        <Card className="overflow-hidden lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle className="font-display text-base">Map (demo overlay)</CardTitle>
            <Button
              variant={showReports ? "secondary" : "outline"}
              size="sm"
              className="gap-1.5 rounded-lg"
              onClick={() => setShowReports((s) => !s)}
            >
              {showReports ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              Report layer
            </Button>
          </CardHeader>
          <CardContent>
            <MapView
              dark={theme === "dark"}
              center={[points.o.lat, points.o.lng]}
              zoom={13}
              polylines={polylines}
              circles={reportCircles}
              markers={[
                { lat: points.o.lat, lng: points.o.lng, label: `From: ${points.o.name}`, tone: "primary" },
                { lat: points.d.lat, lng: points.d.lng, label: `To: ${points.d.name}`, tone: "pink" },
              ]}
              className="h-[420px] w-full"
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Tiles © OpenStreetMap contributors / CARTO. Coloured halos are demo community reports, not verified
              conditions.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
