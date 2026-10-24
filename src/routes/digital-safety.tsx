import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Fish,
  KeyRound,
  MessageCircleWarning,
  ScanSearch,
  ShieldAlert,
  UserX,
} from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { PageHeader, SafetyBanner, SimulatedBadge } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DIGITAL_THREATS } from "@/data/mock";
import { brandTitle, pageMeta } from "@/lib/page-meta";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/digital-safety")({
  head: () => pageMeta(brandTitle("Digital Safety"), "Guided help for harassment, sextortion, impersonation, account compromise and phishing. Demo analysis."),
  component: DigitalSafety,
});

const THREAT_ICONS: Record<string, typeof ShieldAlert> = {
  "message-circle-warning": MessageCircleWarning,
  "shield-alert": ShieldAlert,
  "user-x": UserX,
  "key-round": KeyRound,
  fish: Fish,
};

function DigitalSafety() {
  const [selected, setSelected] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [platform, setPlatform] = useState("WhatsApp");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{ urgency: number; exposure: number; verdict: string } | null>(null);

  const threat = DIGITAL_THREATS.find((t) => t.id === selected);

  const analyze = () => {
    setAnalyzing(true);
    setResult(null);
    // Simulated analysis — a real model/API integration comes later.
    setTimeout(() => {
      setAnalyzing(false);
      setResult({
        urgency: description.length > 120 ? 82 : 61,
        exposure: platform === "Email" ? 45 : 70,
        verdict:
          "Demo assessment: based only on your text — no content was uploaded or sent anywhere. Recommended actions below are general best practice, not legal or medical advice.",
      });
    }, 1100);
  };

  return (
    <AppLayout>
      <PageHeader
        title="Digital Safety"
        description="Pick the situation you're facing, describe it briefly, and get a demo triage with recommended next steps."
      />

      <SafetyBanner>
        If you are in immediate danger, contact your local emergency number. For India: 112 (emergency), 1930 (cyber
        fraud), cybercrime.gov.in (online crime reporting).
      </SafetyBanner>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {DIGITAL_THREATS.map((t) => {
          const Icon = THREAT_ICONS[t.icon] ?? ShieldAlert;
          const active = selected === t.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                setSelected(t.id);
                setResult(null);
              }}
              className={cn(
                "rounded-2xl border bg-card p-4 text-left shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5",
                active && "ring-2 ring-ring",
              )}
            >
              <span className={cn("grid h-9 w-9 place-items-center rounded-xl", active ? "gradient-hero text-white" : "bg-primary/10 text-primary")}>
                <Icon className="h-4.5 w-4.5" />
              </span>
              <p className="mt-3 font-display text-sm font-semibold">{t.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.description}</p>
            </button>
          );
        })}
      </div>

      {threat && (
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="font-display text-base">Describe the incident</CardTitle>
              <SimulatedBadge />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Where did it happen?</p>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["WhatsApp", "Instagram", "SMS", "Email", "Dating app", "Other"].map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What happened?</p>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  placeholder="Describe in your own words. Don't include passwords, OTPs or intimate content."
                />
                <p className="text-[11px] text-muted-foreground">Stays in your browser — demo analysis is simulated.</p>
              </div>
              <Button className="w-full rounded-xl gap-2" onClick={analyze} disabled={analyzing || !description.trim()}>
                <ScanSearch className="h-4 w-4" /> {analyzing ? "Analyzing (demo)…" : "Run demo analysis"}
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {analyzing && <Skeleton className="h-48 rounded-2xl" />}
            {!analyzing && result && (
              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-base">Demo analysis result</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="mb-1 flex justify-between text-xs font-medium"><span>Urgency (simulated)</span><span className="font-bold">{result.urgency}/100</span></p>
                    <Progress value={result.urgency} className="h-2" />
                  </div>
                  <div>
                    <p className="mb-1 flex justify-between text-xs font-medium"><span>Exposure risk (simulated)</span><span className="font-bold">{result.exposure}/100</span></p>
                    <Progress value={result.exposure} className="h-2" />
                  </div>
                  <p className="rounded-xl bg-accent/60 p-3 text-xs leading-relaxed text-accent-foreground">{result.verdict}</p>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle className="font-display text-base">Recommended actions · {threat.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2.5">
                  {threat.recommendedActions.map((a, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <Badge variant="secondary" className="mt-0.5 h-5 w-5 shrink-0 justify-center rounded-full p-0 text-[10px] font-bold">{i + 1}</Badge>
                      <span className="leading-relaxed">{a}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {!threat && (
        <Card className="mt-6 border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Select a category above to see guidance and run the demo analysis.
          </CardContent>
        </Card>
      )}
    </AppLayout>
  );
}
