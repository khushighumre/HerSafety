import type {
  ActivityItem,
  CommunityReport,
  DigitalThreatCategory,
  Incident,
  NotificationItem,
  PrivacyCheckItem,
  ReportCategory,
  ResourceItem,
  RouteOption,
  SafetyTip,
  ShareLink,
  TrustedContact,
} from "@/types";

/** All data in this file is clearly-labelled demo data for the hackathon build.
 *  Nothing here represents verified real-world safety information. */

export const DEMO_USER = {
  name: "Aisha",
  fullName: "Aisha Verma",
  initials: "AV",
  email: "aisha@demo.hersafety",
  city: "Bengaluru (demo)",
};

export const DEMO_LOCATIONS = [
  { name: "MG Road Metro", lat: 12.9756, lng: 77.6068 },
  { name: "Indiranagar 100ft Rd", lat: 12.9719, lng: 77.6412 },
  { name: "Koramangala 5th Block", lat: 12.9345, lng: 77.622 },
  { name: "HSR Layout Sector 2", lat: 12.9121, lng: 77.6446 },
  { name: "Cubbon Park", lat: 12.9763, lng: 77.5929 },
  { name: "Majestic Bus Stand", lat: 12.9774, lng: 77.5726 },
  { name: "Jayanagar 4th Block", lat: 12.925, lng: 77.5938 },
  { name: "Whitefield ITPL", lat: 12.9857, lng: 77.7368 },
];

const A: [number, number] = [12.9756, 77.6068]; // MG Road
const B: [number, number] = [12.9352, 77.6245]; // Koramangala

export const ROUTE_OPTIONS: RouteOption[] = [
  {
    id: "fastest",
    label: "Fastest",
    tone: "medium",
    distanceKm: 8.4,
    durationMin: 22,
    detourPct: 0,
    nightScore: 42,
    dataCoveragePct: 88,
    freshnessHours: 5,
    gaps: [
      { from: "11:40 PM", to: "1:15 AM", note: "Shops closed along 2 stretches" },
    ],
    notes: [
      "Quickest path, but passes two stretches with low foot traffic after 11 PM.",
      "1.2 km runs through an area with no community reports in the last 30 days (limited data).",
    ],
    coords: [A, [12.968, 77.616], [12.955, 77.621], [12.944, 77.623], B],
  },
  {
    id: "balanced",
    label: "Balanced",
    tone: "high",
    distanceKm: 9.1,
    durationMin: 26,
    detourPct: 8,
    nightScore: 68,
    dataCoveragePct: 94,
    freshnessHours: 2,
    gaps: [],
    notes: [
      "Small detour to stay on well-lit main roads with consistent evening activity.",
      "Strong demo data coverage from community reports in the last 7 days.",
    ],
    coords: [A, [12.97, 77.612], [12.96, 77.619], [12.948, 77.627], [12.94, 77.626], B],
  },
  {
    id: "safest",
    label: "Safest (Limited Data)",
    tone: "limited",
    distanceKm: 10.6,
    durationMin: 31,
    detourPct: 26,
    nightScore: 81,
    dataCoveragePct: 61,
    freshnessHours: 14,
    gaps: [
      { from: "12:00 AM", to: "5:30 AM", note: "No activity data for 3.1 km of this route" },
      { from: "Old Airport Rd service lane", to: "DHS Rd", note: "Sparse lighting data" },
    ],
    notes: [
      "Avoids every flagged stretch in the demo dataset, but 3.1 km has no recent community reports — treat the score as indicative only.",
      "Data freshness is low; verify conditions before relying on this route late at night.",
    ],
    coords: [A, [12.974, 77.6], [12.966, 77.594], [12.952, 77.598], [12.938, 77.607], [12.933, 77.617], B],
  },
];

export const TRUSTED_CONTACTS: TrustedContact[] = [
  { id: "c1", name: "Meera Iyer", relation: "Sister", phone: "+91 98••• ••042", initials: "MI", isPrimary: true, receivesJourneys: true },
  { id: "c2", name: "Dad (Rajesh)", relation: "Family", phone: "+91 97••• ••118", initials: "RV", isPrimary: false, receivesJourneys: true },
  { id: "c3", name: "Priya Nair", relation: "Roommate", phone: "+91 96••• ••776", initials: "PN", isPrimary: false, receivesJourneys: true },
  { id: "c4", name: "Dr. Kavya", relation: "Friend", phone: "+91 90••• ••231", initials: "DK", isPrimary: false, receivesJourneys: false },
];

export const REPORT_CATEGORIES: { id: ReportCategory; label: string }[] = [
  { id: "harassment", label: "Street harassment" },
  { id: "poor-lighting", label: "Poor lighting" },
  { id: "unsafe-area", label: "Feels unsafe" },
  { id: "stalking", label: "Being followed" },
  { id: "transport", label: "Transport concern" },
  { id: "other", label: "Other" },
];

export const CATEGORY_COLORS: Record<ReportCategory, string> = {
  harassment: "#e060a8",
  "poor-lighting": "#f5a623",
  "unsafe-area": "#8b5cf6",
  stalking: "#ef4444",
  transport: "#3b82f6",
  other: "#64748b",
};

export const COMMUNITY_REPORTS: CommunityReport[] = [
  { id: "r1", category: "poor-lighting", title: "Streetlights out on service road", description: "Three consecutive poles not working near the metro exit.", area: "Indiranagar 100ft Rd", lat: 12.9719, lng: 77.6412, reportedAt: "2 hours ago", status: "verified", verifications: 12, reporter: "Demo user 1" },
  { id: "r2", category: "harassment", title: "Repeated comments near underpass", description: "Group loitering by the underpass, several incidents this week.", area: "Koramangala 5th Block", lat: 12.9345, lng: 77.622, reportedAt: "Yesterday", status: "verified", verifications: 8, reporter: "Demo user 2" },
  { id: "r3", category: "unsafe-area", title: "Isolated stretch after 10 PM", description: "No shops or people after 10 PM between the two junctions.", area: "HSR Sector 2", lat: 12.9121, lng: 77.6446, reportedAt: "2 days ago", status: "pending", verifications: 2, reporter: "Demo user 3" },
  { id: "r4", category: "transport", title: "Auto drivers refusing meter", description: "Drivers demand flat fare at night from this stand.", area: "Majestic Bus Stand", lat: 12.9774, lng: 77.5726, reportedAt: "3 days ago", status: "verified", verifications: 21, reporter: "Demo user 4" },
  { id: "r5", category: "stalking", title: "Same car following walkers", description: "Reported by two people independently on adjacent evenings.", area: "Cubbon Park south gate", lat: 12.9763, lng: 77.5929, reportedAt: "4 days ago", status: "flagged", verifications: 5, reporter: "Demo user 5" },
  { id: "r6", category: "poor-lighting", title: "Dark pedestrian subway", description: "Subway lighting partially broken, feels unsafe after dark.", area: "Jayanagar 4th Block", lat: 12.925, lng: 77.5938, reportedAt: "5 days ago", status: "verified", verifications: 15, reporter: "Demo user 6" },
  { id: "r7", category: "other", title: "Construction blocking footpath", description: "Forces pedestrians onto the main road with heavy traffic.", area: "MG Road", lat: 12.9756, lng: 77.6068, reportedAt: "6 days ago", status: "pending", verifications: 3, reporter: "Demo user 7" },
];

export const INCIDENTS: Incident[] = [
  {
    id: "i1",
    reference: "HS-2026-0142",
    title: "Repeated calls from unknown number",
    category: "Digital harassment",
    date: "Oct 21, 2026",
    severity: "medium",
    status: "open",
    summary: "Twelve missed calls and abusive texts over three evenings from an unlisted number.",
    evidence: [
      { id: "e1", name: "call-log-oct19.png", type: "screenshot", sizeKb: 412, sha256: "9f2c4a…e71b (demo)", addedAt: "Oct 21, 9:12 AM", hashVerified: true },
      { id: "e2", name: "texts-voicemail.m4a", type: "audio", sizeKb: 1840, sha256: "b81d77…04ac (demo)", addedAt: "Oct 21, 9:14 AM", hashVerified: true },
    ],
  },
  {
    id: "i2",
    reference: "HS-2026-0138",
    title: "Followed on evening walk",
    category: "Physical safety",
    date: "Oct 14, 2026",
    severity: "high",
    status: "open",
    summary: "Unknown person followed for approx. 400 m between the metro station and home.",
    evidence: [
      { id: "e3", name: "route-snapshot.jpg", type: "image", sizeKb: 903, sha256: "33ad0c…9d12 (demo)", addedAt: "Oct 14, 8:40 PM", hashVerified: true },
    ],
  },
  {
    id: "i3",
    reference: "HS-2026-0131",
    title: "Fake profile using my photos",
    category: "Impersonation",
    date: "Oct 09, 2026",
    severity: "medium",
    status: "archived",
    summary: "Duplicate dating-app profile messaging contacts. Reported and removed by the platform.",
    evidence: [
      { id: "e4", name: "fake-profile.pdf", type: "document", sizeKb: 220, sha256: "c4091a…7fa3 (demo)", addedAt: "Oct 09, 11:02 AM", hashVerified: false },
    ],
  },
  {
    id: "i4",
    reference: "HS-2026-0127",
    title: "Phishing link in delivery SMS",
    category: "Phishing",
    date: "Oct 02, 2026",
    severity: "low",
    status: "draft",
    summary: "Fake courier link requesting card details. Not entered; reported to provider.",
    evidence: [],
  },
];

export const DIGITAL_THREATS: DigitalThreatCategory[] = [
  {
    id: "harassment",
    label: "Online harassment",
    icon: "message-circle-warning",
    description: "Abusive, threatening or unwanted repeated messages on any platform.",
    recommendedActions: [
      "Screenshot everything before blocking (with timestamps visible).",
      "Use platform block + report tools; note the report reference.",
      "Log each incident in the Evidence Vault with a date.",
      "If threats mention meeting or violence, treat as physical risk too.",
    ],
  },
  {
    id: "sextortion",
    label: "Sextortion",
    icon: "shield-alert",
    description: "Threats to share intimate images unless money or more images are provided.",
    recommendedActions: [
      "Do not pay or send anything more — compliance escalates demands.",
      "Stop all contact but keep the evidence; do not delete chats.",
      "Report via the platform and the national cybercrime portal.",
      "Tell one trusted person — you are not at fault and are not alone.",
    ],
  },
  {
    id: "impersonation",
    label: "Impersonation",
    icon: "user-x",
    description: "Fake accounts using your photos, name or details to contact others.",
    recommendedActions: [
      "Report the fake profile with links + screenshots.",
      "Ask friends to report it as well — volume speeds up takedowns.",
      "Tighten profile privacy so fewer photos are downloadable.",
      "Post or send a short note to close contacts warning about the fake.",
    ],
  },
  {
    id: "account",
    label: "Account compromise",
    icon: "key-round",
    description: "Someone has your password, OTPs, or has taken over an account.",
    recommendedActions: [
      "Change the password from a trusted device immediately.",
      "Sign out all sessions and re-enable 2FA with fresh codes.",
      "Check recovery email/phone for tampering.",
      "Warn contacts that messages from your account may be fake.",
    ],
  },
  {
    id: "phishing",
    label: "Phishing & scams",
    icon: "fish",
    description: "Fraudulent links, payment requests, or fake delivery/KYC messages.",
    recommendedActions: [
      "Never enter OTPs or card details from a link you did not start.",
      "Verify with the company via its official app or number.",
      "Report the number to your provider's spam channel.",
      "If money was sent, call the bank's fraud line within minutes.",
    ],
  },
];

export const SAFETY_TIPS: SafetyTip[] = [
  { id: "t1", icon: "smartphone", title: "Share your live trip", text: "Start a journey and pick a trusted contact before any late-night commute." },
  { id: "t2", icon: "battery-charging", title: "Keep 20% battery rule", text: "Below 20%, switch to low-power mode and avoid navigation-heavy screens." },
  { id: "t3", icon: "eye-off", title: "Strip photo metadata", text: "Run photos through Photo Cleaner before posting — EXIF reveals your location." },
  { id: "t4", icon: "lock", title: "Two-factor everything", text: "Authenticator apps are safer than SMS codes for your primary accounts." },
  { id: "t5", icon: "footprints", title: "Walk with purpose", text: "Plan your route in advance; distracted phone-walking doubles your risk window." },
  { id: "t6", icon: "bell-ring", title: "Trust your instincts", text: "If a place feels wrong, leave. No explanation owed to anyone." },
];

export const RECENT_ACTIVITY: ActivityItem[] = [
  { id: "a1", time: "Today, 8:12 AM", title: "Journey completed", detail: "MG Road → Indiranagar · Meera was notified", kind: "journey" },
  { id: "a2", time: "Yesterday", title: "Report verified", detail: "Your lighting report on 100ft Rd got 12 confirmations", kind: "report" },
  { id: "a3", time: "Oct 21", title: "Evidence added", detail: "2 files hashed into incident HS-2026-0142", kind: "incident" },
  { id: "a4", time: "Oct 20", title: "Circle updated", detail: "Priya Nair added to journey recipients", kind: "circle" },
  { id: "a5", time: "Oct 18", title: "Privacy checkup", detail: "Score improved to 78/100 after 2FA on email", kind: "checkup" },
];

export const NOTIFICATIONS: NotificationItem[] = [
  { id: "n1", title: "Check-in timer running", detail: "Active journey ends in 18 min — you'll get a check-in prompt.", time: "now", unread: true, kind: "info" },
  { id: "n2", title: "Night route advisory (demo)", detail: "Balanced route has updated night activity data.", time: "2 h", unread: true, kind: "warning" },
  { id: "n3", title: "Meera confirmed check-in", detail: "She acknowledged your last shared journey.", time: "5 h", unread: false, kind: "success" },
  { id: "n4", title: "Share link expiring", detail: "Priya's temporary link expires tomorrow 6 PM.", time: "1 d", unread: false, kind: "warning" },
];

export const RESOURCES: ResourceItem[] = [
  { id: "res1", name: "Emergency Services", contact: "112", region: "India (real)", description: "National emergency number — police, fire, medical.", tag: "emergency" },
  { id: "res2", name: "Women's Helpline", contact: "1091", region: "India (real)", description: "24×7 helpline for women in distress.", tag: "support" },
  { id: "res3", name: "Domestic Violence Helpline", contact: "181", region: "India (real)", description: "Support, shelter and legal guidance.", tag: "support" },
  { id: "res4", name: "National Cyber Crime Portal", contact: "cybercrime.gov.in", region: "India (real)", description: "Report online harassment, sextortion, fraud.", tag: "cyber", url: "https://cybercrime.gov.in" },
  { id: "res5", name: "Cyber Crime Helpline", contact: "1930", region: "India (real)", description: "Freeze fraudulent transactions fast.", tag: "cyber" },
  { id: "res6", name: "Legal Aid Clinic (demo)", contact: "In-app directory", region: "Demo", description: "Simulated directory of women's legal aid organisations.", tag: "legal" },
];

export const EDUCATION_ITEMS = [
  { id: "ed1", title: "Digital consent basics", minutes: 5, summary: "What to do when intimate images are threatened — step-by-step." },
  { id: "ed2", title: "Reading your surroundings", minutes: 7, summary: "Situational awareness habits for commutes and walks." },
  { id: "ed3", title: "Locking down your phone", minutes: 9, summary: "Permissions, tracking apps, and location-sharing audits." },
  { id: "ed4", title: "Documenting incidents", minutes: 6, summary: "How good evidence improves outcomes — screenshots, logs, hashes." },
];

export const PRIVACY_CHECKLIST: PrivacyCheckItem[] = [
  { id: "p1", category: "Location sharing", title: "Review phone-level location sharing", detail: "Check Google/Apple location sharing lists; remove anyone you don't recognise.", weight: 10 },
  { id: "p2", category: "Location sharing", title: "Turn off camera geotagging", detail: "Disable precise location in camera settings; Photo Cleaner strips leftover EXIF.", weight: 8 },
  { id: "p3", category: "Location sharing", title: "Audit social media location tags", detail: "Remove home/office tagged places from older posts.", weight: 6 },
  { id: "p4", category: "Account security", title: "2FA on primary email", detail: "Email is the master key — protect it with an authenticator app, not SMS.", weight: 12 },
  { id: "p5", category: "Account security", title: "Unique passwords + manager", detail: "A password manager with a unique password per account.", weight: 10 },
  { id: "p6", category: "Account security", title: "Review active sessions", detail: "Sign out devices you don't own on all major accounts.", weight: 6 },
  { id: "p7", category: "App permissions", title: "Apps with 'always' location", detail: "Downgrade to 'while using' except maps and Her Safety.", weight: 10 },
  { id: "p8", category: "App permissions", title: "Revoke unused app access", detail: "Uninstall or sign out apps you haven't opened in 3 months.", weight: 5 },
  { id: "p9", category: "App permissions", title: "Microphone & contacts audit", detail: "Check which apps can read contacts or record audio.", weight: 5 },
  { id: "p10", category: "Evidence retention", title: "Know your export plan", detail: "Decide in advance how long to keep evidence and how to export it.", weight: 8 },
  { id: "p11", category: "Evidence retention", title: "Encrypt sensitive backups", detail: "Store evidence in encrypted storage, never plain camera roll only.", weight: 8 },
  { id: "p12", category: "Evidence retention", title: "Trusted person knows the vault", detail: "One person in your circle knows how to access your exports if you can't.", weight: 6 },
];

export const DEMO_SHARE_LINKS: ShareLink[] = [
  { id: "s1", label: "Late-night commute", recipients: ["Meera Iyer"], createdAt: "Oct 24, 7:30 PM", expiresAt: "Oct 24, 11:30 PM", revoked: false, views: 3 },
  { id: "s2", label: "Trip home from event", recipients: ["Priya Nair", "Dad (Rajesh)"], createdAt: "Oct 22, 9:00 PM", expiresAt: "Oct 23, 1:00 AM", revoked: true, views: 7 },
];

export const JOURNEY_STEPS = [
  { label: "Departed", time: "8:02 PM", done: true },
  { label: "Checkpoint · 100ft Rd", time: "8:11 PM", done: true },
  { label: "Checkpoint · Domlur flyover", time: "8:19 PM", done: false, current: true },
  { label: "Arrive Indiranagar", time: "8:28 PM", done: false },
];

export const MODERATOR_QUEUE = COMMUNITY_REPORTS.filter((r) => r.status !== "verified").concat([
  { id: "r8", category: "harassment", title: "Unverified claim near metro", description: "Single report, no corroborating confirmations yet.", area: "MG Road", lat: 12.976, lng: 77.607, reportedAt: "6 hours ago", status: "pending", verifications: 0, reporter: "Demo user 8" },
]);
