import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bike, Car, Clock3, Compass, Eye, EyeOff, Footprints, MoonStar, Radar, Route as RouteIcon } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { PageHeader, SafetyBanner } from "@/components/shared";
import { MapView } from "@/components/map/map-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CATEGORY_COLORS, COMMUNITY_REPORTS, DEMO_LOCATIONS, ROUTE_OPTIONS } from "@/data/mock";
import { useTheme } from "@/lib/theme";
import { brandTitle, pageMeta } from "@/lib/page-meta";
import { cn } from "@/lib/utils";
import type { TransportMode } from "@/types";

export const Route = createFileRoute("/route-safety")({
  head: () =>
    pageMeta(
      brandTitle("Route Safety"),
      "Compare Fastest, Balanced and Safest routes with demo night-activity scores, data coverage and freshness flags.",
    ),
  component: RouteSafety,
});

const ROUTE_COLORS: Record<string, string> = { fastest: "#8b5cf6", balanced: "#e060a8", safest: "#22a06b" };
const MODE_LABEL: Record<TransportMode, string> = { walk: "Walking", car: "Car", bike: "Bike" };

const TONE_STYLES = {
  high: "border-success/40 bg-success/10 text-success",
  medium: "border-warning/40 bg-warning/10 text-warning-foreground",
  limited: "border-destructive/30 bg-destructive/10 text-destructive",
} as const;

function RouteSafety() {
  const [origin, setOrigin] = useState("MG Road Metro");
  const [destination, setDestination] = useState("Koramangala 5th Block");
  const [mode, setMode] = useState<TransportMode>("walk");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [selected, setSelected] = useState("balanced");
  const [showReports, setShowReports] = useState(true);
  const { theme } = useTheme();

  const points = useMemo(() => {
    const o = DEMO_LOCATIONS.find((l) => l.name === origin);
    const d = DEMO_LOCATIONS.find((l) => l.name === destination);
    return { o: o ?? DEMO_LOCATIONS[0], d: d ?? DEMO_LOCATIONS[2] };
  }, [origin, destination]);

  const analyze = () => {
    setAnalyzing(true);
    setAnalyzed(false);
    // Simulated analysis delay — no real routing or safety data is used.
    setTimeout(() => {
      setAnalyzing(false);
      setAnalyzed(true);
    }, 1100);
  };

  const polylines = useMemo(() => {
    if (!analyzed) return [];
    return ROUTE_OPTIONS.map((r) => ({
      coords: r.coords,
      color: ROUTE_COLORS[r.id],
      weight: selected === r.id ? 6 : 3.5,
      dashed: r.tone === "limited",
      ...(selected !== r.id ? { opacity: 0.45 } : {}),
    }));
  }, [analyzed, selected]);

  const reportCircles = useMemo(() => {
    if (!analyzed || !showReports) return [];
    return COMMUNITY_REPORTS.map((r) => ({
      lat: r.lat,
      lng: r.lng,
      radiusM: 220,
      color: CATEGORY_COLORS[r.category],
    }));
  }, [analyzed, showReports]);

  return (
    <AppLayout>
      <PageHeader
        title="Route Safety"
        description="Compare route options with demo night-activity heuristics. Scores are simulated and clearly flagged — not verified real-world information."
      />

      <SafetyBanner>
        Route scores are computed from demo data only. “Safest (Limited Data)” means fewer flagged spots in the demo
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
                <Select value={origin} onValueChange={(v) => { setOrigin(v); setAnalyzed(false); }}>
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
                <Select value={destination} onValueChange={(v) => { setDestination(v); setAnalyzed(false); }}>
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
              <Button onClick={analyze} disabled={analyzing || origin === destination} className="w-full rounded-xl">
                {analyzing ? "Analyzing demo data…" : analyzed ? "Re-analyze" : "Analyze routes"}
              </Button>
              <p className="text-xs text-muted-foreground">
                {MODE_LABEL[mode]} · demo locations only · no live traffic or routing APIs
              </p>
            </CardContent>
          </Card>

          {analyzing && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-40 rounded-2xl" />
              ))}
            </div>
          )}

          {analyzed && !analyzing && (
            <div className="space-y-3">
              {ROUTE_OPTIONS.map((r) => (
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
                      <RouteIcon className="h-4 w-4" style={{ color: ROUTE_COLORS[r.id] }} />
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
            </div>
          )}

          {!analyzed && !analyzing && (
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
