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
 * Tile provider constants — swap these to change the map source without
 * touching component logic.
 *
 * OSM standard tiles: free, no API key required.
 * Attribution is required by the OSM tile usage policy.
 * https://operations.osmfoundation.org/policies/tiles/
 */
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
const TILE_MAX_ZOOM = 19;

function createLeafletMarker(L: typeof import("leaflet"), m: MapMarker) {
  const color = TONES[m.tone ?? "primary"];
  const isDemo = Boolean(m.isDemo);
  const iconHtml = isDemo
    ? `<div style="width:16px;height:16px;transform:rotate(45deg);background:${color};border:2px solid #ffffff;box-shadow:0 1px 5px rgba(0,0,0,0.35);border-radius:3px;"></div>`
    : `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4)"></div>`;

  const icon = L.divIcon({
    className: "",
    html: iconHtml,
    iconSize: isDemo ? [16, 16] : [18, 18],
    iconAnchor: isDemo ? [8, 8] : [9, 9],
  });
  const marker = L.marker([m.lat, m.lng] as L.LatLngExpression, { icon });
  if (m.label) {
    const tooltipContent = isDemo
      ? `<div style="font-size:11.5px;font-family:sans-serif;line-height:1.35;max-width:230px"><span style="display:inline-block;padding:1.5px 5px;font-size:9.5px;font-weight:500;color:#6b7280;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:4px;margin-bottom:3px">Illustrative sample</span><br/><strong>${m.label}</strong>${m.subLabel ? `<br/><span style="color:#6b7280;font-size:10.5px">${m.subLabel}</span>` : ""}</div>`
      : m.label;
    marker.bindTooltip(tooltipContent, { direction: "top", offset: [0, -8] });
  }
  return marker;
}

/**
 * Client-only Leaflet map. Leaflet is dynamically imported inside an effect so
 * it never runs during SSR. Tiles come from OpenStreetMap (free, no API key).
 */
export function MapView({ center, zoom = 13, markers = [], polylines = [], circles = [], fitAll = true, className, dark }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const layerGroupRef = useRef<unknown>(null);
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

      L.tileLayer(TILE_URL, {
        attribution: TILE_ATTRIBUTION,
        maxZoom: TILE_MAX_ZOOM,
      }).addTo(map);

      const layerGroup = L.layerGroup().addTo(map);
      layerGroupRef.current = layerGroup;

      const bounds: [number, number][] = [];

      for (const line of polylines) {
        L.polyline(line.coords as L.LatLngExpression[], {
          color: line.color,
          weight: line.weight ?? 5,
          opacity: line.opacity ?? 0.9,
          dashArray: line.dashed ? "6 10" : undefined,
          lineCap: "round",
        }).addTo(layerGroup);
        bounds.push(...(line.coords as [number, number][]));
      }

      for (const c of circles) {
        L.circle([c.lat, c.lng] as L.LatLngExpression, {
          radius: c.radiusM,
          color: c.color,
          weight: 1.5,
          fillColor: c.color,
          fillOpacity: 0.12,
        }).addTo(layerGroup);
        bounds.push([c.lat, c.lng]);
      }

      for (const m of markers) {
        const marker = createLeafletMarker(L, m);
        marker.addTo(layerGroup);
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
        layerGroup.clearLayers();
        layerGroupRef.current = null;
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

  // Update layers and re-fit when inputs change (post-mount updates like route selection or backend response).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    void (async () => {
      const L = await import("leaflet");
      const map = mapRef.current as L.Map | null;
      const layerGroup = layerGroupRef.current as L.LayerGroup | null;
      if (!map || !layerGroup) return;

      layerGroup.clearLayers();
      const bounds: [number, number][] = [];

      for (const line of polylines) {
        L.polyline(line.coords as L.LatLngExpression[], {
          color: line.color,
          weight: line.weight ?? 5,
          opacity: line.opacity ?? 0.9,
          dashArray: line.dashed ? "6 10" : undefined,
          lineCap: "round",
        }).addTo(layerGroup);
        bounds.push(...(line.coords as [number, number][]));
      }

      for (const c of circles) {
        L.circle([c.lat, c.lng] as L.LatLngExpression, {
          radius: c.radiusM,
          color: c.color,
          weight: 1.5,
          fillColor: c.color,
          fillOpacity: 0.12,
        }).addTo(layerGroup);
        bounds.push([c.lat, c.lng]);
      }

      for (const m of markers) {
        const marker = createLeafletMarker(L, m);
        marker.addTo(layerGroup);
        bounds.push([m.lat, m.lng]);
      }

      if (fitAll && bounds.length > 1) {
        map.fitBounds(L.latLngBounds(bounds).pad(0.18));
      } else if (fitAll && bounds.length === 1 && bounds[0]) {
        map.setView(bounds[0], zoom);
      }
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
