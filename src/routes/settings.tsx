import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Bell, Moon, Shield, Sun, Trash2, UserRound } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { PageHeader } from "@/components/shared";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DEMO_USER } from "@/data/mock";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useTheme, type Theme } from "@/lib/theme";
import { brandTitle, pageMeta } from "@/lib/page-meta";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => pageMeta(brandTitle("Settings"), "Profile, privacy preferences, notification settings and theme. Demo preferences persist locally."),
  component: SettingsPage,
});

function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [name, setName] = useLocalStorage("hersafety-profile-name", DEMO_USER.fullName);
  const [city, setCity] = useLocalStorage("hersafety-profile-city", DEMO_USER.city);
  const [prefs, setPrefs] = useLocalStorage("hersafety-prefs", {
    checkinReminders: true,
    circleAlerts: true,
    communityUpdates: false,
    shareUsage: false,
    autoDeleteEvidence: true,
  });

  const update = (key: keyof typeof prefs) => (v: boolean) => {
    setPrefs((p) => ({ ...p, [key]: v }));
    toast.success("Preference saved locally (demo)");
  };

  return (
    <AppLayout>
      <PageHeader title="Settings" description="Profile, privacy and notification preferences. Everything persists in this browser only." />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <UserRound className="h-4 w-4 text-primary" /> Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-14 w-14 border">
                <AvatarFallback className="gradient-hero font-bold text-white">
                  {name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-semibold">{name}</p>
                <p className="text-xs text-muted-foreground">{DEMO_USER.email} (demo account — no auth in this build)</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-name">Display name</Label>
              <Input id="set-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-city">City (demo)</Label>
              <Input id="set-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => toast.success("Profile saved locally (demo)")}
            >
              Save profile
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <Moon className="h-4 w-4 text-primary" /> Appearance
              </CardTitle>
            </CardHeader>
            <CardContent className="flex gap-3">
              {(["light", "dark"] as Theme[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium capitalize transition-colors",
                    theme === t ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
                  )}
                >
                  {t === "light" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {t} mode
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <Bell className="h-4 w-4 text-primary" /> Notifications & privacy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { key: "checkinReminders" as const, label: "Journey check-in reminders", desc: "Prompt me when a check-in is due." },
                { key: "circleAlerts" as const, label: "Circle activity alerts", desc: "When contacts start/finish journeys (demo)." },
                { key: "communityUpdates" as const, label: "Community report updates", desc: "When a report I confirmed gets verified." },
                { key: "shareUsage" as const, label: "Share anonymous usage data", desc: "Demo toggle — nothing is collected." },
                { key: "autoDeleteEvidence" as const, label: "Retention reminder", desc: "Remind me to review evidence older than 90 days." },
              ].map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                  <div>
                    <p className="text-sm font-medium">{row.label}</p>
                    <p className="text-xs text-muted-foreground">{row.desc}</p>
                  </div>
                  <Switch checked={prefs[row.key]} onCheckedChange={update(row.key)} aria-label={row.label} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-base text-destructive">
                <Shield className="h-4 w-4" /> Demo data
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Clear locally-stored demo preferences (contacts, links, checkup progress).
              </p>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5 rounded-lg"
                onClick={() => {
                  Object.keys(localStorage)
                    .filter((k) => k.startsWith("hersafety-") && k !== "hersafety-theme")
                    .forEach((k) => localStorage.removeItem(k));
                  toast.success("Local demo data cleared — refresh to reset views");
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Reset demo data
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
