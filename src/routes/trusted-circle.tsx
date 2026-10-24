import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Copy, Link2, Plus, Star, Trash2, Users } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { EmptyState, PageHeader, SimulatedBadge } from "@/components/shared";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DEMO_SHARE_LINKS, TRUSTED_CONTACTS } from "@/data/mock";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { brandTitle, pageMeta } from "@/lib/page-meta";
import { cn } from "@/lib/utils";
import type { ShareLink, TrustedContact } from "@/types";

export const Route = createFileRoute("/trusted-circle")({
  head: () => pageMeta(brandTitle("Trusted Circle"), "Manage trusted contacts, journey recipients and temporary share links. Demo."),
  component: TrustedCircle,
});

const EXPIRY_OPTIONS = [
  { label: "2 hours", hours: 2 },
  { label: "6 hours", hours: 6 },
  { label: "24 hours", hours: 24 },
];

function TrustedCircle() {
  const [contacts, setContacts] = useLocalStorage<TrustedContact[]>("hersafety-contacts", TRUSTED_CONTACTS);
  const [links, setLinks] = useLocalStorage<ShareLink[]>("hersafety-share-links", DEMO_SHARE_LINKS);
  const [newName, setNewName] = useState("");
  const [newRelation, setNewRelation] = useState("Friend");
  const [addOpen, setAddOpen] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkExpiry, setLinkExpiry] = useState("2");
  const [linkRecipients, setLinkRecipients] = useState<string[]>([]);

  const toggleReceives = (id: string) => {
    setContacts((cs) => cs.map((c) => (c.id === id ? { ...c, receivesJourneys: !c.receivesJourneys } : c)));
  };

  const setPrimary = (id: string) => {
    setContacts((cs) => cs.map((c) => ({ ...c, isPrimary: c.id === id })));
    toast.success("Primary contact updated (demo)");
  };

  const remove = (id: string) => {
    setContacts((cs) => cs.filter((c) => c.id !== id));
    toast("Contact removed (demo)");
  };

  const addContact = () => {
    if (!newName.trim()) return;
    const initials = newName.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    setContacts((cs) => [
      ...cs,
      { id: `c${Date.now()}`, name: newName.trim(), relation: newRelation, phone: "+91 ••••• (demo)", initials, isPrimary: false, receivesJourneys: true },
    ]);
    setNewName("");
    setAddOpen(false);
    toast.success(`${newName.trim()} added to your circle (demo)`);
  };

  const createLink = () => {
    const hours = Number(linkExpiry);
    const exp = new Date(Date.now() + hours * 3600_000);
    const link: ShareLink = {
      id: `s${Date.now()}`,
      label: linkLabel.trim() || "Untitled journey",
      recipients: contacts.filter((c) => linkRecipients.includes(c.id)).map((c) => c.name),
      createdAt: "Just now",
      expiresAt: exp.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
      revoked: false,
      views: 0,
    };
    setLinks((ls) => [link, ...ls]);
    setLinkLabel("");
    setLinkRecipients([]);
    toast.success("Temporary link created (demo)", { description: `Expires in ${linkExpiry} h — nothing is actually shared.` });
  };

  const revoke = (id: string) => {
    setLinks((ls) => ls.map((l) => (l.id === id ? { ...l, revoked: true } : l)));
    toast("Link revoked (demo)");
  };

  const recipients = contacts.filter((c) => c.receivesJourneys);

  return (
    <AppLayout>
      <PageHeader
        title="Trusted Circle"
        description="Decide exactly who can follow your journeys and for how long. All actions in this demo stay on your device."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Contacts */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <Users className="h-4 w-4 text-primary" /> Trusted contacts
            </CardTitle>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 rounded-lg">
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle className="font-display">Add a trusted contact</DialogTitle>
                  <DialogDescription>Demo only — no real SMS or invitations are sent.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-name">Name</Label>
                    <Input id="contact-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Sneha" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Relationship</Label>
                    <Select value={newRelation} onValueChange={setNewRelation}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Family", "Friend", "Roommate", "Colleague", "Partner"].map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={addContact} className="rounded-xl">Add to circle</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="space-y-3">
            {contacts.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No contacts yet"
                description="Add people you'd want alerted during a journey."
                action={<Button size="sm" className="rounded-lg" onClick={() => setAddOpen(true)}>Add contact</Button>}
              />
            ) : (
              contacts.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-xl border p-3">
                  <Avatar className="h-10 w-10 border">
                    <AvatarFallback className={cn("text-xs font-bold", c.isPrimary ? "gradient-hero text-white" : "bg-accent text-accent-foreground")}>
                      {c.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      {c.name}
                      {c.isPrimary && <Star className="h-3.5 w-3.5 fill-warning text-warning" />}
                    </p>
                    <p className="text-xs text-muted-foreground">{c.relation} · {c.phone}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Journeys</span>
                    <Switch checked={c.receivesJourneys} onCheckedChange={() => toggleReceives(c.id)} aria-label={`Toggle journeys for ${c.name}`} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPrimary(c.id)} aria-label={`Set ${c.name} as primary`}>
                      <Star className={cn("h-3.5 w-3.5", c.isPrimary && "fill-warning text-warning")} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove(c.id)} aria-label={`Remove ${c.name}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
            <p className="text-xs text-muted-foreground">
              {recipients.length} of {contacts.length} contacts receive live journeys (demo preference, stored locally).
            </p>
          </CardContent>
        </Card>

        {/* Share links */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <Link2 className="h-4 w-4 text-pink" /> Temporary share links
            </CardTitle>
            <SimulatedBadge />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 rounded-xl bg-accent/50 p-4">
              <Input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Link label, e.g. 'Late night commute'" />
              <div className="grid grid-cols-2 gap-3">
                <Select value={linkExpiry} onValueChange={setLinkExpiry}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPIRY_OPTIONS.map((o) => (
                      <SelectItem key={o.hours} value={String(o.hours)}>Expires in {o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 rounded-lg border bg-card px-3 text-xs text-muted-foreground">
                  {linkRecipients.length} recipient(s) selected
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {contacts.map((c) => (
                  <label
                    key={c.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      linkRecipients.includes(c.id) ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
                    )}
                  >
                    <Checkbox
                      checked={linkRecipients.includes(c.id)}
                      onCheckedChange={() =>
                        setLinkRecipients((rs) => (rs.includes(c.id) ? rs.filter((r) => r !== c.id) : [...rs, c.id]))
                      }
                      className="sr-only"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
              <Button className="w-full rounded-xl" onClick={createLink} disabled={linkRecipients.length === 0}>
                Generate temporary link
              </Button>
            </div>

            {links.length === 0 ? (
              <EmptyState icon={Link2} title="No share links" description="Generate a temporary link above to see expiry and revocation controls." />
            ) : (
              <div className="space-y-2.5">
                {links.map((l) => (
                  <div key={l.id} className={cn("rounded-xl border p-3", l.revoked && "opacity-60")}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{l.label}</p>
                      {l.revoked ? (
                        <Badge variant="outline" className="text-muted-foreground">Revoked</Badge>
                      ) : (
                        <Badge variant="outline" className="border-success/50 bg-success/10 text-success">Active</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {l.recipients.join(", ")} · created {l.createdAt} · expires {l.expiresAt} · {l.views} views (demo)
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 rounded-lg text-xs"
                        onClick={() => {
                          void navigator.clipboard?.writeText("https://hersafety.demo/j/9f3k2a (demo link)");
                          toast.success("Demo link copied to clipboard");
                        }}
                      >
                        <Copy className="h-3 w-3" /> Copy
                      </Button>
                      {!l.revoked && (
                        <Button variant="outline" size="sm" className="h-7 rounded-lg text-xs text-destructive" onClick={() => revoke(l.id)}>
                          Revoke now
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
