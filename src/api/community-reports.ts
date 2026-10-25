/**
 * src/api/community-reports.ts
 *
 * Frontend API client for NightWise Phase 3 Community Safety Reports:
 * - POST /api/v1/community-reports: submit and persist a safety report
 * - GET /api/v1/community-reports: list safety reports
 * - GET /api/v1/community-reports/{id}: get safety report by ID
 * - GET /api/v1/community-reports/moderation/reports: list reports with moderation details (auth protected)
 * - PATCH /api/v1/community-reports/{id}/moderation: moderate a safety report (auth protected)
 */

import { apiRequest } from "@/lib/api-client";
import type {
  CommunityReport,
  CommunityReportModeration,
  MapMarker,
  ModerationActionPayload,
  ReportCategory,
  ReportStatus,
} from "@/types";

export interface CreateCommunityReportPayload {
  category: ReportCategory | string;
  description: string;
  title?: string | null | undefined;
  area?: string | null | undefined;
  location_label?: string | null | undefined;
  lat?: number | null | undefined;
  lng?: number | null | undefined;
  reporter_label?: string | null | undefined;
}

export interface ListCommunityReportsOptions {
  category?: string | null | undefined;
  status?: string | null | undefined;
  includeDemo?: boolean | undefined;
}

export const DEFAULT_DEV_MODERATOR_KEY = "nightwise-dev-moderator-2026";

export async function createCommunityReport(
  payload: CreateCommunityReportPayload,
): Promise<CommunityReport> {
  return apiRequest<CommunityReport>("POST", "/api/v1/community-reports", payload);
}

export async function fetchCommunityReports(
  options?: ListCommunityReportsOptions,
): Promise<CommunityReport[]> {
  const params = new URLSearchParams();
  if (options?.category && options.category !== "all") {
    params.set("category", options.category);
  }
  if (options?.status && options.status !== "all") {
    params.set("status", options.status);
  }
  if (options?.includeDemo !== undefined) {
    params.set("include_demo", String(options.includeDemo));
  } else {
    params.set("include_demo", "true");
  }

  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<CommunityReport[]>("GET", `/api/v1/community-reports${query}`);
}

export async function fetchCommunityReportById(
  id: number | string,
): Promise<CommunityReport> {
  return apiRequest<CommunityReport>("GET", `/api/v1/community-reports/${id}`);
}

export interface ListModerationReportsOptions {
  status?: string | null | undefined;
  category?: string | null | undefined;
  includeDemo?: boolean | undefined;
  moderatorKey?: string | undefined;
}

export async function fetchModerationReports(
  options?: ListModerationReportsOptions,
): Promise<CommunityReportModeration[]> {
  const params = new URLSearchParams();
  if (options?.category && options.category !== "all") {
    params.set("category", options.category);
  }
  if (options?.status && options.status !== "all") {
    params.set("status", options.status);
  }
  if (options?.includeDemo !== undefined) {
    params.set("include_demo", String(options.includeDemo));
  } else {
    params.set("include_demo", "true");
  }

  const key = options?.moderatorKey || DEFAULT_DEV_MODERATOR_KEY;
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<CommunityReportModeration[]>(
    "GET",
    `/api/v1/community-reports/moderation/reports${query}`,
    undefined,
    { "X-Moderator-Key": key },
  );
}

export async function moderateReport(
  reportId: number | string,
  payload: ModerationActionPayload,
  moderatorKey?: string,
): Promise<CommunityReportModeration> {
  const key = moderatorKey || DEFAULT_DEV_MODERATOR_KEY;
  return apiRequest<CommunityReportModeration>(
    "PATCH",
    `/api/v1/community-reports/${reportId}/moderation`,
    payload,
    { "X-Moderator-Key": key },
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  harassment: "#e060a8",
  "poor-lighting": "#f5a623",
  "unsafe-area": "#8b5cf6",
  "suspicious-activity": "#f97316",
  stalking: "#ef4444",
  transport: "#3b82f6",
  other: "#64748b",
};

export function formatReportTime(raw?: string | null): string {
  if (!raw) return "Recently";
  if (!raw.includes("T")) return raw;
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return raw;
  }
}

export function formatReportRecency(raw?: string | null): string {
  if (!raw) return "Recent observation";
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return "Recent observation";
    const now = Date.now();
    const diffMs = now - d.getTime();
    if (diffMs < 0) return "Just now";
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return "Observed recently (< 1h ago)";
    if (diffHours < 24) return `Observed ${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Observed yesterday";
    if (diffDays < 7) return `Observed ${diffDays}d ago`;
    return `Observed on ${d.toLocaleDateString([], { month: "short", day: "numeric" })}`;
  } catch {
    return "Recent observation";
  }
}

export interface StatusMeta {
  label: string;
  badgeText: string;
  badgeClass: string;
  color: string;
  bg: string;
  border: string;
  explanation: string;
  tone: "warning" | "primary" | "success" | "destructive";
}

export const REPORT_STATUS_METADATA: Record<string, StatusMeta> = {
  unverified: {
    label: "Community observation — unverified",
    badgeText: "Community observation — unverified",
    badgeClass: "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    color: "#b45309",
    bg: "#fef3c7",
    border: "#fde68a",
    explanation: "Submitted by community member. Awaiting review; not confirmed by authorities.",
    tone: "warning",
  },
  under_review: {
    label: "Under review",
    badgeText: "Under review",
    badgeClass: "border-sky-500/50 bg-sky-500/10 text-sky-600 dark:text-sky-400",
    color: "#0284c7",
    bg: "#e0f2fe",
    border: "#bae6fd",
    explanation: "Currently under review by community moderators.",
    tone: "primary",
  },
  pending: {
    label: "Under review",
    badgeText: "Under review",
    badgeClass: "border-sky-500/50 bg-sky-500/10 text-sky-600 dark:text-sky-400",
    color: "#0284c7",
    bg: "#e0f2fe",
    border: "#bae6fd",
    explanation: "Currently under review by community moderators.",
    tone: "primary",
  },
  verified: {
    label: "Reviewed by community moderators",
    badgeText: "Reviewed by community moderators",
    badgeClass: "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    color: "#047857",
    bg: "#d1fae5",
    border: "#a7f3d0",
    explanation: "Reviewed and approved by community moderators. Not independent confirmation by law enforcement or emergency services.",
    tone: "success",
  },
  rejected: {
    label: "Rejected / unconfirmed",
    badgeText: "Rejected by moderation",
    badgeClass: "border-destructive/40 bg-destructive/10 text-destructive",
    color: "#b91c1c",
    bg: "#fee2e2",
    border: "#fecaca",
    explanation: "Reviewed and assessed as unsupported or outside reporting guidelines.",
    tone: "destructive",
  },
  resolved: {
    label: "Reported condition marked resolved",
    badgeText: "Reported condition marked resolved",
    badgeClass: "border-slate-500/40 bg-slate-500/10 text-slate-600 dark:text-slate-400",
    color: "#475569",
    bg: "#f1f5f9",
    border: "#cbd5e1",
    explanation: "Reported condition marked resolved, without deleting historical information.",
    tone: "primary",
  },
  flagged: {
    label: "Flagged for moderator attention",
    badgeText: "Flagged for review",
    badgeClass: "border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    color: "#b45309",
    bg: "#fef3c7",
    border: "#fde68a",
    explanation: "Flagged by community members for moderator attention.",
    tone: "warning",
  },
};

export function getStatusMeta(status?: string | null): StatusMeta {
  const clean = (status || "unverified").toLowerCase();
  return (
    REPORT_STATUS_METADATA[clean] ?? {
      label: clean.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      badgeText: clean,
      badgeClass: "border-muted bg-muted text-foreground",
      color: "#6b7280",
      bg: "#f3f4f6",
      border: "#e5e7eb",
      explanation: "Community safety observation record.",
      tone: "primary" as const,
    }
  );
}

export function createReportPopupHtml(r: CommunityReport): string {
  const categoryKey = String(r.category || "other");
  const categoryLabel = categoryKey.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const categoryColor = CATEGORY_COLORS[categoryKey] ?? "#64748b";
  const isDemo = Boolean(r.is_demo);
  const statusMeta = getStatusMeta(r.status);

  const statusBadge = `<span style="display:inline-block;padding:3px 8px;font-size:10px;font-weight:600;color:${statusMeta.color};background:${statusMeta.bg};border:1px solid ${statusMeta.border};border-radius:9999px">${statusMeta.badgeText}</span>`;

  const provenanceBadge = isDemo
    ? `<span style="display:inline-block;padding:3px 8px;font-size:10px;font-weight:600;color:#4b5563;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:9999px">Demo sample</span>`
    : `<span style="display:inline-block;padding:3px 8px;font-size:10px;font-weight:600;color:#6d28d9;background:#ede9fe;border:1px solid #ddd6fe;border-radius:9999px">Community report</span>`;

  const timeFormatted = formatReportTime(r.reported_at || r.reportedAt || r.created_at);
  const recency = formatReportRecency(r.reported_at || r.reportedAt || r.created_at);
  const locationLabel = r.area || r.location_label || "Location coordinates only";

  const escapeHtml = (str: string) =>
    str.replace(/[&<>'"]/g, (tag) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[tag] || tag));

  const safeTitle = escapeHtml(r.title || "Community report");
  const safeDesc = escapeHtml(r.description || "");
  const safeLocation = escapeHtml(locationLabel);

  return `
    <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.4;padding:2px;max-width:275px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${categoryColor};flex-shrink:0"></span>
        <span style="font-size:11px;font-weight:700;color:#1f2937;text-transform:uppercase;letter-spacing:0.02em">${escapeHtml(categoryLabel)}</span>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
        ${provenanceBadge}
        ${statusBadge}
      </div>

      <div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:4px;word-break:break-word">
        ${safeTitle}
      </div>

      <div style="font-size:11.5px;color:#4b5563;margin-bottom:8px;line-height:1.45;word-break:break-word">
        ${safeDesc}
      </div>

      <div style="font-size:10.5px;color:#475569;margin-bottom:8px;background:#f8fafc;padding:5px 8px;border-radius:6px;border:1px solid #e2e8f0;line-height:1.35">
        <strong>Trust & Review:</strong> ${escapeHtml(statusMeta.explanation)}
      </div>

      <div style="font-size:11px;color:#6b7280;display:flex;flex-direction:column;gap:2px;border-top:1px solid #f3f4f6;padding-top:6px;margin-bottom:6px">
        <div><strong>Location:</strong> ${safeLocation}</div>
        <div><strong>Reported:</strong> ${escapeHtml(timeFormatted)} <span style="color:#9ca3af">(${escapeHtml(recency)})</span></div>
        ${r.reviewed_at ? `<div><strong>Moderated:</strong> ${escapeHtml(formatReportTime(r.reviewed_at))}</div>` : ""}
      </div>

      <div style="font-size:10px;color:#9ca3af;font-style:italic">
        ${isDemo ? "Demonstration record for prototype evaluation." : "User-submitted community observation · not official police or authority confirmation."}
      </div>
    </div>
  `;
}

export function partitionReportsByCoordinates(reports: CommunityReport[]): {
  mapped: CommunityReport[];
  unmapped: CommunityReport[];
} {
  const mapped: CommunityReport[] = [];
  const unmapped: CommunityReport[] = [];
  for (const r of reports) {
    if (
      typeof r.lat === "number" &&
      typeof r.lng === "number" &&
      !isNaN(r.lat) &&
      !isNaN(r.lng) &&
      (r.lat !== 0 || r.lng !== 0)
    ) {
      mapped.push(r);
    } else {
      unmapped.push(r);
    }
  }
  return { mapped, unmapped };
}

export function buildCommunityReportMarkers(
  reports: CommunityReport[],
  onSelect?: (id: number | string) => void,
): MapMarker[] {
  return reports
    .filter(
      (r) =>
        typeof r.lat === "number" &&
        typeof r.lng === "number" &&
        !isNaN(r.lat) &&
        !isNaN(r.lng) &&
        (r.lat !== 0 || r.lng !== 0),
    )
    .map((r) => {
      const isDemo = Boolean(r.is_demo);
      const statusMeta = getStatusMeta(r.status);
      const tone = statusMeta.tone;
      const markerColor = CATEGORY_COLORS[r.category as ReportCategory] ?? "#64748b";

      return {
        lat: r.lat as number,
        lng: r.lng as number,
        label: `${r.title || "Community report"} · ${statusMeta.label}`,
        subLabel: `${r.area || r.location_label || "Area"} · ${isDemo ? "Demo sample" : "Community report"} · ${formatReportRecency(r.reported_at || r.reportedAt || r.created_at)}`,
        tone,
        isDemo,
        customColor: markerColor,
        popupHtml: createReportPopupHtml(r),
        id: r.id,
        onClick: onSelect ? () => onSelect(r.id) : undefined,
      };
    });
}
