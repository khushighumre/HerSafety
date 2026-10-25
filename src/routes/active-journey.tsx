import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  BellRing,
  CheckCircle2,
  Circle,
  Hand,
  MapPin,
  Navigation,
  PhoneOff,
  Play,
  Route as RouteIcon,
  Siren,
  Square,
  Timer,
  TriangleAlert,
} from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { PageHeader, SimulatedBadge } from "@/components/shared";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ROUTE_OPTIONS, TRUSTED_CONTACTS } from "@/data/mock";
import { useTheme } from "@/lib/theme";
import { brandTitle, pageMeta } from "@/lib/page-meta";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/active-journey")({
  head: () =>
    pageMeta(brandTitle("Active Journey"), "Live journey demo: check-in timer, I'm Okay, Need Help and End Journey flows. Fully simulated."),
  component: ActiveJourney,
});

const journeyRoute = ROUTE_OPTIONS.find((r) => r.id === "balanced")!;
const CHECKIN_SECONDS = 90;

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function ActiveJourney() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [running, setRunning] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(CHECKIN_SECONDS);
  const [deviation, setDeviation] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    if (!running || ended) return;
    const t = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [running, ended]);

  const checkinDue = secondsLeft === 0 && !ended;
  const progress = ((CHECKIN_SECONDS - secondsLeft) / CHECKIN_SECONDS) * 100;

  const markers = useMemo(() => {
    const coords = journeyRoute.coords;
    const start = coords[0] ?? [12.9756, 77.6068];
    const mid = coords[Math.floor(coords.length / 2)] ?? start;
    const end = coords[coords.length - 1] ?? start;
    return [
      { lat: start[0], lng: start[1], label: "Start · MG Road Metro", tone: "primary" as const },
      { lat: mid[0], lng: mid[1], label: deviation ? "Deviation point (simulated)" : "Current position (demo)", tone: (deviation ? "destructive" : "success") as "destructive" | "success" },
      { lat: end[0], lng: end[1], label: "Destination · Koramangala", tone: "pink" as const },
    ];
  }, [deviation]);

  const sayOkay = () => {
    setSecondsLeft(CHECKIN_SECONDS);
    setDeviation(false);
    toast.success("Marked as Okay (demo)", { description: "In a real build, your Trusted Circle would be notified." });
  };

  const endJourney = () => {
    setEnded(true);
    setRunning(false);
    toast("Journey ended (demo)", { description: "Final location snapshot shared with 3 contacts — simulated." });
    setTimeout(() => navigate({ to: "/dashboard" }), 1200);
  };

  return (
    <AppLayout>
      <PageHeader
        title="Active Journey"
        description="A live-journey simulation with check-ins and help actions. Nothing here contacts real services or shares real data."
        actions={<Badge className="gap-1 rounded-full bg-success/15 text-success"><Play className="h-3 w-3" /> In progress (demo)</Badge>}
      />

      {ended ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <CheckCircle2 className="h-12 w-12 text-success" />
            <p className="mt-4 font-display text-lg font-semibold">Journey ended safely</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Demo journey closed. Circle contacts received the final check-in (simulated).
            </p>
            <Button className="mt-6 rounded-xl" onClick={() => navigate({ to: "/dashboard" })}>
              Back to dashboard
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-2">
            {/* Status */}
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="font-display text-base">Journey status</CardTitle>
                <SimulatedBadge />
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Route</span>
                  <span className="font-medium">MG Road → Koramangala</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Started</span>
                  <span className="font-medium">8:02 PM (demo)</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Estimated arrival</span>
                  <span className="font-medium">8:28 PM · in {fmt(Math.max(secondsLeft + 18 * 60, 60))}</span>
                </div>
                <div>
                  <p className="mb-1.5 flex items-center justify-between text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <Timer className="h-3.5 w-3.5 text-primary" /> Next check-in
                    </span>
                    <span className={cn("font-bold", checkinDue && "text-destructive")}>
                      {checkinDue ? "Due now" : fmt(secondsLeft)}
                    </span>
                  </p>
                  <Progress value={progress} className="h-2" />
                </div>
              </CardContent>
            </Card>

            {checkinDue && (
              <div className="rounded-2xl border border-warning/50 bg-warning/10 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-warning-foreground">
                  <BellRing className="h-4 w-4" /> Check-in due
                </p>
                <p className="mt-1 text-xs text-warning-foreground/80">
                  Confirm you're okay so your circle stops watching the timer.
                </p>
                <Button size="sm" className="mt-3 w-full rounded-lg" onClick={sayOkay}>
                  <Hand className="h-4 w-4" /> I'm Okay
                </Button>
              </div>
            )}

            {deviation && (
              <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                  <TriangleAlert className="h-4 w-4" /> GPS deviation detected (simulated)
                </p>
                <p className="mt-1 text-xs text-destructive/80">
                  Demo: circle contacts were notified that you left the planned route. No real location was shared.
                </p>
              </div>
            )}

            {/* Route checkpoints */}
            <Card>
              <CardHeader>
                <CardTitle className="font-display text-base">Checkpoints</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "Departed · MG Road Metro", time: "8:02 PM", done: true },
                  { label: "100ft Rd crossing", time: "8:11 PM", done: true },
                  { label: "Domlur flyover", time: deviation ? "off-route" : "8:19 PM", done: false, current: true },
                  { label: "Arrive · Koramangala", time: "8:28 PM", done: false },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-3 text-sm">
                    {s.done ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <Circle className={cn("h-4 w-4", s.current ? "text-primary" : "text-muted-foreground/40")} />
                    )}
                    <span className={cn("flex-1", s.current && "font-semibold")}>{s.label}</span>
                    <span className={cn("text-xs", s.time === "off-route" ? "text-destructive" : "text-muted-foreground")}>{s.time}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="font-display text-base">Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2.5">
                <Button className="rounded-xl" onClick={sayOkay}>
                  <Hand className="h-4 w-4" /> I'm Okay
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={() => setHelpOpen(true)}>
                  <Siren className="h-4 w-4" /> Need Help
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={endJourney}>
                  <Square className="h-4 w-4" /> End Journey
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => {
                    setDeviation((d) => !d);
                    if (!deviation) toast.warning("GPS deviation simulated", { description: "Demo flag only — nothing was transmitted." });
                  }}
                >
                  <Navigation className="h-4 w-4" /> Simulate GPS deviation
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Map + recipients */}
          <div className="space-y-4 lg:col-span-3">
            <MapView
              dark={theme === "dark"}
              center={journeyRoute.coords[0] ?? [12.9756, 77.6068]}
              zoom={13}
              polylines={[{ coords: journeyRoute.coords, color: "#e060a8", weight: 5 }]}
              markers={markers}
              className="h-[420px] w-full"
            />
            <Card>
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
                  Demo recipients — no real notifications sent
                </Badge>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Need Help dialog */}
      <AlertDialog open={helpOpen} onOpenChange={setHelpOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Siren className="h-5 w-5" /> Need Help — simulated response
            </AlertDialogTitle>
            <AlertDialogDescription>
              This demo shows what would happen. <strong>No emergency services are contacted</strong> — Her Safety is
              not connected to police, ambulance or any live service in this build.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 text-primary" /> Live location + route snapshot sent to Trusted Circle
              (simulated).
            </li>
            <li className="flex items-start gap-2">
              <PhoneOff className="mt-0.5 h-4 w-4 text-primary" /> Silent audio recording would start (not actually
              recorded).
            </li>
            <li className="flex items-start gap-2">
              <RouteIcon className="mt-0.5 h-4 w-4 text-primary" /> Your last known checkpoint is included in the demo
              alert.
            </li>
          </ul>
          <p className="rounded-xl bg-warning/10 p-3 text-xs text-warning-foreground">
            If you are in real danger right now, call your local emergency number directly — for India, 112.
          </p>
          <div className="flex gap-3">
            <AlertDialogCancel className="flex-1">Cancel — I'm okay</AlertDialogCancel>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => {
                setHelpOpen(false);
                toast.warning("Demo help alert sent (simulated)", { description: "3 demo contacts notified. No real services contacted." });
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
