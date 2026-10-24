import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  Camera,
  FileLock2,
  HeartHandshake,
  Map,
  MessageSquareLock,
  Moon,
  Navigation,
  Shield,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { brandTitle } from "@/lib/page-meta";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "Her Safety — Privacy-first safety for women (Hackathon demo)",
      },
      {
        name: "description",
        content:
          "Her Safety combines journey sharing, route safety insights, community reports, digital-safety guidance and a tamper-evident evidence vault. A demo build with clearly-labelled simulated data.",
      },
      { property: "og:title", content: "Her Safety — Privacy-first safety for women (Hackathon demo)" },
      {
        property: "og:description",
        content: "Journey sharing, route safety, community reports, digital safety and an evidence vault — one calm place.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: Map, title: "Active Journey", text: "Share your trip live with people you trust, with check-in prompts and one-tap 'I'm Okay'." },
  { icon: Navigation, title: "Route Safety", text: "Compare Fastest, Balanced and Safest routes with night-activity scores and data-coverage flags." },
  { icon: Users, title: "Trusted Circle", text: "Choose who sees your journeys, generate temporary share links, revoke anytime." },
  { icon: HeartHandshake, title: "Community Safety", text: "See and add community reports — verified by neighbours, never treated as fact." },
  { icon: MessageSquareLock, title: "Digital Safety", text: "Guided help for harassment, sextortion, impersonation, account takeover and phishing." },
  { icon: FileLock2, title: "Evidence Vault", text: "Files are hashed with SHA-256 so you can prove nothing was altered later." },
  { icon: Camera, title: "Photo Cleaner", text: "Strip EXIF metadata — location, device and timestamps — before sharing photos." },
  { icon: Shield, title: "Privacy Checkup", text: "A guided audit of location sharing, permissions, account security and evidence retention." },
];

const STEPS = [
  { n: "01", title: "Set up your circle", text: "Add the people who should know where you are — and who shouldn't." },
  { n: "02", title: "Plan the trip", text: "Check the route's night-activity score before you leave, not after." },
  { n: "03", title: "Travel with backup", text: "Share live, get check-in prompts, trigger SOS if things change." },
  { n: "04", title: "Document when needed", text: "Log incidents and evidence with tamper-evident hashing." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl gradient-hero text-white shadow-[var(--shadow-card)]">
              <Shield className="h-5 w-5" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight">
              Her<span className="gradient-text">Safety</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link to="/resources">Resources</Link>
            </Button>
            <Button asChild className="rounded-xl">
              <Link to="/dashboard">
                Get Started <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/2 h-105 w-200 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute top-40 -left-24 h-80 w-80 rounded-full bg-pink/25 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 text-center md:px-6 md:pt-24">
          <Badge variant="secondary" className="mb-5 gap-1.5 rounded-full px-3 py-1 text-xs">
            <Sparkles className="h-3 w-3" /> Hackathon demo · simulated data throughout
          </Badge>
          <h1 className="mx-auto max-w-3xl font-display text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">
            Safety that's <span className="gradient-text">yours first</span> — online and off
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">
            Her Safety keeps your physical and digital safety in one calm place: journeys shared only with people you
            trust, routes scored for night activity, community watch reports, and an evidence vault you control.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="h-12 rounded-2xl px-8 text-base">
              <Link to="/dashboard">
                Get Started <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 rounded-2xl px-8 text-base">
              <Link to="/route-safety">Try Route Safety</Link>
            </Button>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-success" /> Privacy-first by design
            </span>
            <span className="flex items-center gap-1.5">
              <Moon className="h-3.5 w-3.5 text-primary" /> Built for night commutes
            </span>
            <span className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-pink" /> Education built in
            </span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <div className="mb-10 text-center">
          <h2 className="font-display text-2xl font-bold md:text-3xl">Everything works together</h2>
          <p className="mt-2 text-muted-foreground">Eight tools, one consistent design, one privacy stance.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="group rounded-2xl border bg-card p-5 shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y bg-card/50">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
          <div className="mb-10 text-center">
            <h2 className="font-display text-2xl font-bold md:text-3xl">How it works</h2>
            <p className="mt-2 text-muted-foreground">Four steps from setup to evidence — all demoable right now.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="relative rounded-2xl border bg-card p-5 shadow-[var(--shadow-card)]">
                <span className="font-display text-3xl font-extrabold gradient-text">{s.n}</span>
                <h3 className="mt-2 font-display font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Button asChild size="lg" className="h-12 rounded-2xl px-10 text-base">
              <Link to="/dashboard">
                Open the demo <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 py-10 text-center text-xs text-muted-foreground md:px-6">
        Her Safety is a hackathon prototype. All data shown is simulated and clearly labelled — it does not represent
        real-world safety conditions. In an emergency, call your local emergency number.
      </footer>
    </div>
  );
}
