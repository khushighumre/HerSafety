/**
 * src/api/triage.ts
 *
 * Typed client for POST /api/v1/triage — Digital Safety Triage API.
 *
 * Types mirror the backend TriageRequest / TriageResponse schemas in
 * backend/routers/triage.py exactly.
 *
 * IMPORTANT: Scores are illustrative demo heuristics produced by simple
 * keyword rules. They are NOT validated risk probabilities or AI predictions.
 */

import { apiRequest } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Supported categories — must match backend SUPPORTED_CATEGORIES and the
// frontend DIGITAL_THREATS ids in src/data/mock.ts.
// ---------------------------------------------------------------------------

export type ThreatCategory =
  | "harassment"
  | "sextortion"
  | "impersonation"
  | "account"
  | "phishing";

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export interface TriageRequest {
  /** One of the five supported threat categories. */
  category: ThreatCategory;
  /** Platform or service involved (e.g. "WhatsApp", "Instagram"). */
  platform: string;
  /** Description of the incident. Max 2,000 characters. */
  description: string;
}

// ---------------------------------------------------------------------------
// Response — mirrors TriageResponse in backend/routers/triage.py
// ---------------------------------------------------------------------------

export interface TriageResponse {
  category: ThreatCategory;
  platform: string;
  /** Urgency indicator 0–100. Illustrative only. */
  urgency_score: number;
  /** Exposure risk indicator 0–100. Illustrative only. */
  exposure_score: number;
  /** Confidence label: "high confidence" | "moderate confidence" | "low confidence (limited information provided)" */
  confidence: string;
  /** Concise non-alarmist explanation of the assessment. */
  verdict: string;
  /** Ordered list of practical recommended actions for this category. */
  recommended_actions: string[];
  /** Always "rules" — no AI model is used. */
  method: string;
  /** Disclaimer stating this is a demo assessment, not a validated prediction. */
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

export function submitTriage(req: TriageRequest): Promise<TriageResponse> {
  return apiRequest<TriageResponse>("POST", "/api/v1/triage", req);
}
