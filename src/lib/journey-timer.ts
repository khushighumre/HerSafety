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

/**
 * Format timestamp as localized time string (e.g. "04:42:15 PM" or "16:42:15").
 */
export function formatLocalTime(
  dateOrMs: number | Date | string | null | undefined,
  includeSeconds = true,
): string {
  if (!dateOrMs) return "--:--";
  const d = typeof dateOrMs === "number" ? new Date(dateOrMs) : new Date(dateOrMs);
  if (isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
  });
}

/**
 * Format timestamp as localized short date and time (e.g. "Oct 25, 08:30 PM").
 */
export function formatDateTime(dateOrMs: number | Date | string | null | undefined): string {
  if (!dateOrMs) return "--";
  const d = typeof dateOrMs === "number" ? new Date(dateOrMs) : new Date(dateOrMs);
  if (isNaN(d.getTime())) return "--";
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface ArrivalCalculationParams {
  nowMs: number;
  durationMinutes?: number | null | undefined;
  status: string; // "planned" | "active" | "completed" | "cancelled"
  plannedDepartureTime?: string | null | undefined;
  endedAt?: string | null | undefined;
}

export interface ArrivalCalculationResult {
  hasValidEstimate: boolean;
  durationLabel: string;
  arrivalLabel: string;
  formattedArrival: string;
  formattedDeparture?: string | null;
  isScheduled: boolean;
}

/**
 * Calculates estimated arrival time and trip duration from actual route duration and local clock.
 * - If route duration is unavailable (null, undefined, <= 0), displays "Estimated duration unavailable"
 *   and does not invent an arrival time.
 * - For a planned journey with a scheduled departure time, calculates arrival from the scheduled
 *   departure and labels it clearly as scheduled.
 * - For an active journey, calculates arrival from current local time plus trip duration.
 */
export function calculateEstimatedArrival(
  params: ArrivalCalculationParams,
): ArrivalCalculationResult {
  const { nowMs, durationMinutes, status, plannedDepartureTime, endedAt } = params;

  if (status === "completed" && endedAt) {
    const hasValidDuration = typeof durationMinutes === "number" && durationMinutes > 0 && !isNaN(durationMinutes);
    return {
      hasValidEstimate: true,
      durationLabel: hasValidDuration ? `${Math.round(durationMinutes)} min` : "Estimated duration unavailable",
      arrivalLabel: "Arrived at",
      formattedArrival: formatDateTime(endedAt),
      isScheduled: false,
    };
  }

  if (status === "cancelled") {
    const hasValidDuration = typeof durationMinutes === "number" && durationMinutes > 0 && !isNaN(durationMinutes);
    return {
      hasValidEstimate: false,
      durationLabel: hasValidDuration ? `${Math.round(durationMinutes)} min` : "Estimated duration unavailable",
      arrivalLabel: "Journey cancelled",
      formattedArrival: "Unavailable",
      isScheduled: false,
    };
  }

  // If route duration is unavailable, do not invent an arrival time
  if (typeof durationMinutes !== "number" || durationMinutes <= 0 || isNaN(durationMinutes)) {
    return {
      hasValidEstimate: false,
      durationLabel: "Estimated duration unavailable",
      arrivalLabel: "Est. arrival",
      formattedArrival: "Arrival time unavailable",
      isScheduled: false,
    };
  }

  const durationMs = Math.round(durationMinutes * 60 * 1000);
  const durationLabel = `${Math.round(durationMinutes)} min`;

  // For a planned journey with a scheduled departure time
  if (status === "planned" && plannedDepartureTime) {
    const depDate = new Date(plannedDepartureTime);
    if (!isNaN(depDate.getTime())) {
      const depMs = depDate.getTime();
      const arrivalMs = depMs + durationMs;
      return {
        hasValidEstimate: true,
        durationLabel,
        arrivalLabel: "Est. arrival (scheduled)",
        formattedArrival: formatDateTime(arrivalMs),
        formattedDeparture: formatDateTime(depMs),
        isScheduled: true,
      };
    }
  }

  // Active journey or planned journey without a scheduled departure time
  const arrivalMs = nowMs + durationMs;
  return {
    hasValidEstimate: true,
    durationLabel,
    arrivalLabel: status === "active" ? "Est. arrival" : "Est. arrival (if leaving now)",
    formattedArrival: formatLocalTime(arrivalMs, false),
    isScheduled: false,
  };
}
