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
}

export interface RouteCompareResponse {
  origin: string;
  destination: string;
  mode: string;
  maxDetourPct: number;
  fastest: RouteAlternative;
  balanced: RouteAlternative;
  safest_available_data: RouteAlternative;
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

export function compareRoutes(req: RouteCompareRequest): Promise<RouteCompareResponse> {
  return apiRequest<RouteCompareResponse>("POST", "/api/v1/routes/compare", req);
}
