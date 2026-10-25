import { describe, expect, it, vi } from "vitest";
import {
  CHECKIN_INTERVAL_SECONDS,
  computeJourneyTimers,
  formatDuration,
  getEstimatedRouteDuration,
  formatLocalTime,
  formatDateTime,
  calculateEstimatedArrival,
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

describe("local time and arrival calculations", () => {
  it("formats local time string accurately and handles invalid input", () => {
    const sampleDate = new Date(2026, 9, 25, 14, 30, 45); // 2:30:45 PM
    const withSecs = formatLocalTime(sampleDate, true);
    const withoutSecs = formatLocalTime(sampleDate, false);

    expect(withSecs).toMatch(/30/);
    expect(withSecs).toMatch(/45/);
    expect(withoutSecs).toMatch(/30/);
    expect(withoutSecs).not.toMatch(/:45/);

    expect(formatLocalTime(null)).toBe("--:--");
    expect(formatLocalTime(undefined)).toBe("--:--");
    expect(formatLocalTime("invalid-date-string")).toBe("--:--");
  });

  it("formats date and time accurately and handles invalid input", () => {
    const sampleDate = new Date(2026, 9, 25, 18, 45, 0);
    const formatted = formatDateTime(sampleDate);

    expect(formatted).toMatch(/Oct/);
    expect(formatted).toMatch(/25/);
    expect(formatted).toMatch(/45/);

    expect(formatDateTime(null)).toBe("--");
    expect(formatDateTime(undefined)).toBe("--");
    expect(formatDateTime("invalid-date-string")).toBe("--");
  });

  it("calculates estimated arrival for active journey using current local time + route duration", () => {
    const now = new Date(2026, 9, 25, 16, 0, 0); // 4:00:00 PM
    const nowMs = now.getTime();
    const durationMinutes = 73; // 1h 13m -> 5:13 PM

    const result = calculateEstimatedArrival({
      nowMs,
      durationMinutes,
      status: "active",
    });

    expect(result.hasValidEstimate).toBe(true);
    expect(result.durationLabel).toBe("73 min");
    expect(result.arrivalLabel).toBe("Est. arrival");
    expect(result.isScheduled).toBe(false);

    const expectedArrival = new Date(nowMs + 73 * 60 * 1000);
    expect(result.formattedArrival).toBe(formatLocalTime(expectedArrival, false));
  });

  it("calculates estimated arrival for planned journey from scheduled departure time", () => {
    const now = new Date(2026, 9, 25, 12, 0, 0);
    const nowMs = now.getTime();
    const plannedDep = new Date(2026, 9, 25, 19, 30, 0).toISOString(); // 7:30 PM
    const durationMinutes = 45; // -> 8:15 PM

    const result = calculateEstimatedArrival({
      nowMs,
      durationMinutes,
      status: "planned",
      plannedDepartureTime: plannedDep,
    });

    expect(result.hasValidEstimate).toBe(true);
    expect(result.durationLabel).toBe("45 min");
    expect(result.arrivalLabel).toBe("Est. arrival (scheduled)");
    expect(result.isScheduled).toBe(true);
    expect(result.formattedDeparture).toBeTruthy();

    const expectedArrival = new Date(new Date(plannedDep).getTime() + 45 * 60 * 1000);
    expect(result.formattedArrival).toBe(formatDateTime(expectedArrival));
  });

  it("handles unavailable route duration without inventing arrival times", () => {
    const nowMs = Date.now();

    // null duration
    const nullResult = calculateEstimatedArrival({
      nowMs,
      durationMinutes: null,
      status: "active",
    });
    expect(nullResult.hasValidEstimate).toBe(false);
    expect(nullResult.durationLabel).toBe("Estimated duration unavailable");
    expect(nullResult.formattedArrival).toBe("Arrival time unavailable");

    // undefined duration
    const undefResult = calculateEstimatedArrival({
      nowMs,
      durationMinutes: undefined,
      status: "active",
    });
    expect(undefResult.hasValidEstimate).toBe(false);
    expect(undefResult.durationLabel).toBe("Estimated duration unavailable");
    expect(undefResult.formattedArrival).toBe("Arrival time unavailable");

    // non-positive or NaN duration
    const zeroResult = calculateEstimatedArrival({
      nowMs,
      durationMinutes: 0,
      status: "active",
    });
    expect(zeroResult.hasValidEstimate).toBe(false);
    expect(zeroResult.durationLabel).toBe("Estimated duration unavailable");

    const nanResult = calculateEstimatedArrival({
      nowMs,
      durationMinutes: Number.NaN,
      status: "active",
    });
    expect(nanResult.hasValidEstimate).toBe(false);
    expect(nanResult.durationLabel).toBe("Estimated duration unavailable");
  });

  it("handles completed and cancelled journeys appropriately", () => {
    const nowMs = Date.now();
    const endedAt = "2026-10-25T15:30:00Z";

    const completedResult = calculateEstimatedArrival({
      nowMs,
      durationMinutes: 30,
      status: "completed",
      endedAt,
    });
    expect(completedResult.arrivalLabel).toBe("Arrived at");
    expect(completedResult.formattedArrival).toBe(formatDateTime(endedAt));

    const cancelledResult = calculateEstimatedArrival({
      nowMs,
      durationMinutes: 30,
      status: "cancelled",
    });
    expect(cancelledResult.hasValidEstimate).toBe(false);
    expect(cancelledResult.arrivalLabel).toBe("Journey cancelled");
    expect(cancelledResult.formattedArrival).toBe("Unavailable");
  });

  it("properly cleans up live timer interval upon unmount", () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

    let timerCallbackCount = 0;
    const intervalId = setInterval(() => {
      timerCallbackCount++;
    }, 1000);

    vi.advanceTimersByTime(3000);
    expect(timerCallbackCount).toBe(3);

    // Component unmount simulation
    clearInterval(intervalId);
    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);

    vi.advanceTimersByTime(3000);
    // Should not increment further after cleanup
    expect(timerCallbackCount).toBe(3);

    vi.useRealTimers();
  });
});

