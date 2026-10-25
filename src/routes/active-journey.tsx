import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  Ban,
  Bike,
  Calendar,
  Car,
  CheckCircle2,
  Clock,
  Footprints,
  Hand,
  History,
  Hourglass,
  Loader2,
  MapPin,
  Navigation,
  PhoneOff,
  Play,
  Plus,
  Route as RouteIcon,
  ShieldCheck,
  Siren,
  Timer,
} from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { PageHeader } from "@/components/shared";
import { MapView } from "@/components/map/map-view";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  cancelJourney,
  completeJourney,
  createJourney,
  fetchJourneys,
  startJourney,
  createCheckIn,
  fetchCheckIns,
  type Journey,
  type JourneyTravelMode,
  type JourneyStatus,
  type CheckIn,
} from "@/api/journeys";
import {
  CHECKIN_INTERVAL_SECONDS,
  computeJourneyTimers,
  formatDuration,
  getEstimatedRouteDuration,
} from "@/lib/journey-timer";
import { TRUSTED_CONTACTS } from "@/data/mock";
import { useTheme } from "@/lib/theme";
import { brandTitle, pageMeta } from "@/lib/page-meta";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/active-journey")({
  head: () =>
    pageMeta(
      brandTitle("Active Journey"),
      "Create, track, and manage active journey lifecycles with SQLite backend persistence.",
    ),
  component: ActiveJourney,
});

const STORAGE_KEY = "nightwise_active_journey_id";

function formatDate(isoString?: string | null) {
  if (!isoString) return "Immediate / Not specified";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

function resolveCoordinates(name: string, fallbackOffset = 0): [number, number] {
  const lower = name.toLowerCase();
  if (lower.includes("mg road")) return [12.9756, 77.6068];
  if (lower.includes("koramangala")) return [12.9352, 77.6245];
  if (lower.includes("indiranagar")) return [12.9784, 77.6408];
  if (lower.includes("majestic")) return [12.9767, 77.5713];
  if (lower.includes("jayanagar")) return [12.9299, 77.5824];
  if (lower.includes("whitefield")) return [12.9698, 77.7499];
  if (lower.includes("domlur")) return [12.9609, 77.6387];
  if (lower.includes("electronic city")) return [12.8452, 77.6602];
  if (lower.includes("hebbal")) return [13.0358, 77.597];

  // Default Bangalore coordinates with slight offset for visual separation
  return [12.9716 + fallbackOffset * 0.02, 77.5946 + fallbackOffset * 0.02];
}

function ActiveJourney() {
  const queryClient = useQueryClient();
  const { theme } = useTheme();

  // Selected journey ID state (persists in localStorage)
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseInt(saved, 10) : null;
  });

  // Form state
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [travelMode, setTravelMode] = useState<JourneyTravelMode>("walk");
  const [plannedTime, setPlannedTime] = useState("");
  const [journeyStatus, setJourneyStatus] = useState<JourneyStatus>("planned");
  const [formErrors, setFormErrors] = useState<{ origin?: string; destination?: string }>({});
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Simulation controls
  const [deviation, setDeviation] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Live wall-clock time that ticks every 1000ms
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch saved journeys from backend (persisted in SQLite)
  const journeysQuery = useQuery({
    queryKey: ["journeys"],
    queryFn: fetchJourneys,
    staleTime: 30 * 1000,
  });

  const journeys = journeysQuery.data ?? [];

  // Determine active journey
  const activeJourney: Journey | null = useMemo(() => {
    if (journeys.length === 0) return null;
    if (selectedId) {
      const found = journeys.find((j) => j.id === selectedId);
      if (found) return found;
    }
    return journeys[0] ?? null;
  }, [journeys, selectedId]);

  // Check-in history for active journey (persisted in SQLite)
  const checkInsQuery = useQuery({
    queryKey: ["check-ins", activeJourney?.id],
    queryFn: () => (activeJourney ? fetchCheckIns(activeJourney.id) : Promise.resolve([])),
    enabled: !!activeJourney,
    staleTime: 10 * 1000,
  });

  const checkIns = checkInsQuery.data ?? [];
  const latestCheckIn = checkIns.length > 0 ? checkIns[0] : null;

  // Sync selected journey to localStorage
  useEffect(() => {
    if (activeJourney) {
      localStorage.setItem(STORAGE_KEY, String(activeJourney.id));
    }
  }, [activeJourney]);

  // Derived timers based on persisted started_at in SQLite
  // Never resets to zero or restarts on browser refresh!
  const timers = useMemo(() => {
    return computeJourneyTimers(
      activeJourney?.started_at,
      activeJourney?.status ?? "planned",
      nowMs,
      activeJourney?.ended_at,
      CHECKIN_INTERVAL_SECONDS,
    );
  }, [activeJourney?.started_at, activeJourney?.status, activeJourney?.ended_at, nowMs]);

  // Route estimate preserved strictly as a static estimate (separate from running timers)
  const routeEstimate = useMemo(() => {
    return getEstimatedRouteDuration(activeJourney?.travel_mode ?? "walk");
  }, [activeJourney?.travel_mode]);

  // Create journey mutation
  const createMutation = useMutation({
    mutationFn: createJourney,
    onSuccess: (newJourney) => {
      queryClient.invalidateQueries({ queryKey: ["journeys"] });
      setSelectedId(newJourney.id);
      localStorage.setItem(STORAGE_KEY, String(newJourney.id));
      setShowCreateForm(false);
      setOrigin("");
      setDestination("");
      setPlannedTime("");
      setFormErrors({});
      toast.success("Journey created and saved", {
        description: `${newJourney.origin} → ${newJourney.destination}`,
      });
    },
    onError: (err: any) => {
      toast.error("Failed to save journey", {
        description: err?.detail || err?.message || "Please check your input and try again.",
      });
    },
  });

  // Start journey mutation
  const startMutation = useMutation({
    mutationFn: startJourney,
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["journeys"] });
      toast.success("Journey started", {
        description: `Timer active for ${updated.origin} → ${updated.destination}`,
      });
    },
    onError: (err: any) => {
      toast.error("Failed to start journey", {
        description: err?.detail || err?.message || "Invalid state transition",
      });
    },
  });

  // Complete journey mutation
  const completeMutation = useMutation({
    mutationFn: completeJourney,
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["journeys"] });
      toast.success("Journey completed safely", {
        description: `Arrived at ${updated.destination}. Total time active: ${formatDuration(timers.elapsedSeconds)}`,
      });
    },
    onError: (err: any) => {
      toast.error("Failed to complete journey", {
        description: err?.detail || err?.message || "Invalid state transition",
      });
    },
  });

  // Cancel journey mutation
  const cancelMutation = useMutation({
    mutationFn: cancelJourney,
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["journeys"] });
      toast.warning("Journey cancelled", {
        description: `Journey #${updated.id} was marked as cancelled.`,
      });
    },
    onError: (err: any) => {
      toast.error("Failed to cancel journey", {
        description: err?.detail || err?.message || "Invalid state transition",
      });
    },
  });

  // Safety check-in mutation (persists to SQLite)
  const checkInMutation = useMutation({
    mutationFn: (note?: string) => {
      if (!activeJourney) throw new Error("No active journey selected");
      return createCheckIn(activeJourney.id, { note: note || "I'm okay" });
    },
    onSuccess: (newCheckIn) => {
      queryClient.invalidateQueries({ queryKey: ["check-ins", activeJourney?.id] });
      toast.success("Check-in confirmed", {
        description: `Status: ${newCheckIn.status}. Response persisted to SQLite.`,
      });
    },
    onError: (err: any) => {
      toast.error("Check-in failed", {
        description: err?.detail || err?.message || "Failed to record check-in.",
      });
    },
  });

  const isActionPending =
    startMutation.isPending ||
    completeMutation.isPending ||
    cancelMutation.isPending ||
    createMutation.isPending ||
    checkInMutation.isPending;

  // Map coordinates
  const mapData = useMemo(() => {
    if (!activeJourney) {
      return {
        center: [12.9716, 77.5946] as [number, number],
        markers: [],
        polyline: [],
      };
    }
    const originCoords =
      activeJourney.origin_lat && activeJourney.origin_lng
        ? ([activeJourney.origin_lat, activeJourney.origin_lng] as [number, number])
        : resolveCoordinates(activeJourney.origin, 0);

    const destCoords =
      activeJourney.destination_lat && activeJourney.destination_lng
        ? ([activeJourney.destination_lat, activeJourney.destination_lng] as [number, number])
        : resolveCoordinates(activeJourney.destination, 1);

    const midCoords: [number, number] = [
      (originCoords[0] + destCoords[0]) / 2,
      (originCoords[1] + destCoords[1]) / 2,
    ];

    const markers = [
      {
        lat: originCoords[0],
        lng: originCoords[1],
        label: `Origin · ${activeJourney.origin}`,
        tone: "primary" as const,
      },
      {
        lat: midCoords[0],
        lng: midCoords[1],
        label: deviation ? "Simulated deviation point" : "Estimated position (demo)",
        tone: (deviation ? "destructive" : "success") as "destructive" | "success",
      },
      {
        lat: destCoords[0],
        lng: destCoords[1],
        label: `Destination · ${activeJourney.destination}`,
        tone: "pink" as const,
      },
    ];

    return {
      center: originCoords,
      markers,
      polyline: [originCoords, midCoords, destCoords] as [number, number][],
    };
  }, [activeJourney, deviation]);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { origin?: string; destination?: string } = {};

    if (!origin.trim()) {
      errors.origin = "Origin is required";
    }
    if (!destination.trim()) {
      errors.destination = "Destination is required";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    createMutation.mutate({
      origin: origin.trim(),
      destination: destination.trim(),
      travel_mode: travelMode,
      planned_departure_time: plannedTime ? new Date(plannedTime).toISOString() : null,
      status: journeyStatus,
      started_at: journeyStatus === "active" ? new Date().toISOString() : null,
    });
  };

  const sayOkay = () => {
    if (!activeJourney || activeJourney.status !== "active") return;
    checkInMutation.mutate("I'm okay");
  };

  return (
    <AppLayout>
      <PageHeader
        title="Active Journey"
        description="Plan, monitor, and transition active journey lifecycles. All states and timestamps persist in SQLite."
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={showCreateForm ? "outline" : "default"}
              className="gap-1.5 rounded-xl shadow-xs"
              onClick={() => setShowCreateForm((prev) => !prev)}
            >
              <Plus className="h-4 w-4" />
              {showCreateForm ? "Close form" : "New journey"}
            </Button>
            {activeJourney && (
              <Badge
                className={cn(
                  "gap-1 rounded-full border capitalize text-xs",
                  activeJourney.status === "active"
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                    : activeJourney.status === "planned"
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"
                    : activeJourney.status === "completed"
                    ? "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {activeJourney.status === "active" && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                )}
                {activeJourney.status}
              </Badge>
            )}
          </div>
        }
      />

      {/* Creation Form Modal/Card */}
      {showCreateForm && (
        <Card className="mb-6 border-primary/20 shadow-xs bg-card/95 backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-display text-lg flex items-center gap-2">
                  <Navigation className="h-5 w-5 text-primary" /> Create New Journey
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  Saved directly to SQLite via FastAPI (<code className="text-xs">POST /api/v1/journeys</code>)
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs text-muted-foreground">
                Phase 2 · Part 2
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Origin */}
                <div className="space-y-1.5">
                  <Label htmlFor="journey-origin" className="text-xs font-semibold">
                    Origin <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="journey-origin"
                    placeholder="e.g. MG Road Metro, Bengaluru"
                    value={origin}
                    onChange={(e) => {
                      setOrigin(e.target.value);
                      if (formErrors.origin) {
                        setFormErrors((err) => {
                          const next = { ...err };
                          delete next.origin;
                          return next;
                        });
                      }
                    }}
                    className={cn(formErrors.origin && "border-destructive focus-visible:ring-destructive")}
                    disabled={isActionPending}
                  />
                  {formErrors.origin && (
                    <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                      <AlertCircle className="h-3 w-3" /> {formErrors.origin}
                    </p>
                  )}
                </div>

                {/* Destination */}
                <div className="space-y-1.5">
                  <Label htmlFor="journey-destination" className="text-xs font-semibold">
                    Destination <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="journey-destination"
                    placeholder="e.g. Koramangala 5th Block, Bengaluru"
                    value={destination}
                    onChange={(e) => {
                      setDestination(e.target.value);
                      if (formErrors.destination) {
                        setFormErrors((err) => {
                          const next = { ...err };
                          delete next.destination;
                          return next;
                        });
                      }
                    }}
                    className={cn(formErrors.destination && "border-destructive focus-visible:ring-destructive")}
                    disabled={isActionPending}
                  />
                  {formErrors.destination && (
                    <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                      <AlertCircle className="h-3 w-3" /> {formErrors.destination}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {/* Travel Mode */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Travel mode</Label>
                  <div className="flex gap-2">
                    {[
                      { mode: "walk" as const, label: "Walk", icon: Footprints },
                      { mode: "bike" as const, label: "Bike", icon: Bike },
                      { mode: "car" as const, label: "Car", icon: Car },
                    ].map(({ mode, label, icon: Icon }) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setTravelMode(mode)}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-medium transition-colors",
                          travelMode === mode
                            ? "border-primary bg-primary/10 text-primary font-semibold shadow-xs"
                            : "border-border hover:bg-muted/50 text-muted-foreground",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Planned Departure Time */}
                <div className="space-y-1.5">
                  <Label htmlFor="journey-departure" className="text-xs font-semibold">
                    Planned departure (optional)
                  </Label>
                  <Input
                    id="journey-departure"
                    type="datetime-local"
                    value={plannedTime}
                    onChange={(e) => setPlannedTime(e.target.value)}
                    className="text-xs"
                    disabled={isActionPending}
                  />
                </div>

                {/* Status Selection */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Initial status</Label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setJourneyStatus("planned")}
                      className={cn(
                        "flex-1 py-2 px-3 rounded-xl border text-xs font-medium transition-colors",
                        journeyStatus === "planned"
                          ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold"
                          : "border-border hover:bg-muted/50 text-muted-foreground",
                      )}
                    >
                      Planned
                    </button>
                    <button
                      type="button"
                      onClick={() => setJourneyStatus("active")}
                      className={cn(
                        "flex-1 py-2 px-3 rounded-xl border text-xs font-medium transition-colors",
                        journeyStatus === "active"
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold"
                          : "border-border hover:bg-muted/50 text-muted-foreground",
                      )}
                    >
                      Active
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-xl text-xs"
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="rounded-xl gap-2 font-medium"
                  disabled={isActionPending}
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving to database...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Create & Save Journey
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Loading & Empty States */}
      {journeysQuery.isLoading ? (
        <Card className="border-border/60">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-3 text-sm font-medium">Loading saved journeys from SQLite...</p>
            <p className="text-xs text-muted-foreground mt-1">Connecting to FastAPI backend</p>
          </CardContent>
        </Card>
      ) : journeysQuery.isError ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="mt-3 text-sm font-semibold text-destructive">Failed to load journeys from server</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Please ensure the FastAPI backend is running on port 8000.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-4 rounded-xl"
              onClick={() => journeysQuery.refetch()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : journeys.length === 0 ? (
        <Card className="border-border/60">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-2xl bg-primary/10 p-4 text-primary">
              <Navigation className="h-8 w-8" />
            </div>
            <p className="mt-4 font-display text-lg font-semibold">No saved journeys yet</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Create your first journey using the button below. Your journey origin, destination, travel mode, and
              schedule will be persisted safely in SQLite.
            </p>
            <Button
              className="mt-6 rounded-xl gap-2"
              onClick={() => setShowCreateForm(true)}
            >
              <Plus className="h-4 w-4" /> Plan a journey
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-5">
          {/* Left Column: Active Journey Details & History */}
          <div className="space-y-4 lg:col-span-2">
            {/* Active Journey Card */}
            {activeJourney && (
              <Card className="border-border/60 shadow-xs">
                <CardHeader className="flex-row items-center justify-between pb-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <CardTitle className="font-display text-base">Active Journey</CardTitle>
                      <Badge variant="secondary" className="text-[11px] font-mono px-2 py-0.5">
                        #{activeJourney.id}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3 text-emerald-500" /> Persisted in SQLite
                    </p>
                  </div>
                  <Badge
                    className={cn(
                      "rounded-full text-xs capitalize",
                      activeJourney.status === "active"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        : activeJourney.status === "planned"
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                        : activeJourney.status === "completed"
                        ? "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {activeJourney.status}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3.5">
                  {/* Origin -> Destination */}
                  <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-start gap-2 text-xs">
                      <MapPin className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <span className="text-muted-foreground text-[10px] block uppercase font-medium">Origin</span>
                        <span className="font-semibold text-foreground">{activeJourney.origin}</span>
                      </div>
                    </div>
                    <div className="h-px bg-border/60 my-1" />
                    <div className="flex items-start gap-2 text-xs">
                      <MapPin className="h-3.5 w-3.5 text-pink-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-muted-foreground text-[10px] block uppercase font-medium">Destination</span>
                        <span className="font-semibold text-foreground">{activeJourney.destination}</span>
                      </div>
                    </div>
                  </div>

                  {/* Metadata Row: Travel Mode, Est Duration, Time Active */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-lg border p-2.5 bg-card">
                      <span className="text-muted-foreground text-[10px] block uppercase font-medium flex items-center gap-1">
                        <Footprints className="h-3 w-3 text-primary" /> Mode
                      </span>
                      <span className="font-semibold capitalize mt-0.5 block truncate">{activeJourney.travel_mode}</span>
                    </div>

                    <div className="rounded-lg border p-2.5 bg-card">
                      <span className="text-muted-foreground text-[10px] block uppercase font-medium flex items-center gap-1">
                        <Clock className="h-3 w-3 text-primary" /> Est. duration
                      </span>
                      <span className="font-semibold mt-0.5 block truncate" title="Estimated route travel time">
                        {routeEstimate.label}
                      </span>
                    </div>

                    <div className="rounded-lg border p-2.5 bg-card">
                      <span className="text-muted-foreground text-[10px] block uppercase font-medium flex items-center gap-1">
                        <Hourglass className="h-3 w-3 text-emerald-500" /> Time active
                      </span>
                      <span
                        className={cn(
                          "font-semibold font-mono mt-0.5 block truncate",
                          timers.isStarted && !timers.isFinished && "text-emerald-600 dark:text-emerald-400",
                        )}
                        title={`Started at: ${formatDate(activeJourney.started_at)}`}
                      >
                        {timers.isStarted ? formatDuration(timers.elapsedSeconds) : "Not started"}
                      </span>
                    </div>
                  </div>

                  {/* Started / Ended / Planned departure timestamps */}
                  <div className="rounded-lg bg-muted/40 border px-3 py-2 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {activeJourney.status === "active" ? "Started at" : "Created at"}
                      </span>
                      <span className="font-medium text-foreground">
                        {formatDate(activeJourney.started_at || activeJourney.created_at)}
                      </span>
                    </div>
                    {activeJourney.ended_at && (
                      <div className="flex items-center justify-between border-t border-border/50 pt-1">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <CheckCircle2 className="h-3 w-3 text-purple-500" /> Ended at
                        </span>
                        <span className="font-medium text-foreground">
                          {formatDate(activeJourney.ended_at)}
                        </span>
                      </div>
                    )}
                    {activeJourney.planned_departure_time && !activeJourney.ended_at && (
                      <div className="flex items-center justify-between border-t border-border/50 pt-1">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-amber-500" /> Planned departure
                        </span>
                        <span className="font-medium text-foreground">
                          {formatDate(activeJourney.planned_departure_time)}
                        </span>
                      </div>
                    )}
                    {/* Latest Check-in status display */}
                    <div className="flex items-center justify-between border-t border-border/50 pt-1">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <ShieldCheck className="h-3 w-3 text-emerald-500" /> Latest check-in
                      </span>
                      {latestCheckIn ? (
                        <span className="font-medium text-foreground flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 capitalize">
                            {latestCheckIn.status}
                          </Badge>
                          <span>{formatDate(latestCheckIn.responded_at || latestCheckIn.created_at)}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic text-[11px]">
                          {activeJourney.status === "active" ? "None recorded yet" : "No check-ins"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Periodic Check-in countdown: only active while journey is ongoing */}
                  {activeJourney.status === "active" && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="flex items-center gap-1.5">
                          <Timer className="h-3.5 w-3.5 text-primary" /> Next check-in
                        </span>
                        <span className={cn("font-bold font-mono", timers.checkinDue && "text-destructive")}>
                          {timers.checkinDue ? "Due now" : formatDuration(timers.secondsUntilCheckin)}
                        </span>
                      </div>
                      <Progress value={timers.progressPct} className="h-2" />
                      <p className="text-[10px] text-muted-foreground">
                        Synced with SQLite start timestamp. Does not reset on page refresh.
                      </p>
                    </div>
                  )}

                  {/* Completed / Cancelled state summary banner */}
                  {activeJourney.status === "completed" && (
                    <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-3 text-xs space-y-1 text-purple-900 dark:text-purple-200">
                      <p className="font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-purple-600 dark:text-purple-400" /> Journey completed safely
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Total duration: {formatDuration(timers.elapsedSeconds)}. Lifecycle closed.
                      </p>
                    </div>
                  )}

                  {activeJourney.status === "cancelled" && (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs space-y-1 text-destructive">
                      <p className="font-semibold flex items-center gap-1.5">
                        <Ban className="h-4 w-4" /> Journey cancelled
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Lifecycle ended. This record remains preserved in your journey history.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Check-in History for Active Journey */}
            {activeJourney && (
              <Card className="border-border/60 shadow-xs">
                <CardHeader className="pb-2.5 flex-row items-center justify-between">
                  <div>
                    <CardTitle className="font-display text-sm flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-500" /> Check-in History ({checkIns.length})
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Persisted in SQLite for Journey #{activeJourney.id}
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => checkInsQuery.refetch()}
                  >
                    Refresh
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2 pt-1">
                  {checkInsQuery.isLoading ? (
                    <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mr-2 text-primary" /> Loading check-ins...
                    </div>
                  ) : checkIns.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 italic text-center">
                      {activeJourney.status === "active"
                        ? "No check-ins recorded yet. Tap \"I'm Okay\" to confirm safety."
                        : "No check-ins were recorded for this journey."}
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                      {checkIns.map((ci) => (
                        <div
                          key={ci.id}
                          className="rounded-lg border bg-muted/30 p-2 text-xs flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                              <span className="font-medium text-foreground truncate">
                                {ci.note || "I'm okay"}
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground pl-4.5 mt-0.5">
                              {formatDate(ci.responded_at || ci.created_at)}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className="text-[10px] capitalize px-1.5 py-0 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 shrink-0"
                          >
                            {ci.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Check-in Due Alert (Active Journeys only) */}
            {timers.checkinDue && activeJourney?.status === "active" && (
              <div className="rounded-2xl border border-warning/50 bg-warning/10 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-warning-foreground">
                  <Timer className="h-4 w-4" /> Check-in due
                </p>
                <p className="mt-1 text-xs text-warning-foreground/80">
                  Periodic safety interval reached. Confirm you are safe to reset the check-in timer.
                </p>
                <Button
                  size="sm"
                  className="mt-3 w-full rounded-lg gap-2"
                  onClick={sayOkay}
                  disabled={isActionPending}
                >
                  {checkInMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Recording check-in...
                    </>
                  ) : (
                    <>
                      <Hand className="h-4 w-4" /> I'm Okay
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Status-Dependent Journey Controls */}
            {activeJourney && (
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="font-display text-base">Journey controls</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2.5">
                  {/* Controls for PLANNED journeys */}
                  {activeJourney.status === "planned" && (
                    <>
                      <Button
                        className="rounded-xl gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                        disabled={isActionPending}
                        onClick={() => startMutation.mutate(activeJourney.id)}
                      >
                        {startMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Starting journey...
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4" /> Start Journey
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-xl gap-2 text-muted-foreground hover:text-destructive hover:border-destructive/40"
                        disabled={isActionPending}
                        onClick={() => cancelMutation.mutate(activeJourney.id)}
                      >
                        {cancelMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Cancelling...
                          </>
                        ) : (
                          <>
                            <Ban className="h-4 w-4" /> Cancel Planned Journey
                          </>
                        )}
                      </Button>
                    </>
                  )}

                  {/* Controls for ACTIVE journeys */}
                  {activeJourney.status === "active" && (
                    <>
                      <Button
                        className="rounded-xl gap-2"
                        onClick={sayOkay}
                        disabled={isActionPending}
                      >
                        {checkInMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Saving check-in...
                          </>
                        ) : (
                          <>
                            <Hand className="h-4 w-4" /> I'm Okay
                          </>
                        )}
                      </Button>
                      <Button variant="outline" className="rounded-xl" onClick={() => setHelpOpen(true)}>
                        <Siren className="h-4 w-4 text-destructive" /> Need Help
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-xl gap-2 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                        disabled={isActionPending}
                        onClick={() => completeMutation.mutate(activeJourney.id)}
                      >
                        {completeMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Completing...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4" /> Complete Journey
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-xl gap-2 text-muted-foreground hover:text-destructive hover:border-destructive/40"
                        disabled={isActionPending}
                        onClick={() => cancelMutation.mutate(activeJourney.id)}
                      >
                        {cancelMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Cancelling...
                          </>
                        ) : (
                          <>
                            <Ban className="h-4 w-4" /> Cancel Journey
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => {
                          setDeviation((d) => !d);
                          if (!deviation) {
                            toast.warning("GPS deviation simulated", {
                              description: "Demonstration flag only — no actual telemetry altered.",
                            });
                          }
                        }}
                      >
                        <Navigation className="h-4 w-4" /> Simulate GPS deviation
                      </Button>
                    </>
                  )}

                  {/* Controls for COMPLETED or CANCELLED journeys */}
                  {(activeJourney.status === "completed" || activeJourney.status === "cancelled") && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        This journey is {activeJourney.status}. The lifecycle has concluded and cannot be restarted.
                      </p>
                      <Button
                        className="w-full rounded-xl gap-2"
                        onClick={() => setShowCreateForm(true)}
                      >
                        <Plus className="h-4 w-4" /> Plan a New Journey
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Saved Journeys History */}
            <Card className="border-border/60">
              <CardHeader className="pb-2.5 flex-row items-center justify-between">
                <div>
                  <CardTitle className="font-display text-base flex items-center gap-2">
                    <History className="h-4 w-4 text-primary" /> Saved Journeys ({journeys.length})
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Persisted in SQLite database (newest first)
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => journeysQuery.refetch()}
                >
                  Refresh
                </Button>
              </CardHeader>
              <CardContent className="space-y-2 pt-1 max-h-[300px] overflow-y-auto pr-1">
                {journeys.map((j) => {
                  const isSelected = activeJourney?.id === j.id;
                  const ModeIcon = j.travel_mode === "car" ? Car : j.travel_mode === "bike" ? Bike : Footprints;
                  return (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(j.id);
                        localStorage.setItem(STORAGE_KEY, String(j.id));
                      }}
                      className={cn(
                        "w-full text-left rounded-xl p-2.5 border transition-all text-xs flex items-center justify-between gap-3",
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20 shadow-xs"
                          : "border-border hover:bg-muted/40",
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={cn(
                            "rounded-lg p-1.5 shrink-0",
                            isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                          )}
                        >
                          <ModeIcon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate text-foreground">
                            {j.origin} → {j.destination}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            #{j.id} · {formatDate(j.started_at || j.created_at)}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 text-[10px] capitalize px-2 py-0.5",
                          j.status === "active"
                            ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                            : j.status === "completed"
                            ? "border-purple-500/40 text-purple-600 dark:text-purple-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {j.status}
                      </Badge>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Map + Watching Circle */}
          <div className="space-y-4 lg:col-span-3">
            <MapView
              dark={theme === "dark"}
              center={mapData.center}
              zoom={13}
              polylines={
                mapData.polyline.length >= 2
                  ? [{ coords: mapData.polyline, color: "#e060a8", weight: 5 }]
                  : []
              }
              markers={mapData.markers}
              className="h-[440px] w-full shadow-xs"
            />

            {/* Trusted Circle Card */}
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-base">Watching this journey</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {TRUSTED_CONTACTS.filter((c) => c.receivesJourneys).map((c) => (
                  <Badge key={c.id} variant="secondary" className="rounded-full px-3 py-1.5 text-xs">
                    {c.name} · {c.relation}
                  </Badge>
                ))}
                <Badge variant="outline" className="rounded-full px-3 py-1.5 text-xs text-muted-foreground">
                  Demo circle — notification channels connect in later phases
                </Badge>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Need Help dialog (Simulated) */}
      <AlertDialog open={helpOpen} onOpenChange={setHelpOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Siren className="h-5 w-5" /> Need Help — simulated response
            </AlertDialogTitle>
            <AlertDialogDescription>
              This is a prototype demonstration. <strong>No real emergency services are contacted</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 text-primary shrink-0" />
              Live location and journey snapshot sent to Trusted Circle (simulated).
            </li>
            <li className="flex items-start gap-2">
              <PhoneOff className="mt-0.5 h-4 w-4 text-primary shrink-0" />
              Silent audio recording would start (not recorded).
            </li>
            <li className="flex items-start gap-2">
              <RouteIcon className="mt-0.5 h-4 w-4 text-primary shrink-0" />
              Your last verified checkpoint is included in the emergency dispatch note.
            </li>
          </ul>
          <p className="rounded-xl bg-warning/10 p-3 text-xs text-warning-foreground">
            If you are in immediate danger right now, call your local emergency service directly — for India, dial 112.
          </p>
          <div className="flex gap-3">
            <AlertDialogCancel className="flex-1">Cancel — I'm okay</AlertDialogCancel>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => {
                setHelpOpen(false);
                toast.warning("Demo help alert triggered (simulated)", {
                  description: "Trusted contacts notified in demo mode.",
                });
              }}
            >
              Send simulated alert
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
