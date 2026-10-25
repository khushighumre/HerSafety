/**
 * Route comparison API — wraps POST /api/v1/routes/compare.
 *
 * Types mirror the backend Pydantic schemas in backend/routers/routes.py exactly.
 * Field names are preserved as-is (the backend uses a mix of camelCase and snake_case).
 *
 * IMPORTANT: All scores are demo heuristics from fixture data.
 * They are not verified real-world safety predictions.
 */

import { apiRequest } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export interface RouteCompareRequest {
  origin: string;
  destination: string;
  mode: string;
  /** Maximum acceptable detour % relative to fastest route (0–200). Default 50. */
  maxDetourPct?: number;
}

// ---------------------------------------------------------------------------
// Response — mirrors RouteAlternative / RouteCompareResponse in routes.py
// ---------------------------------------------------------------------------

export interface SignalBreakdown {
  score: number | null;
  weight: number;
  known: boolean;
}

export interface RouteGapApi {
  gap_km: number;
  gap_from: string;
  gap_to: string;
  note: string;
}

export interface FeatureCounts {
  transport_stops: number;
  assistance_amenities: number;
  street_lamps: number;
  lit_path_segments: number;
  surveillance_points: number;
  road_segments: number;
}

export interface TagEvidenceSummary {
  amenity_types: Record<string, number>;
  transport_types: Record<string, number>;
  highway_types: Record<string, number>;
  lighting_tags: Record<string, number>;
  surveillance_tags: Record<string, number>;
}

export interface GeographicEvidence {
  source: string;
  attribution: string;
  endpoint: string;
  retrieved_at: string | null;
  status: "available" | "partial" | "unavailable" | "error";
  counts: FeatureCounts;
  observed_tags: TagEvidenceSummary;
  limitations: string[];
  missing_data_notes: string[];
}

export interface DemoCategoryCounts {
  public_transport: number;
  assistance_points: number;
  lighting: number;
  cctv: number;
  community_safety_reports: number;
  total: number;
}

export interface DemoSafetyContext {
  source: string;
  status: string;
  is_corridor_filtered: boolean;
  filter_description: string;
  counts: DemoCategoryCounts;
  matched_record_ids: string[];
  disclaimer: string;
}

export interface RouteAlternative {
  id: string;
  label: string;
  distanceKm: number;
  durationMin: number;
  mode: string;
  nightScore: number;
  breakdown: Record<string, SignalBreakdown>;
  confidence: string;
  dataCoveragePct: number;
  freshnessHours: number;
  detourPct: number;
  maxDetourPct: number;
  gap: RouteGapApi;
  notes: string[];
  coords: [number, number][];
  disclaimer: string;
  evidence?: GeographicEvidence | null | undefined;
  demo_context?: DemoSafetyContext | null | undefined;
}



export interface RouteCompareResponse {
  origin: string;
  destination: string;
  mode: string;
  maxDetourPct: number;
  routes?: RouteAlternative[];
  fastest?: RouteAlternative | null;
  balanced?: RouteAlternative | null;
  safest_available_data?: RouteAlternative | null;
  resolved_origin?: string;
  resolved_destination?: string;
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

export function compareRoutes(req: RouteCompareRequest): Promise<RouteCompareResponse> {
  return apiRequest<RouteCompareResponse>("POST", "/api/v1/routes/compare", req);
}
