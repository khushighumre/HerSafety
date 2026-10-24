import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Siren, ShieldCheck, MapPin, Users } from "lucide-react";
import { DEMO_USER } from "@/data/mock";

const STEPS = ["Alerting your Trusted Circle", "Sharing live location", "Recording audio note"];

/** Fully simulated SOS flow. Never contacts real emergency services. */
export function SosDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [count, setCount] = useState(3);
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
    if (!open) {
      setCount(3);
      setTriggered(false);
      return;
    }
    if (count <= 0) {
      setTriggered(true);
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 900);
    return () => clearTimeout(t);
  }, [count, open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        {!triggered ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <Siren className="h-5 w-5" /> SOS — triggering in {count}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Press cancel now if this was accidental. When triggered, the demo will simulate alerting your
                Trusted Circle with your location.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Progress value={(3 - count) * 33.4} className="h-2" />
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Cancel — I'm okay
              </Button>
              <Button variant="destructive" className="flex-1" onClick={() => setCount(0)}>
                Trigger now
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-destructive/15 text-destructive">
                <Siren className="h-5 w-5" />
              </span>
              <div>
                <p className="font-display font-semibold">Demo SOS triggered</p>
                <Badge variant="outline" className="border-warning text-warning-foreground bg-warning/15">
                  Simulated — no emergency services contacted
                </Badge>
              </div>
            </div>
            <ul className="space-y-2 text-sm">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-success" />
                  <span>
                    <span className="font-medium">{s}</span> — simulated step {i + 1} of 3
                  </span>
                </li>
              ))}
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-success" />
                <span>Location snapshot sent to Meera, Dad, Priya (demo contacts)</span>
              </li>
              <li className="flex items-center gap-2">
                <Users className="h-4 w-4 text-success" />
                <span>{DEMO_USER.name}, you marked yourself safe? Use “I'm Okay” to stop the simulation.</span>
              </li>
            </ul>
            <p className="text-xs text-muted-foreground">
              This is a hackathon demo. In a real deployment this flow would be connected to verified emergency
              providers — it never has been in this build.
            </p>
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              I'm Okay — end demo alert
            </Button>
          </div>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
