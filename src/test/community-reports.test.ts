import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createCommunityReport,
  fetchCommunityReports,
  fetchCommunityReportById,
  fetchModerationReports,
  moderateReport,
  buildCommunityReportMarkers,
  partitionReportsByCoordinates,
  createReportPopupHtml,
  formatReportTime,
  formatReportRecency,
  getStatusMeta,
  DEFAULT_DEV_MODERATOR_KEY,
} from "@/api/community-reports";
import { CATEGORY_COLORS, REPORT_CATEGORIES } from "@/data/mock";
import type { CommunityReport, CommunityReportModeration } from "@/types";

describe("community reports API client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("submits a community report with POST /api/v1/community-reports", async () => {
    const mockReport: CommunityReport = {
      id: 1,
      category: "poor-lighting",
      title: "Broken streetlight",
      description: "Lights broken near the entrance.",
      area: "Indiranagar 100ft Rd",
      lat: 12.9719,
      lng: 77.6412,
      status: "unverified",
      verifications: 0,
      reporter: "Anonymous",
      reporter_label: "anonymous",
      is_demo: false,
      reported_at: "2026-10-25T14:00:00Z",
      created_at: "2026-10-25T14:00:00Z",
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => mockReport,
    } as Response);

    const result = await createCommunityReport({
      category: "poor-lighting",
      title: "Broken streetlight",
      description: "Lights broken near the entrance.",
      area: "Indiranagar 100ft Rd",
      lat: 12.9719,
      lng: 77.6412,
    });

    expect(result.id).toBe(1);
    expect(result.status).toBe("unverified");
    expect(result.is_demo).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/community-reports"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          category: "poor-lighting",
          title: "Broken streetlight",
          description: "Lights broken near the entrance.",
          area: "Indiranagar 100ft Rd",
          lat: 12.9719,
          lng: 77.6412,
        }),
      }),
    );
  });

  it("fetches community reports with query parameters", async () => {
    const mockReports: CommunityReport[] = [
      {
        id: 2,
        category: "unsafe-area",
        title: "Dimly lit passage",
        description: "Passage is isolated at night.",
        area: "Koramangala",
        lat: 12.9345,
        lng: 77.622,
        status: "unverified",
        verifications: 0,
        reporter: "Anonymous",
        is_demo: false,
      },
      {
        id: "demo-r1",
        category: "poor-lighting",
        title: "Demo streetlight report",
        description: "Demo observation.",
        area: "Indiranagar",
        lat: 12.9719,
        lng: 77.6412,
        status: "verified",
        verifications: 10,
        reporter: "Demo user 1",
        is_demo: true,
      },
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => mockReports,
    } as Response);

    const result = await fetchCommunityReports({
      category: "unsafe-area",
      status: "unverified",
      includeDemo: true,
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.status).toBe("unverified");
    expect(result[0]?.is_demo).toBe(false);
    expect(result[1]?.is_demo).toBe(true);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/community-reports\?category=unsafe-area&status=unverified&include_demo=true/),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("fetches a single report by ID", async () => {
    const mockReport: CommunityReport = {
      id: 42,
      category: "transport",
      title: "Bus stop issue",
      description: "Buses not stopping after 10 PM.",
      area: "Majestic",
      lat: 12.9774,
      lng: 77.5726,
      status: "unverified",
      verifications: 0,
      reporter: "Anonymous",
      is_demo: false,
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => mockReport,
    } as Response);

    const result = await fetchCommunityReportById(42);
    expect(result.id).toBe(42);
    expect(result.category).toBe("transport");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/community-reports/42"),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("handles empty report list gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => [],
    } as Response);

    const result = await fetchCommunityReports();
    expect(result).toEqual([]);
  });

  it("handles server error responses properly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 422,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ detail: "Description must be at least 5 characters long." }),
    } as Response);

    await expect(
      createCommunityReport({
        category: "poor-lighting",
        description: "Bad",
      }),
    ).rejects.toThrow();
  });

  it("handles 500 internal server errors gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ detail: "Database temporarily unavailable." }),
    } as Response);

    await expect(fetchCommunityReports()).rejects.toThrow();
  });
});

describe("moderation API client methods", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches moderation queue reports with X-Moderator-Key header", async () => {
    const mockModReports: CommunityReportModeration[] = [
      {
        id: 10,
        category: "poor-lighting",
        title: "Pothole near corner",
        description: "Dangerous pothole in the dark.",
        area: "Koramangala",
        lat: 12.93,
        lng: 77.62,
        status: "under_review",
        verifications: 1,
        is_demo: false,
        moderator_notes: "Assigning local inspector",
      },
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => mockModReports,
    } as Response);

    const result = await fetchModerationReports({
      status: "under_review",
      moderatorKey: "test-mod-key",
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.moderator_notes).toBe("Assigning local inspector");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/community-reports/moderation/reports?status=under_review&include_demo=true"),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "X-Moderator-Key": "test-mod-key",
        }),
      }),
    );
  });

  it("sends PATCH /api/v1/community-reports/{id}/moderation with payload and auth header", async () => {
    const mockUpdated: CommunityReportModeration = {
      id: 10,
      category: "poor-lighting",
      title: "Pothole near corner",
      description: "Dangerous pothole in the dark.",
      area: "Koramangala",
      lat: 12.93,
      lng: 77.62,
      status: "verified",
      verifications: 1,
      is_demo: false,
      moderator_notes: "Approved after site check",
      reviewed_by: "community-moderator",
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => mockUpdated,
    } as Response);

    const result = await moderateReport(
      10,
      {
        status: "verified",
        moderator_note: "Approved after site check",
        moderator_name: "community-moderator",
      },
      "custom-key",
    );

    expect(result.status).toBe("verified");
    expect(result.moderator_notes).toBe("Approved after site check");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/community-reports/10/moderation"),
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          "X-Moderator-Key": "custom-key",
        }),
        body: JSON.stringify({
          status: "verified",
          moderator_note: "Approved after site check",
          moderator_name: "community-moderator",
        }),
      }),
    );
  });
});

describe("category mapping and report display properties", () => {
  it("includes all required safety report categories", () => {
    const categoryIds = REPORT_CATEGORIES.map((c) => c.id);
    expect(categoryIds).toContain("poor-lighting");
    expect(categoryIds).toContain("unsafe-area");
    expect(categoryIds).toContain("harassment");
    expect(categoryIds).toContain("suspicious-activity");
    expect(categoryIds).toContain("transport");
    expect(categoryIds).toContain("other");
  });

  it("provides valid hex colors for every category", () => {
    for (const cat of REPORT_CATEGORIES) {
      const color = CATEGORY_COLORS[cat.id];
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("community reports map marker and coordinate partitioning", () => {
  const sampleReports: CommunityReport[] = [
    {
      id: 101,
      category: "poor-lighting",
      title: "Dark alleyway near metro",
      description: "Streetlights are completely off.",
      area: "Indiranagar",
      lat: 12.9784,
      lng: 77.6408,
      status: "unverified",
      verifications: 0,
      reporter: "Anonymous",
      is_demo: false,
      created_at: "2026-10-25T12:00:00Z",
    },
    {
      id: 102,
      category: "unsafe-area",
      title: "Desolate stretch behind stadium",
      description: "Needs police presence after 9 PM.",
      area: "Koramangala",
      lat: null as unknown as number,
      lng: null as unknown as number,
      status: "under_review",
      verifications: 0,
      reporter: "Anonymous",
      is_demo: false,
      created_at: "2026-10-25T13:00:00Z",
    },
    {
      id: 103,
      category: "harassment",
      title: "Verbal harassment reported",
      description: "Catcalling observed at bus stop.",
      area: "MG Road",
      lat: 12.9756,
      lng: 77.6067,
      status: "verified",
      verifications: 3,
      reporter: "Demo user",
      is_demo: true,
      created_at: "2026-10-25T14:00:00Z",
    },
    {
      id: 104,
      category: "transport",
      title: "General route concern",
      description: "No late night feeder buses.",
      area: "Hebbal",
      lat: 0,
      lng: 0,
      status: "resolved",
      verifications: 0,
      reporter: "Anonymous",
      is_demo: false,
    },
  ];

  it("partitions reports into mapped and unmapped without inventing locations", () => {
    const { mapped, unmapped } = partitionReportsByCoordinates(sampleReports);

    expect(mapped).toHaveLength(2);
    expect(mapped.map((r) => r.id)).toEqual([101, 103]);

    expect(unmapped).toHaveLength(2);
    expect(unmapped.map((r) => r.id)).toEqual([102, 104]);

    expect(unmapped[0]?.lat).toBeNull();
    expect(unmapped[1]?.lat).toBe(0);
  });

  it("builds map markers only for reports with valid coordinates with correct status labels", () => {
    const selectSpy = vi.fn();
    const markers = buildCommunityReportMarkers(sampleReports, selectSpy);

    expect(markers).toHaveLength(2);

    const m1 = markers[0];
    expect(m1?.lat).toBe(12.9784);
    expect(m1?.lng).toBe(77.6408);
    expect(m1?.label).toContain("Dark alleyway near metro");
    expect(m1?.label).toContain("Community observation — unverified");
    expect(m1?.subLabel).toContain("Indiranagar");
    expect(m1?.subLabel).toContain("Community report");
    expect(m1?.isDemo).toBe(false);
    expect(m1?.tone).toBe("warning");
    expect(m1?.customColor).toBe(CATEGORY_COLORS["poor-lighting"]);
    expect(m1?.popupHtml).toBeDefined();

    const m2 = markers[1];
    expect(m2?.lat).toBe(12.9756);
    expect(m2?.lng).toBe(77.6067);
    expect(m2?.label).toContain("Reviewed by community moderators");
    expect(m2?.isDemo).toBe(true);
    expect(m2?.tone).toBe("success");
    expect(m2?.subLabel).toContain("Demo sample");

    m1?.onClick?.();
    expect(selectSpy).toHaveBeenCalledWith(101);
  });

  it("synchronizes category and status filtering between markers and report list", () => {
    // When filtered by "poor-lighting"
    const lightingOnly = sampleReports.filter((r) => r.category === "poor-lighting");
    const lightingMarkers = buildCommunityReportMarkers(lightingOnly);

    expect(lightingOnly).toHaveLength(1);
    expect(lightingMarkers).toHaveLength(1);
    expect(lightingMarkers[0]?.id).toBe(101);

    // When filtered by status "verified"
    const verifiedOnly = sampleReports.filter((r) => r.status === "verified");
    const verifiedMarkers = buildCommunityReportMarkers(verifiedOnly);

    expect(verifiedOnly).toHaveLength(1);
    expect(verifiedMarkers).toHaveLength(1);
    expect(verifiedMarkers[0]?.id).toBe(103);
  });
});

describe("report popup HTML content, trust indicators, and security", () => {
  it("renders unverified community report popup with warning disclaimer and status explanation", () => {
    const report: CommunityReport = {
      id: 50,
      category: "poor-lighting",
      title: "Broken streetlamp",
      description: "Dark corner near ATM",
      area: "Indiranagar",
      lat: 12.97,
      lng: 77.64,
      status: "unverified",
      verifications: 0,
      reporter: "Anonymous",
      is_demo: false,
      reported_at: "2026-10-25T15:30:00Z",
    };

    const html = createReportPopupHtml(report);

    expect(html).toContain("Community observation — unverified");
    expect(html).toContain("Community report");
    expect(html).toContain("Broken streetlamp");
    expect(html).toContain("Dark corner near ATM");
    expect(html).toContain("Location:</strong> Indiranagar");
    expect(html).toContain("Poor Lighting");
    expect(html).toContain("Awaiting review; not confirmed by authorities");
    expect(html).toContain("not official police or authority confirmation");
    expect(html).not.toContain("Demonstration record");
  });

  it("renders verified demo report popup with demo badge and evaluation notice", () => {
    const report: CommunityReport = {
      id: "demo-99",
      category: "harassment",
      title: "Demo incident",
      description: "Sample description",
      area: "Brigade Rd",
      lat: 12.97,
      lng: 77.60,
      status: "verified",
      verifications: 5,
      reporter: "Demo",
      is_demo: true,
      reported_at: "2026-10-25T10:00:00Z",
    };

    const html = createReportPopupHtml(report);

    expect(html).toContain("Reviewed by community moderators");
    expect(html).toContain("Demo sample");
    expect(html).toContain("Demonstration record for prototype evaluation");
    expect(html).not.toContain("not official police or authority confirmation");
  });

  it("renders resolved report popup with resolved notice", () => {
    const report: CommunityReport = {
      id: 77,
      category: "poor-lighting",
      title: "Repaired streetlight",
      description: "Lights were replaced today.",
      area: "Koramangala",
      lat: 12.93,
      lng: 77.62,
      status: "resolved",
      verifications: 2,
      is_demo: false,
      reported_at: "2026-10-25T10:00:00Z",
    };

    const html = createReportPopupHtml(report);
    expect(html).toContain("Reported condition marked resolved");
    expect(html).toContain("without deleting historical information");
  });

  it("escapes user input to prevent XSS in popup HTML", () => {
    const maliciousReport: CommunityReport = {
      id: 999,
      category: "other",
      title: "<script>alert('xss')</script>",
      description: "<b>Danger</b> & 'quotes'",
      area: "<img src=x onerror=alert(1)>",
      lat: 12.9,
      lng: 77.6,
      status: "unverified",
      verifications: 0,
      reporter: "Anonymous",
      is_demo: false,
    };

    const html = createReportPopupHtml(maliciousReport);

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
    expect(html).toContain("&lt;b&gt;Danger&lt;/b&gt; &amp; &#39;quotes&#39;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("formats ISO timestamps cleanly and formats recency relative time", () => {
    const formatted = formatReportTime("2026-10-25T14:30:00Z");
    expect(formatted).not.toContain("T");
    expect(formatReportTime(null)).toBe("Recently");
    expect(formatReportTime(undefined)).toBe("Recently");

    const recency = formatReportRecency("2026-10-25T14:30:00Z");
    expect(typeof recency).toBe("string");
    expect(formatReportRecency(null)).toBe("Recent observation");
  });

  it("returns correct metadata for all lifecycle statuses", () => {
    expect(getStatusMeta("unverified").label).toBe("Community observation — unverified");
    expect(getStatusMeta("under_review").label).toBe("Under review");
    expect(getStatusMeta("verified").label).toBe("Reviewed by community moderators");
    expect(getStatusMeta("rejected").label).toBe("Rejected / unconfirmed");
    expect(getStatusMeta("resolved").label).toBe("Reported condition marked resolved");
  });
});
