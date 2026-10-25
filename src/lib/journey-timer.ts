/**
 * src/lib/journey-timer.ts
 *
 * Utilities for computing elapsed journey time and check-in countdown
 * from persisted SQLite timestamps (started_at, ended_at).
 *
 * Ensures timers never reset to zero on browser refresh or page navigation.
 */

export const CHECKIN_INTERVAL_SECONDS = 90;

export interface JourneyTimerState {
  /** Elapsed seconds since journey start */
  elapsedSeconds: number;
  /** Seconds remaining in current check-in cycle */
  secondsUntilCheckin: number;
  /** Whether the periodic check-in is due now */
  checkinDue: boolean;
  /** Progress percentage (0 - 100) towards the next check-in */
  progressPct: number;
  /** Whether the journey has actively started */
  isStarted: boolean;
  /** Whether the journey has ended */
  isFinished: boolean;
}

/**
 * Derives timer state from the persisted started_at timestamp and current clock time.
 * If the page is refreshed, passing the persisted started_at and the new Date.now()
 * restores the exact elapsed time and check-in countdown seamlessly.
 */
export function computeJourneyTimers(
  startedAt: string | Date | null | undefined,
  status: string,
  nowMs: number = Date.now(),
  endedAt?: string | Date | null,
  checkinInterval: number = CHECKIN_INTERVAL_SECONDS,
): JourneyTimerState {
  if (!startedAt || status === "planned") {
    return {
      elapsedSeconds: 0,
      secondsUntilCheckin: checkinInterval,
      checkinDue: false,
      progressPct: 0,
      isStarted: false,
      isFinished: false,
    };
  }

  const startMs = typeof startedAt === "string" ? new Date(startedAt).getTime() : startedAt.getTime();
  if (isNaN(startMs)) {
    return {
      elapsedSeconds: 0,
      secondsUntilCheckin: checkinInterval,
      checkinDue: false,
      progressPct: 0,
      isStarted: false,
      isFinished: false,
    };
  }

  const isFinished = status === "completed" || status === "cancelled";
  const endMs = isFinished && endedAt
    ? (typeof endedAt === "string" ? new Date(endedAt).getTime() : endedAt.getTime())
    : nowMs;

  const validEndMs = isNaN(endMs) ? nowMs : endMs;
  const elapsedMs = Math.max(0, validEndMs - startMs);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  if (isFinished) {
    return {
      elapsedSeconds,
      secondsUntilCheckin: 0,
      checkinDue: false,
      progressPct: 100,
      isStarted: true,
      isFinished: true,
    };
  }

  const secondsIntoCycle = elapsedSeconds % checkinInterval;
  const secondsUntilCheckin = checkinInterval - secondsIntoCycle;
  const checkinDue = secondsUntilCheckin === 0 || (secondsIntoCycle === 0 && elapsedSeconds > 0);
  const progressPct = ((checkinInterval - secondsUntilCheckin) / checkinInterval) * 100;

  return {
    elapsedSeconds,
    secondsUntilCheckin,
    checkinDue,
    progressPct,
    isStarted: true,
    isFinished: false,
  };
}

/**
 * Format elapsed seconds as MM:SS or H:MM:SS
 */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}h ${remM.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Compute an estimated route duration based on transport mode and distance.
 * Preserved strictly as a static estimate, separate from elapsed time.
 */
export function getEstimatedRouteDuration(mode: string): { durationMinutes: number; label: string } {
  switch (mode.toLowerCase()) {
    case "bike":
      return { durationMinutes: 12, label: "~12 mins" };
    case "car":
      return { durationMinutes: 18, label: "~18 mins" };
    case "walk":
    default:
      return { durationMinutes: 26, label: "~26 mins" };
  }
}
