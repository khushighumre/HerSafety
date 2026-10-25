/**
 * Synthetic Safety Signals API client — wraps GET /api/v1/safety-data.
 *
 * Provides hardcoded synthetic Bangalore demo records for Phase 1 UI preview.
 *
 * IMPORTANT TRUST NOTICE:
 * All records are synthetic demo fixtures and NOT verified physical infrastructure
 * or real incident reports. They must never be conflated with real safety scores.
 */

import { apiRequest } from "@/lib/api-client";

export type SafetySignalType =
  | "public_transport"
  | "assistance_point"
  | "lighting"
  | "cctv"
  | "community_safety_report";

export interface DemoSafetyRecord {
  id: string;
  location: string;
  latitude: number;
  longitude: number;
  signal_type: SafetySignalType | string;
  description: string;
  source: string;
  status: string;
  is_demo: boolean;
}

export interface SafetyDataResponse {
  records: DemoSafetyRecord[];
  total: number;
  signal_type?: string | null;
  disclaimer: string;
}

/**
 * Fetch synthetic safety demo records, optionally filtered by signal_type.
 */
export async function fetchSafetyData(signalType?: string): Promise<SafetyDataResponse> {
  const query = signalType && signalType !== "all" ? `?signal_type=${encodeURIComponent(signalType)}` : "";
  return apiRequest<SafetyDataResponse>("GET", `/api/v1/safety-data${query}`);
}
