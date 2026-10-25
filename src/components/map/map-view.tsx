import { useEffect, useRef, useState } from "react";
import type { MapCircle, MapMarker, MapPolyline } from "@/types";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const TONES: Record<NonNullable<MapMarker["tone"]>, string> = {
  primary: "#7c5cd6",
  pink: "#e060a8",
  warning: "#f5a623",
  destructive: "#ef4444",
  success: "#22a06b",
};

interface MapViewProps {
  center: [number, number];
  zoom?: number;
  markers?: MapMarker[];
  polylines?: MapPolyline[];
  circles?: MapCircle[];
  fitAll?: boolean;
  className?: string;
  dark: boolean;
}

/**
 * Client-only Leaflet map. Leaflet is dynamically imported inside an effect so
 * it never runs during SSR. Tiles come from Carto (OSM-based, free for demos).
 */
export function MapView({ center, zoom = 13, markers = [], polylines = [], circles = [], fitAll = true, className, dark }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;

      if (mapRef.current) return;
      const map = L.map(containerRef.current, {
        center,
        zoom,
        zoomControl: true,
        attributionControl: true,
      });
      mapRef.current = map;

      L.tileLayer(
        dark
          ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>', maxZoom: 19 },
      ).addTo(map);

      const bounds: [number, number][] = [];
      const layers: L.Layer[] = [];

      for (const line of polylines) {
        const poly = L.polyline(line.coords as L.LatLngExpression[], {
          color: line.color,
          weight: line.weight ?? 5,
          opacity: 0.9,
          dashArray: line.dashed ? "6 10" : undefined,
          lineCap: "round",
        }).addTo(map);
        layers.push(poly);
        bounds.push(...(line.coords as [number, number][]));
      }

      for (const c of circles) {
        const circle = L.circle([c.lat, c.lng] as L.LatLngExpression, {
          radius: c.radiusM,
          color: c.color,
          weight: 1.5,
          fillColor: c.color,
          fillOpacity: 0.12,
        }).addTo(map);
        layers.push(circle);
        bounds.push([c.lat, c.lng]);
      }

      for (const m of markers) {
        const color = TONES[m.tone ?? "primary"];
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4)"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        const marker = L.marker([m.lat, m.lng] as L.LatLngExpression, { icon }).addTo(map);
        if (m.label) marker.bindTooltip(m.label, { direction: "top", offset: [0, -8] });
        layers.push(marker);
        bounds.push([m.lat, m.lng]);
      }

      if (fitAll && bounds.length > 1) {
        map.fitBounds(L.latLngBounds(bounds).pad(0.18));
      } else if (fitAll && bounds.length === 1 && bounds[0]) {
        map.setView(bounds[0], zoom);
      }

      setTimeout(() => map.invalidateSize(), 120);
      setReady(true);

      cleanup = () => {
        map.remove();
        mapRef.current = null;
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fit when inputs change (post-mount updates like selected route).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    void (async () => {
      const L = await import("leaflet");
      const map = mapRef.current as L.Map | null;
      if (!map) return;
      const bounds: [number, number][] = [];
      for (const line of polylines) bounds.push(...(line.coords as [number, number][]));
      for (const c of circles) bounds.push([c.lat, c.lng]);
      for (const m of markers) bounds.push([m.lat, m.lng]);
      if (bounds.length > 1) map.fitBounds(L.latLngBounds(bounds).pad(0.18));
      else if (bounds.length === 1 && bounds[0]) map.setView(bounds[0], zoom);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(polylines), JSON.stringify(markers), JSON.stringify(circles)]);

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border bg-muted", className)}>
      <div ref={containerRef} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Skeleton className="h-full w-full rounded-none" />
        </div>
      )}
    </div>
  );
}
