import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BatteryCharging,
  BellRing,
  EyeOff,
  FileLock2,
  Footprints,
  HeartHandshake,
  Lock,
  Map,
  MessageSquareLock,
  Navigation,
  Shield,
  ShieldCheck,
  Smartphone,
  Users,
} from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { PageHeader, SimulatedBadge, StatCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_USER, RECENT_ACTIVITY, SAFETY_TIPS } from "@/data/mock";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { pageMeta, brandTitle } from "@/lib/page-meta";
import { cn } from "@/lib/utils";
import type { ActivityItem, SafetyTip } from "@/types";

export const Route = createFileRoute("/dashboard")({
  head: () => pageMeta(brandTitle("Dashboard"), "Your safety overview: journeys, trusted circle activity, stats and tips. Demo data."),
  component: Dashboard,
});

const TIP_ICONS: Record<SafetyTip["icon"], typeof Shield> = {
  smartphone: Smartphone,
  "battery-charging": BatteryCharging,
  "eye-off": EyeOff,
  lock: Lock,
  footprints: Footprints,
  "bell-ring": BellRing,
};

const ACTIVITY_ICONS: Record<ActivityItem["kind"], typeof Shield> = {
  journey: Map,
  report: HeartHandshake,
  incident: FileLock2,
  circle: Users,
  checkup: Shield,
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function Dashboard() {
  const [checkupScore] = useLocalStorage<number>("hersafety-checkup-score", 78);

  return (
    <AppLayout>
      <PageHeader
        title={`${greeting()}, ${DEMO_USER.name}`}
        description="Here's your safety snapshot. Everything below is demo data — nothing is shared or sent anywhere."
        actions={
          <Button asChild className="rounded-xl">
            <Link to="/active-journey">
              Start a journey <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={ShieldCheck} label="Journeys completed" value="37" hint="+3 this week" tone="success" />
        <StatCard icon={Users} label="Trusted contacts" value="4" hint="3 receive live journeys" />
        <StatCard icon={MessageSquareLock} label="Open incidents" value="2" hint="1 high priority" tone="warning" />
        <StatCard icon={HeartHandshake} label="Community reports" value="6" hint="2 verified by you" tone="pink" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Quick actions */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="font-display text-base">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {[
              { to: "/route-safety", icon: Navigation, label: "Plan a safer route", tone: "bg-primary/10 text-primary" },
              { to: "/active-journey", icon: Map, label: "Start live journey", tone: "bg-pink/15 text-pink-foreground" },
              { to: "/trusted-circle", icon: Users, label: "Manage trusted circle", tone: "bg-success/12 text-success" },
              { to: "/photo-cleaner", icon: Shield, label: "Clean a photo's metadata", tone: "bg-accent text-accent-foreground" },
              { to: "/digital-safety", icon: MessageSquareLock, label: "Report digital threat", tone: "bg-warning/15 text-warning-foreground" },
            ].map(({ to, icon: Icon, label, tone }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
              >
                <span className={cn("grid h-8 w-8 place-items-center rounded-lg", tone)}>
                  <Icon className="h-4 w-4" />
                </span>
                {label}
                <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Journey overview */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="font-display text-base">Journey overview</CardTitle>
            <SimulatedBadge />
          </CardHeader>
          <CardContent>
            <div className="rounded-xl bg-accent/60 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Upcoming: MG Road → Indiranagar</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Balanced route · 4.2 km · 14 min walk (demo)</p>
                </div>
                <Button asChild size="sm" variant="secondary" className="rounded-lg">
                  <Link to="/route-safety">Plan</Link>
                </Button>
              </div>
            </div>
            <div className="mt-4 space-y-2.5">
              {[
                { label: "Last journey completed", value: "Today, 8:12 AM", ok: true },
                { label: "Check-ins acknowledged by circle", value: "3 of 3", ok: true },
                { label: "Avg. night-activity score (demo)", value: "68 / 100", ok: true },
                { label: "Routes with limited data used", value: "1 this month", ok: false },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="flex items-center gap-2 font-medium">
                    <span className={cn("h-2 w-2 rounded-full", row.ok ? "bg-success" : "bg-warning")} />
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Recent activity */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {RECENT_ACTIVITY.map((a) => {
              const Icon = ACTIVITY_ICONS[a.kind];
              return (
                <div key={a.id} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.detail}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/70">{a.time}</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Safety tips */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="font-display text-base">Safety tips</CardTitle>
            <Badge variant="secondary" className="text-[10px]">Demo content</Badge>
          </CardHeader>
          <CardContent className="grid gap-2.5 sm:grid-cols-2">
            {SAFETY_TIPS.map((tip) => {
              const Icon = TIP_ICONS[tip.icon] ?? Shield;
              return (
                <div key={tip.id} className="rounded-xl border p-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <Icon className="h-3.5 w-3.5 text-primary" /> {tip.title}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{tip.text}</p>
                </div>
              );
            })}
          </CardContent>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              Privacy checkup score: <span className="font-semibold text-foreground">{checkupScore}/100</span> —{" "}
              <Link to="/privacy-checkup" className="text-primary hover:underline">
                run the checkup
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
