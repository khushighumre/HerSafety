/**
 * src/api/incidents.ts
 *
 * Typed client for the NightWise Incident Reporting + Evidence API.
 *
 * Incident endpoints:
 *   POST /api/v1/incidents                                        — create (HTTP 201)
 *   GET  /api/v1/incidents                                        — list, newest first
 *   GET  /api/v1/incidents/{id}                                   — retrieve one
 *
 * Evidence endpoints:
 *   POST /api/v1/incidents/{id}/evidence                          — upload file (HTTP 201)
 *   GET  /api/v1/incidents/{id}/evidence                          — list evidence
 *   GET  /api/v1/incidents/{id}/evidence/{eid}/verify             — SHA-256 re-verification
 *
 * Types mirror backend schemas in backend/schemas.py exactly.
 */

import { ApiError, apiRequest } from "@/lib/api-client";

const BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");

// ---------------------------------------------------------------------------
// Supported values — must match backend VALID_SEVERITIES
// ---------------------------------------------------------------------------

export const INCIDENT_SEVERITIES = ["low", "medium", "high"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export interface IncidentCreatePayload {
  title: string;
  category: string;
  /** Defaults to "medium" on the backend if omitted. */
  severity?: IncidentSeverity;
  /** Optional free-text summary. */
  summary?: string | null;
  /** Demo user label — no auth in this prototype. */
  user_label?: string;
}

// ---------------------------------------------------------------------------
// Response — mirrors IncidentRead in backend/schemas.py
// ---------------------------------------------------------------------------

export interface BackendIncident {
  id: number;
  reference: string;
  title: string;
  category: string;
  severity: IncidentSeverity;
  /** "draft" | "open" | "archived" */
  status: string;
  summary: string | null;
  user_label: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export function fetchIncidents(): Promise<BackendIncident[]> {
  return apiRequest<BackendIncident[]>("GET", "/api/v1/incidents");
}

export function fetchIncidentById(id: number): Promise<BackendIncident> {
  return apiRequest<BackendIncident>("GET", `/api/v1/incidents/${id}`);
}

export function createIncident(payload: IncidentCreatePayload): Promise<BackendIncident> {
  return apiRequest<BackendIncident>("POST", "/api/v1/incidents", payload);
}

// ---------------------------------------------------------------------------
// Evidence — response types mirror EvidenceRead / EvidenceVerifyResult in schemas.py
// ---------------------------------------------------------------------------

export interface BackendEvidence {
  id: number;
  incident_id: number;
  original_filename: string;
  /** "image" | "document" */
  file_type: string;
  size_bytes: number;
  /** Full 64-character SHA-256 hex digest, computed server-side. */
  sha256: string;
  hash_verified: boolean;
  added_at: string;
}

export interface EvidenceVerifyResult {
  evidence_id: number;
  stored_sha256: string;
  computed_sha256: string;
  match: boolean;
}

/**
 * Allowed file extensions — must match backend _ALLOWED_EXTENSIONS.
 * Used for early client-side feedback only; server validation is authoritative.
 */
export const ALLOWED_EVIDENCE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf"] as const;
export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Upload a file as evidence for a backend-persisted incident.
 * Uses FormData so the browser sets the correct multipart boundary.
 * The file field name must be "file" to match FastAPI's File(...) parameter.
 */
export async function uploadIncidentEvidence(
  incidentId: number,
  file: File,
): Promise<BackendEvidence> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${BASE_URL}/api/v1/incidents/${incidentId}/evidence`, {
    method: "POST",
    // Do NOT set Content-Type — browser must generate the multipart boundary.
    headers: { Accept: "application/json" },
    body: form,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const json = (await res.json()) as { detail?: string | Array<{ msg?: string }> };
      if (typeof json.detail === "string") detail = json.detail;
      else if (Array.isArray(json.detail))
        detail = json.detail.map((item) => item.msg ?? JSON.stringify(item)).join("; ");
    } catch { /* keep statusText */ }
    throw new ApiError(res.status, detail);
  }

  return res.json() as Promise<BackendEvidence>;
}

export function fetchIncidentEvidence(incidentId: number): Promise<BackendEvidence[]> {
  return apiRequest<BackendEvidence[]>("GET", `/api/v1/incidents/${incidentId}/evidence`);
}

export function verifyIncidentEvidence(
  incidentId: number,
  evidenceId: number,
): Promise<EvidenceVerifyResult> {
  return apiRequest<EvidenceVerifyResult>(
    "GET",
    `/api/v1/incidents/${incidentId}/evidence/${evidenceId}/verify`,
  );
}
