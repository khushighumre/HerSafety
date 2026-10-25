import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSafetyData } from "@/api/safety-data";

describe("fetchSafetyData client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches all safety data without filter parameter", async () => {
    const mockResponse = {
      records: [
        {
          id: "demo-1",
          location: "MG Road Metro",
          latitude: 12.9756,
          longitude: 77.6068,
          signal_type: "public_transport",
          description: "Simulated transit stop",
          source: "NightWise Synthetic Demo Dataset (Not Verified)",
          status: "simulated_demo",
          is_demo: true,
        },
      ],
      total: 1,
      signal_type: null,
      disclaimer: "DEMO DATA — NOT VERIFIED",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });

    const result = await fetchSafetyData();
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.id).toBe("demo-1");
    expect(result.disclaimer).toContain("DEMO DATA — NOT VERIFIED");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/safety-data$/),
      expect.any(Object),
    );
  });

  it("passes signal_type filter as query parameter", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ records: [], total: 0, signal_type: "lighting", disclaimer: "DEMO DATA" }),
    });

    await fetchSafetyData("lighting");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/safety-data\?signal_type=lighting$/),
      expect.any(Object),
    );
  });
});
