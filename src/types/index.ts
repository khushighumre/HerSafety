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
  | "stalking"
  | "transport"
  | "other";

export interface CommunityReport {
  id: string;
  category: ReportCategory;
  title: string;
  description: string;
  area: string;
  lat: number;
  lng: number;
  reportedAt: string;
  status: "pending" | "verified" | "flagged";
  verifications: number;
  reporter: string;
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
  label?: string;
  tone?: "primary" | "pink" | "warning" | "destructive" | "success";
}

export interface MapPolyline {
  coords: [number, number][];
  color: string;
  weight?: number;
  dashed?: boolean;
}

export interface MapCircle extends LatLng {
  radiusM: number;
  color: string;
}
