import type { GeographicEvidence, DemoSafetyContext } from "@/api/routes";

export type TransportMode = "walk" | "car" | "bike";

export type SafetyLevel = "high" | "medium" | "limited";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteGap {
  from: string;
  to: string;
  note: string;
}

export interface RouteOption {
  id: string;
  label: string;
  tone: SafetyLevel;
  distanceKm: number;
  durationMin: number;
  detourPct: number;
  /** 0-100, higher = safer for night activity (demo heuristic, not verified data) */
  nightScore: number;
  dataCoveragePct: number;
  freshnessHours: number;
  gaps: RouteGap[];
  notes: string[];
  coords: [number, number][];
  evidence?: GeographicEvidence | null | undefined;
  demo_context?: DemoSafetyContext | null | undefined;
}



export interface TrustedContact {
  id: string;
  name: string;
  relation: string;
  phone: string;
  initials: string;
  isPrimary: boolean;
  receivesJourneys: boolean;
}

export type ReportCategory =
  | "harassment"
  | "poor-lighting"
  | "unsafe-area"
  | "suspicious-activity"
  | "stalking"
  | "transport"
  | "other";

export type ReportStatus =
  | "unverified"
  | "under_review"
  | "verified"
  | "rejected"
  | "resolved"
  | "pending"
  | "flagged"
  | string;

export interface CommunityReport {
  id: string | number;
  category: ReportCategory;
  title: string;
  description: string;
  area: string;
  location_label?: string | null | undefined;
  lat: number;
  lng: number;
  reportedAt?: string | undefined;
  reported_at?: string | undefined;
  createdAt?: string | undefined;
  created_at?: string | undefined;
  reviewed_at?: string | null | undefined;
  reviewed_by?: string | null | undefined;
  status: ReportStatus;
  verifications: number;
  reporter?: string | undefined;
  reporter_label?: string | undefined;
  is_demo?: boolean | undefined;
}

export interface CommunityReportModeration extends CommunityReport {
  moderator_notes?: string | null | undefined;
}

export interface ModerationActionPayload {
  status: ReportStatus;
  moderator_note?: string | undefined;
  moderator_name?: string | undefined;
}

export interface EvidenceItem {
  id: string;
  name: string;
  type: "image" | "audio" | "document" | "screenshot";
  sizeKb: number;
  sha256: string;
  addedAt: string;
  hashVerified: boolean;
}

export interface Incident {
  id: string;
  reference: string;
  title: string;
  category: string;
  date: string;
  severity: "low" | "medium" | "high";
  status: "draft" | "open" | "archived";
  summary: string;
  evidence: EvidenceItem[];
}

export interface DigitalThreatCategory {
  id: string;
  label: string;
  icon: string;
  description: string;
  recommendedActions: string[];
}

export interface SafetyTip {
  id: string;
  title: string;
  text: string;
  icon: string;
}

export interface ActivityItem {
  id: string;
  time: string;
  title: string;
  detail: string;
  kind: "journey" | "report" | "incident" | "circle" | "checkup";
}

export interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  time: string;
  unread: boolean;
  kind: "info" | "warning" | "success";
}

export interface ResourceItem {
  id: string;
  name: string;
  contact: string;
  region: string;
  description: string;
  tag: "emergency" | "support" | "cyber" | "legal";
  url?: string;
}

export interface PrivacyCheckItem {
  id: string;
  category: "Location sharing" | "Account security" | "App permissions" | "Evidence retention";
  title: string;
  detail: string;
  weight: number;
}

export interface ShareLink {
  id: string;
  label: string;
  recipients: string[];
  createdAt: string;
  expiresAt: string;
  revoked: boolean;
  views: number;
}

export interface MapMarker extends LatLng {
  label?: string | undefined;
  tone?: ("primary" | "pink" | "warning" | "destructive" | "success") | undefined;
  isDemo?: boolean | undefined;
  subLabel?: string | undefined;
  customColor?: string | undefined;
  popupHtml?: string | undefined;
  id?: (string | number) | undefined;
  onClick?: (() => void) | undefined;
}

export interface MapPolyline {
  coords: [number, number][];
  color: string;
  weight?: number;
  dashed?: boolean;
  opacity?: number;
}

export interface MapCircle extends LatLng {
  radiusM: number;
  color: string;
}
