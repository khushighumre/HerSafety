import { describe, expect, it } from "vitest";
import {
  CHECKIN_INTERVAL_SECONDS,
  computeJourneyTimers,
  formatDuration,
  getEstimatedRouteDuration,
} from "@/lib/journey-timer";

describe("journey timer utilities", () => {
  it("returns zero elapsed time and default countdown for planned journey", () => {
    const timers = computeJourneyTimers(
      "2026-10-25T10:00:00Z",
      "planned",
      new Date("2026-10-25T10:05:00Z").getTime(),
    );

    expect(timers.elapsedSeconds).toBe(0);
    expect(timers.secondsUntilCheckin).toBe(CHECKIN_INTERVAL_SECONDS);
    expect(timers.checkinDue).toBe(false);
    expect(timers.isStarted).toBe(false);
  });

  it("calculates accurate elapsed time based on persisted start timestamp", () => {
    const startedAt = "2026-10-25T10:00:00Z";
    const nowMs = new Date("2026-10-25T10:02:30Z").getTime(); // 150 seconds later

    const timers = computeJourneyTimers(startedAt, "active", nowMs);

    expect(timers.elapsedSeconds).toBe(150);
    expect(timers.isStarted).toBe(true);
    expect(timers.isFinished).toBe(false);
  });

  it("does not restart elapsed time or check-in countdown on page refresh simulation", () => {
    const startedAt = "2026-10-25T10:00:00Z";

    // Initial mount after 40 seconds
    const mount1 = computeJourneyTimers(
      startedAt,
      "active",
      new Date("2026-10-25T10:00:40Z").getTime(),
    );
    expect(mount1.elapsedSeconds).toBe(40);
    expect(mount1.secondsUntilCheckin).toBe(50); // 90 - 40
    expect(mount1.checkinDue).toBe(false);

    // Page refresh simulated 5 seconds later (45 seconds total elapsed)
    const refreshMount = computeJourneyTimers(
      startedAt,
      "active",
      new Date("2026-10-25T10:00:45Z").getTime(),
    );
    // MUST NOT reset to 0 or 90!
    expect(refreshMount.elapsedSeconds).toBe(45);
    expect(refreshMount.secondsUntilCheckin).toBe(45); // 90 - 45
    expect(refreshMount.checkinDue).toBe(false);

    // Refresh after 100 seconds (in second cycle: 100 % 90 = 10s into second cycle)
    const laterRefresh = computeJourneyTimers(
      startedAt,
      "active",
      new Date("2026-10-25T10:01:40Z").getTime(),
    );
    expect(laterRefresh.elapsedSeconds).toBe(100);
    expect(laterRefresh.secondsUntilCheckin).toBe(80); // 90 - 10
  });

  it("freezes elapsed time at ended_at for completed journeys", () => {
    const startedAt = "2026-10-25T10:00:00Z";
    const endedAt = "2026-10-25T10:20:00Z"; // 20 minutes = 1200 seconds
    const laterTime = new Date("2026-10-25T11:00:00Z").getTime(); // 1 hour later

    const timers = computeJourneyTimers(startedAt, "completed", laterTime, endedAt);
    expect(timers.elapsedSeconds).toBe(1200);
    expect(timers.isFinished).toBe(true);
  });

  it("formats durations properly into MM:SS and H:MM:SS", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(45)).toBe("00:45");
    expect(formatDuration(125)).toBe("02:05");
    expect(formatDuration(3665)).toBe("1h 01m 05s");
  });

  it("preserves estimated route duration separately from elapsed running timer", () => {
    const walkEstimate = getEstimatedRouteDuration("walk");
    const bikeEstimate = getEstimatedRouteDuration("bike");
    const carEstimate = getEstimatedRouteDuration("car");

    expect(walkEstimate.label).toBe("~26 mins");
    expect(bikeEstimate.label).toBe("~12 mins");
    expect(carEstimate.label).toBe("~18 mins");
  });
});
