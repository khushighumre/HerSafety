/**
 * src/api/journeys.ts
 *
 * Frontend API client for NightWise Phase 2 Active Journeys:
 * - POST /api/v1/journeys: create and persist a journey
 * - GET /api/v1/journeys: list saved journeys
 * - GET /api/v1/journeys/{id}: get journey by id
 * - POST /api/v1/journeys/{id}/start: start a planned journey
 * - POST /api/v1/journeys/{id}/complete: complete an active journey
 * - POST /api/v1/journeys/{id}/cancel: cancel a planned or active journey
 * - PATCH /api/v1/journeys/{id}: update status or timestamps
 */

import { apiRequest } from "@/lib/api-client";

export type JourneyTravelMode = "walk" | "bike" | "car";
export type JourneyStatus = "planned" | "active" | "completed" | "cancelled";

export interface Journey {
  id: number;
  user_label?: string;
  origin: string;
  destination: string;
  origin_name?: string;
  destination_name?: string;
  origin_lat?: number | null;
  origin_lng?: number | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
  travel_mode: JourneyTravelMode;
  transport_mode?: string;
  status: JourneyStatus;
  planned_departure_time?: string | null;
  created_at: string;
  started_at: string;
  ended_at?: string | null;
}

export interface CreateJourneyPayload {
  origin: string;
  destination: string;
  travel_mode: JourneyTravelMode;
  planned_departure_time?: string | null;
  status?: JourneyStatus;
  started_at?: string | null;
}

export async function createJourney(payload: CreateJourneyPayload): Promise<Journey> {
  return apiRequest<Journey>("POST", "/api/v1/journeys", payload);
}

export async function fetchJourneys(): Promise<Journey[]> {
  return apiRequest<Journey[]>("GET", "/api/v1/journeys");
}

export async function fetchJourneyById(id: number): Promise<Journey> {
  return apiRequest<Journey>("GET", `/api/v1/journeys/${id}`);
}

export async function startJourney(id: number): Promise<Journey> {
  return apiRequest<Journey>("POST", `/api/v1/journeys/${id}/start`);
}

export async function completeJourney(id: number): Promise<Journey> {
  return apiRequest<Journey>("POST", `/api/v1/journeys/${id}/complete`);
}

export async function cancelJourney(id: number): Promise<Journey> {
  return apiRequest<Journey>("POST", `/api/v1/journeys/${id}/cancel`);
}

export async function updateJourney(
  id: number,
  payload: {
    status?: JourneyStatus;
    started_at?: string;
    ended_at?: string;
    planned_departure_time?: string;
  },
): Promise<Journey> {
  return apiRequest<Journey>("PATCH", `/api/v1/journeys/${id}`, payload);
}

export interface CheckIn {
  id: number;
  journey_id: number;
  status: string;
  created_at: string;
  responded_at: string;
  checked_at?: string;
  lat?: number | null;
  lng?: number | null;
  note?: string | null;
}

export interface CreateCheckInPayload {
  status?: string;
  note?: string;
  lat?: number;
  lng?: number;
}

export async function createCheckIn(
  journeyId: number,
  payload?: CreateCheckInPayload,
): Promise<CheckIn> {
  return apiRequest<CheckIn>("POST", `/api/v1/journeys/${journeyId}/check-ins`, payload ?? {});
}

export async function fetchCheckIns(journeyId: number): Promise<CheckIn[]> {
  return apiRequest<CheckIn[]>("GET", `/api/v1/journeys/${journeyId}/check-ins`);
}
