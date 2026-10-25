import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  ChevronRight,
  HeartHandshake,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Map,
  Menu,
  MessageSquareLock,
  Navigation,
  Settings,
  Shield,
  Siren,
  Sparkles,
  UserRound,
  Users,
  BookOpen,
  Camera,
  FileLock2,
  CircleCheck,
  CircleAlert,
  Circle,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SosDialog } from "@/components/layout/sos-dialog";
import { DEMO_USER, NOTIFICATIONS } from "@/data/mock";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/route-safety", label: "Route Safety", icon: Navigation },
  { to: "/active-journey", label: "Active Journey", icon: Map },
  { to: "/trusted-circle", label: "Trusted Circle", icon: Users },
  { to: "/community", label: "Community Safety", icon: HeartHandshake },
  { to: "/digital-safety", label: "Digital Safety", icon: MessageSquareLock },
  { to: "/incidents", label: "Incidents & Vault", icon: FileLock2 },
  { to: "/photo-cleaner", label: "Photo Cleaner", icon: Camera },
  { to: "/privacy-checkup", label: "Privacy Checkup", icon: Shield },
  { to: "/resources", label: "Resources", icon: BookOpen },
  { to: "/settings", label: "Settings", icon: Settings },
];

const NOTIF_ICONS = {
  info: Circle,
  warning: CircleAlert,
  success: CircleCheck,
} as const;

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV.map(({ to, label, icon: Icon }) => {
        const active = pathname === to || pathname.startsWith(to + "/");
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-[var(--shadow-card)]"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="h-4.5 w-4.5 shrink-0" />
            {label}
            {active && <ChevronRight className="ml-auto h-4 w-4 opacity-70" />}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/dashboard" className="flex items-center gap-2.5 px-2 py-1">
      <span className="grid h-9 w-9 place-items-center rounded-xl gradient-hero text-white shadow-[var(--shadow-card)]">
        <Shield className="h-5 w-5" />
      </span>
      {!compact && (
        <span className="font-display text-lg font-bold tracking-tight">
          Her<span className="gradient-text">Safety</span>
        </span>
      )}
    </Link>
  );
}

function NotificationsMenu() {
  const unread = NOTIFICATIONS.filter((n) => n.unread).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-[1.15rem] w-[1.15rem]" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-pink text-[10px] font-bold text-pink-foreground">
              {unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-2">
        <DropdownMenuLabel className="flex items-center justify-between">
          Notifications
          <Badge variant="secondary" className="text-[10px]">Recent</Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {NOTIFICATIONS.map((n) => {
          const Icon = NOTIF_ICONS[n.kind];
          const tone =
            n.kind === "warning" ? "text-warning-foreground" : n.kind === "success" ? "text-success" : "text-primary";
          return (
            <DropdownMenuItem key={n.id} className="flex cursor-pointer flex-col items-start gap-0.5 rounded-lg px-2 py-2">
              <span className="flex w-full items-center gap-2 text-sm font-medium">
                <Icon className={cn("h-3.5 w-3.5 shrink-0", tone)} />
                {n.title}
                {n.unread && <span className="ml-auto h-2 w-2 rounded-full bg-pink" />}
              </span>
              <span className="text-xs text-muted-foreground">{n.detail}</span>
              <span className="text-[10px] text-muted-foreground/70">{n.time} ago</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProfileMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-full outline-none ring-ring focus-visible:ring-2" aria-label="Profile menu">
          <Avatar className="h-9 w-9 border">
            <AvatarFallback className="gradient-hero text-xs font-bold text-white">{DEMO_USER.initials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <p className="font-medium">{DEMO_USER.fullName}</p>
          <p className="text-xs font-normal text-muted-foreground">{DEMO_USER.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings" className="cursor-pointer">
            <UserRound className="h-4 w-4" /> Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings" className="cursor-pointer">
            <Settings className="h-4 w-4" /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer text-muted-foreground" disabled>
          <LogOut className="h-4 w-4" /> Sign out (no auth in demo)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [sosOpen, setSosOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-card/60 py-5 lg:flex">
        <div className="mb-6 px-4">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto pb-4">
          <SidebarNav />
        </div>
        <div className="mx-3 rounded-2xl bg-accent p-3 text-xs text-accent-foreground">
          <p className="flex items-center gap-1.5 font-semibold">
            <Sparkles className="h-3.5 w-3.5" /> Demo build
          </p>
          <p className="mt-1 leading-relaxed opacity-80">
            All journeys, scores and reports are simulated. No emergency services are connected.
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-40 flex h-16 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md md:px-6">
          <Sheet open={mobileNav} onOpenChange={setMobileNav}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <div className="p-4">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <Brand />
              </div>
              <div className="overflow-y-auto pb-6">
                <SidebarNav onNavigate={() => setMobileNav(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="lg:hidden">
            <Brand compact />
          </div>

          <div className="ml-auto flex items-center gap-1.5 md:gap-2">
            <Button
              variant="destructive"
              onClick={() => setSosOpen(true)}
              className="h-10 gap-2 rounded-xl px-4 font-display font-bold shadow-[0_4px_16px_-4px] shadow-destructive/40"
            >
              <Siren className="h-4 w-4" /> SOS
            </Button>
            <NotificationsMenu />
            <ThemeToggle />
            <ProfileMenu />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>

        <footer className="border-t px-4 py-6 text-center text-xs text-muted-foreground md:px-8">
          Her Safety · Hackathon demo · Every journey, score and report here is simulated. In an emergency, call your
          local emergency number directly.
        </footer>
      </div>

      <SosDialog open={sosOpen} onOpenChange={setSosOpen} />
    </div>
  );
}

export { LifeBuoy };
