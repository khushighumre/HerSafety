import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createJourney,
  fetchJourneys,
  fetchJourneyById,
  startJourney,
  completeJourney,
  cancelJourney,
  createCheckIn,
  fetchCheckIns,
  fetchCheckInStatus,
} from "@/api/journeys";

describe("journeys API client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("creates a journey via POST /api/v1/journeys", async () => {
    const mockCreated = {
      id: 42,
      origin: "MG Road Metro",
      destination: "Koramangala 5th Block",
      origin_name: "MG Road Metro",
      destination_name: "Koramangala 5th Block",
      travel_mode: "walk",
      transport_mode: "walk",
      status: "planned",
      planned_departure_time: "2026-10-25T20:30:00Z",
      created_at: "2026-10-25T19:00:00Z",
      started_at: "2026-10-25T19:00:00Z",
      ended_at: null,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => mockCreated,
    });

    const result = await createJourney({
      origin: "MG Road Metro",
      destination: "Koramangala 5th Block",
      travel_mode: "walk",
      planned_departure_time: "2026-10-25T20:30:00Z",
      status: "planned",
    });

    expect(result.id).toBe(42);
    expect(result.origin).toBe("MG Road Metro");
    expect(result.destination).toBe("Koramangala 5th Block");
    expect(result.travel_mode).toBe("walk");
    expect(result.status).toBe("planned");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/journeys$/),
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("fetches saved journeys via GET /api/v1/journeys", async () => {
    const mockList = [
      {
        id: 2,
        origin: "Indiranagar",
        destination: "Domlur",
        travel_mode: "bike",
        status: "active",
        created_at: "2026-10-25T19:30:00Z",
      },
      {
        id: 1,
        origin: "MG Road",
        destination: "Koramangala",
        travel_mode: "walk",
        status: "completed",
        created_at: "2026-10-25T18:00:00Z",
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockList,
    });

    const journeys = await fetchJourneys();
    expect(journeys).toHaveLength(2);
    expect(journeys[0]?.id).toBe(2);
    expect(journeys[1]?.id).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/journeys$/),
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("fetches a single journey by id via GET /api/v1/journeys/:id", async () => {
    const mockItem = {
      id: 7,
      origin: "Majestic",
      destination: "Jayanagar",
      travel_mode: "car",
      status: "planned",
      created_at: "2026-10-25T20:00:00Z",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockItem,
    });

    const journey = await fetchJourneyById(7);
    expect(journey.id).toBe(7);
    expect(journey.origin).toBe("Majestic");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/journeys\/7$/),
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("starts a planned journey via POST /api/v1/journeys/:id/start", async () => {
    const mockStarted = {
      id: 10,
      origin: "Point A",
      destination: "Point B",
      travel_mode: "walk",
      status: "active",
      started_at: "2026-10-25T20:30:00Z",
      created_at: "2026-10-25T20:00:00Z",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockStarted,
    });

    const journey = await startJourney(10);
    expect(journey.status).toBe("active");
    expect(journey.started_at).toBe("2026-10-25T20:30:00Z");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/journeys\/10\/start$/),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("completes an active journey via POST /api/v1/journeys/:id/complete", async () => {
    const mockCompleted = {
      id: 10,
      origin: "Point A",
      destination: "Point B",
      travel_mode: "walk",
      status: "completed",
      started_at: "2026-10-25T20:30:00Z",
      ended_at: "2026-10-25T20:55:00Z",
      created_at: "2026-10-25T20:00:00Z",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockCompleted,
    });

    const journey = await completeJourney(10);
    expect(journey.status).toBe("completed");
    expect(journey.ended_at).toBe("2026-10-25T20:55:00Z");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/journeys\/10\/complete$/),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("cancels a journey via POST /api/v1/journeys/:id/cancel", async () => {
    const mockCancelled = {
      id: 10,
      origin: "Point A",
      destination: "Point B",
      travel_mode: "walk",
      status: "cancelled",
      started_at: "2026-10-25T20:30:00Z",
      ended_at: "2026-10-25T20:35:00Z",
      created_at: "2026-10-25T20:00:00Z",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockCancelled,
    });

    const journey = await cancelJourney(10);
    expect(journey.status).toBe("cancelled");
    expect(journey.ended_at).toBe("2026-10-25T20:35:00Z");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/journeys\/10\/cancel$/),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("creates a check-in via POST /api/v1/journeys/:id/check-ins", async () => {
    const mockCheckIn = {
      id: 1,
      journey_id: 10,
      status: "confirmed",
      created_at: "2026-10-25T20:31:00Z",
      responded_at: "2026-10-25T20:31:00Z",
      checked_at: "2026-10-25T20:31:00Z",
      note: "I'm okay",
      lat: 12.9756,
      lng: 77.6068,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => mockCheckIn,
    });

    const result = await createCheckIn(10, { note: "I'm okay", lat: 12.9756, lng: 77.6068 });
    expect(result.id).toBe(1);
    expect(result.journey_id).toBe(10);
    expect(result.status).toBe("confirmed");
    expect(result.note).toBe("I'm okay");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/journeys\/10\/check-ins$/),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ note: "I'm okay", lat: 12.9756, lng: 77.6068 }),
      }),
    );
  });

  it("fetches check-ins for a journey via GET /api/v1/journeys/:id/check-ins", async () => {
    const mockList = [
      {
        id: 2,
        journey_id: 10,
        status: "confirmed",
        created_at: "2026-10-25T20:32:30Z",
        responded_at: "2026-10-25T20:32:30Z",
        checked_at: "2026-10-25T20:32:30Z",
        note: "Checkpoint 2",
      },
      {
        id: 1,
        journey_id: 10,
        status: "confirmed",
        created_at: "2026-10-25T20:31:00Z",
        responded_at: "2026-10-25T20:31:00Z",
        checked_at: "2026-10-25T20:31:00Z",
        note: "I'm okay",
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockList,
    });

    const checkIns = await fetchCheckIns(10);
    expect(checkIns).toHaveLength(2);
    expect(checkIns[0]?.id).toBe(2);
    expect(checkIns[1]?.id).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/journeys\/10\/check-ins$/),
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("fetches check-in status via GET /api/v1/journeys/:id/check-in-status", async () => {
    const mockStatus = {
      journey_id: 15,
      journey_status: "active",
      is_overdue: true,
      checkin_required: true,
      last_checkin_at: "2026-10-25T20:30:00Z",
      next_checkin_due_at: "2026-10-25T20:31:30Z",
      seconds_overdue: 45,
      seconds_remaining: 0,
      checkin_interval_seconds: 90,
      status_label: "overdue",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockStatus,
    });

    const status = await fetchCheckInStatus(15);
    expect(status.journey_id).toBe(15);
    expect(status.is_overdue).toBe(true);
    expect(status.seconds_overdue).toBe(45);
    expect(status.status_label).toBe("overdue");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/journeys\/15\/check-in-status$/),
      expect.objectContaining({
        method: "GET",
      }),
    );
  });
});
