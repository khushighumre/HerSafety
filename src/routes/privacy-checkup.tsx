import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Camera, CheckCircle2, Circle, Eye, Lock, ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { PageHeader } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { PRIVACY_CHECKLIST } from "@/data/mock";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { brandTitle, pageMeta } from "@/lib/page-meta";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/privacy-checkup")({
  head: () => pageMeta(brandTitle("Privacy Checkup"), "A guided privacy audit covering location sharing, account security, permissions and evidence retention."),
  component: PrivacyCheckup,
});

const CATEGORIES = ["Location sharing", "Account security", "App permissions", "Evidence retention"] as const;
const CATEGORY_ICONS = { "Location sharing": Eye, "Account security": Lock, "App permissions": Camera, "Evidence retention": ShieldCheck } as const;

function PrivacyCheckup() {
  const [done, setDone] = useLocalStorage<string[]>("hersafety-checkup-done", []);

  const totalWeight = PRIVACY_CHECKLIST.reduce((s, i) => s + i.weight, 0);
  const score = useMemo(
    () => Math.round(PRIVACY_CHECKLIST.filter((i) => done.includes(i.id)).reduce((s, i) => s + i.weight, 0) / totalWeight * 100),
    [done, totalWeight],
  );

  const toggle = (id: string, weight: number, currentlyDone: boolean) => {
    setDone((d) => (currentlyDone ? d.filter((x) => x !== id) : [...d, id]));
    toast.success(currentlyDone ? `Unmarked · score drops by ${weight}` : `Marked done · score rises by ${weight} points`, {
      description: "Saved locally on this device.",
    });
  };

  return (
    <AppLayout>
      <PageHeader
        title="Privacy Checkup"
        description="Work through the checklist — your progress and score persist locally in this browser."
      />

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center gap-6 py-5">
          <div>
            <p className="font-display text-4xl font-extrabold gradient-text">{score}<span className="text-lg text-muted-foreground">/100</span></p>
            <p className="text-xs text-muted-foreground">Privacy score (local demo)</p>
          </div>
          <div className="min-w-60 flex-1">
            <Progress value={score} className="h-3" />
            <p className="mt-2 text-xs text-muted-foreground">
              {score >= 80 ? "Strong posture — keep the habits up." : score >= 40 ? "Good start — finish the high-weight items first." : "Start with account security: it's the master key."}
            </p>
          </div>
          <div className="flex gap-4 text-center text-xs">
            <div>
              <p className="font-display text-xl font-bold">{done.length}</p>
              <p className="text-muted-foreground">done</p>
            </div>
            <div>
              <p className="font-display text-xl font-bold">{PRIVACY_CHECKLIST.length - done.length}</p>
              <p className="text-muted-foreground">remaining</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {CATEGORIES.map((cat) => {
          const Icon = CATEGORY_ICONS[cat];
          const items = PRIVACY_CHECKLIST.filter((i) => i.category === cat);
          return (
            <Card key={cat}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-base">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
                  {cat}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {items.map((item) => {
                  const checked = done.includes(item.id);
                  return (
                    <label
                      key={item.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors hover:bg-accent/40",
                        checked && "border-success/40 bg-success/5",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(item.id, item.weight, checked)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          {checked ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />}
                          {item.title}
                          <span className="ml-auto text-[10px] text-muted-foreground">+{item.weight}</span>
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{item.detail}</span>
                      </span>
                    </label>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppLayout>
  );
}
