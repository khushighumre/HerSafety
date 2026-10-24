import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Download, Eraser, ImageUp, MapPin, Smartphone, Sparkles } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { PageHeader, SimulatedBadge } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { brandTitle, pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/photo-cleaner")({
  head: () => pageMeta(brandTitle("Photo Cleaner"), "Strip EXIF metadata like GPS location from photos before sharing. Cleaning runs fully in your browser."),
  component: PhotoCleaner,
});

function PhotoCleaner() {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [cleaning, setCleaning] = useState(false);
  const [cleanedUrl, setCleanedUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
    if (cleanedUrl) URL.revokeObjectURL(cleanedUrl);
  }, [preview, cleanedUrl]);

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (!f || !f.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    setPreview(URL.createObjectURL(f));
    setFileName(f.name);
    setFileSize(f.size);
    setCleanedUrl(null);
  };

  const clean = () => {
    if (!preview) return;
    setCleaning(true);
    const img = new Image();
    img.onload = () => {
      // Redraw onto a clean canvas — this genuinely drops EXIF/metadata.
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => {
          setCleaning(false);
          if (blob) {
            setCleanedUrl(URL.createObjectURL(blob));
            toast.success("Metadata stripped", { description: "Cleaned image re-encoded in your browser — nothing was uploaded." });
          }
        },
        "image/jpeg",
        0.92,
      );
    };
    img.src = preview;
  };

  const download = () => {
    if (!cleanedUrl) return;
    const a = document.createElement("a");
    a.href = cleanedUrl;
    a.download = fileName.replace(/\.\w+$/, "") + "-cleaned.jpg";
    a.click();
    toast.success("Downloaded cleaned image");
  };

  return (
    <AppLayout>
      <PageHeader
        title="Photo Cleaner"
        description="Remove hidden photo metadata — GPS coordinates, device model, timestamps — before you share an image."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="font-display text-base">Upload a photo</CardTitle>
            <SimulatedBadge />
          </CardHeader>
          <CardContent className="space-y-4">
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files)} />
            <button
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-colors hover:bg-accent/50"
            >
              <ImageUp className="h-8 w-8 text-primary" />
              <p className="mt-3 text-sm font-medium">Click to choose an image</p>
              <p className="mt-1 text-xs text-muted-foreground">Processed entirely in your browser — never uploaded.</p>
            </button>

            {preview ? (
              <div className="space-y-3">
                <img src={preview} alt="Uploaded preview" className="max-h-64 w-full rounded-xl object-contain" />
                <p className="text-xs text-muted-foreground">{fileName} · {(fileSize / 1024).toFixed(0)} KB</p>
                <Button className="w-full gap-2 rounded-xl" onClick={clean} disabled={cleaning}>
                  <Eraser className="h-4 w-4" /> {cleaning ? "Cleaning…" : cleanedUrl ? "Re-clean" : "Strip metadata"}
                </Button>
              </div>
            ) : (
              <p className="text-center text-xs text-muted-foreground">No photo selected yet.</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <Sparkles className="h-4 w-4 text-pink" /> Detected metadata (demo readout)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {preview ? (
                <ul className="space-y-2 text-sm">
                  {[
                    { icon: MapPin, label: "GPS coordinates", value: "12.9716° N, 77.5946° E (demo)" },
                    { icon: Smartphone, label: "Device", value: "Pixel 8 · Android 16 (demo)" },
                    { icon: Sparkles, label: "Taken at", value: "Oct 24, 2026 · 7:42 PM (demo)" },
                  ].map((row) => (
                    <li key={row.label} className="flex items-center justify-between rounded-lg border px-3 py-2">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <row.icon className="h-4 w-4" /> {row.label}
                      </span>
                      <span className="text-xs font-medium">{row.value}</span>
                    </li>
                  ))}
                  <li className="pt-1">
                    <Badge variant="outline" className="border-warning/50 bg-warning/10 text-warning-foreground">
                      Values shown are simulated examples — the cleaning itself is real
                    </Badge>
                  </li>
                </ul>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">Metadata appears here after you upload a photo.</p>
              )}
            </CardContent>
          </Card>

          {cleanedUrl && (
            <Card>
              <CardHeader>
                <CardTitle className="font-display text-base">Cleaned image</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <img src={cleanedUrl} alt="Cleaned" className="max-h-56 w-full rounded-xl object-contain" />
                <Button variant="outline" className="w-full gap-2 rounded-xl" onClick={download}>
                  <Download className="h-4 w-4" /> Download cleaned copy
                </Button>
                <p className="text-xs text-muted-foreground">
                  The download is a fresh re-encode: EXIF GPS, device and timestamp data are genuinely removed by this
                  step.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
