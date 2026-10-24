import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Clock3, ExternalLink, LifeBuoy, PhoneCall, ShieldAlert, Siren } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EDUCATION_ITEMS, RESOURCES } from "@/data/mock";
import { brandTitle, pageMeta } from "@/lib/page-meta";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/resources")({
  head: () => pageMeta(brandTitle("Resources"), "Emergency numbers, support helplines, cybercrime reporting and short safety lessons."),
  component: ResourcesPage,
});

const TAG_STYLES = {
  emergency: "border-destructive/40 bg-destructive/10 text-destructive",
  support: "border-primary/40 bg-primary/10 text-primary",
  cyber: "border-pink/50 bg-pink/10 text-pink-foreground",
  legal: "border-success/50 bg-success/10 text-success",
} as const;

function ResourcesPage() {
  return (
    <AppLayout>
      <PageHeader
        title="Resources & Education"
        description="Verified emergency contacts and short lessons. Helplines marked 'real' are public Indian services; everything else is demo content."
      />

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
        <Siren className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div>
          <p className="font-display text-sm font-semibold text-destructive">In an emergency, call directly</p>
          <p className="text-xs text-destructive/80">
            India: 112 (all emergencies) · 1091 (women's helpline). Her Safety's SOS is a simulation and never contacts
            these services.
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <LifeBuoy className="h-4 w-4 text-primary" /> Helplines & reporting
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2.5 sm:grid-cols-2">
            {RESOURCES.map((r) => (
              <div key={r.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{r.name}</p>
                  <Badge variant="outline" className={cn("text-[10px]", TAG_STYLES[r.tag])}>{r.tag}</Badge>
                </div>
                <p className="mt-1 font-mono text-sm font-bold text-primary">{r.contact}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{r.description}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">{r.region}</p>
                {r.url && (
                  <a href={r.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    Open site <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <BookOpen className="h-4 w-4 text-pink" /> Safety education (demo lessons)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {EDUCATION_ITEMS.map((e) => (
              <button
                key={e.id}
                onClick={() => {}}
                className="w-full rounded-xl border p-3 text-left transition-colors hover:bg-accent/40"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{e.title}</p>
                  <Badge variant="secondary" className="gap-1 text-[10px]">
                    <Clock3 className="h-2.5 w-2.5" /> {e.minutes} min
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{e.summary}</p>
              </button>
            ))}
            <div className="mt-2 rounded-xl bg-accent/50 p-3 text-xs text-accent-foreground">
              <p className="flex items-center gap-1.5 font-semibold">
                <PhoneCall className="h-3.5 w-3.5" /> Remember
              </p>
              <p className="mt-1 leading-relaxed">
                Documenting early helps: screenshots with timestamps, saved voicemails, and hashed evidence give you
                options later. The Evidence Vault walkthrough in the dashboard covers this.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border bg-card p-4">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Her Safety lists only well-known public emergency numbers (112, 1091, 181, 1930, cybercrime.gov.in) as real
          references. No other contact, shelter or legal data in this demo should be treated as real.
        </p>
      </div>
    </AppLayout>
  );
}
