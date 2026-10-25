"""
backend/osm_evidence_provider.py

OpenStreetMap Geographic Evidence Provider.
Queries an Overpass-compatible public endpoint for real, mapped physical infrastructure
within the corridor of returned route polylines.

CRITICAL DISCLAIMER & PRINCIPLES:
- Mapped geographic context is NOT proof of route safety.
- A missing map tag means "not recorded in this dataset", NOT "absent in the real world"
  and NOT "unsafe".
- Only observed, source-backed evidence is returned.
- If external providers are unavailable or time out, an explicit "unavailable"
  or "error" status is returned. No simulated or fabricated scores/timestamps are substituted.
- Upstream usage limits are respected with bounded timeouts, shared corridor queries across
  alternatives, controlled fallback, and failure cooldowns to prevent retry storms.
"""

from __future__ import annotations

import logging
import math
import os
import time
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urlparse

import httpx
from pydantic import BaseModel, Field

logger = logging.getLogger("nightwise.osm_evidence")
logger.setLevel(logging.INFO)

# ---------------------------------------------------------------------------
# Default Configuration (Overrideable via environment variables)
# ---------------------------------------------------------------------------
DEFAULT_OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter"
DEFAULT_OVERPASS_FALLBACK_ENDPOINT = "https://overpass.kumi.systems/api/interpreter"
DEFAULT_TIMEOUT_SEC = 6.0
DEFAULT_CONNECT_TIMEOUT_SEC = 3.0
DEFAULT_FAILURE_COOLDOWN_SEC = 60.0  # Prevent retry storms when upstream is down
DEFAULT_CACHE_TTL_SEC = 1800.0        # 30 minutes
DEFAULT_MAX_CACHE_SIZE = 200
DEFAULT_MAX_BBOX_SPAN = 0.25         # ~25-28 km maximum bounding box dimension
DEFAULT_CORRIDOR_BUFFER_DEG = 0.002  # ~200-220 meters corridor buffer
CORRIDOR_PROXIMITY_METERS = 150.0   # elements within 150m of route polyline

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class FeatureCounts(BaseModel):
    transport_stops: int = 0
    assistance_amenities: int = 0
    street_lamps: int = 0
    lit_path_segments: int = 0
    surveillance_points: int = 0
    road_segments: int = 0


class TagEvidenceSummary(BaseModel):
    amenity_types: dict[str, int] = Field(default_factory=dict)
    transport_types: dict[str, int] = Field(default_factory=dict)
    highway_types: dict[str, int] = Field(default_factory=dict)
    lighting_tags: dict[str, int] = Field(default_factory=dict)
    surveillance_tags: dict[str, int] = Field(default_factory=dict)


class GeographicEvidence(BaseModel):
    source: str = "OpenStreetMap"
    attribution: str = "© OpenStreetMap contributors (ODbL)"
    endpoint: str = ""
    retrieved_at: Optional[str] = None
    status: str = "unavailable"  # "available" | "partial" | "unavailable" | "error"
    counts: FeatureCounts = Field(default_factory=FeatureCounts)
    observed_tags: TagEvidenceSummary = Field(default_factory=TagEvidenceSummary)
    limitations: list[str] = Field(default_factory=list)
    missing_data_notes: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# In-memory TTL Cache
# ---------------------------------------------------------------------------

class CorridorCache:
    """Thread-safe, bounded LRU cache with TTL expiration."""

    def __init__(self, ttl_seconds: float = DEFAULT_CACHE_TTL_SEC, max_size: int = DEFAULT_MAX_CACHE_SIZE):
        self.ttl_seconds = ttl_seconds
        self.max_size = max_size
        self._cache: OrderedDict[str, tuple[float, Any]] = OrderedDict()

    def get(self, key: str) -> Optional[Any]:
        if key not in self._cache:
            return None
        created_at, val = self._cache[key]
        if time.time() - created_at > self.ttl_seconds:
            del self._cache[key]
            return None
        self._cache.move_to_end(key)
        return val

    def set(self, key: str, val: Any) -> None:
        if key in self._cache:
            del self._cache[key]
        elif len(self._cache) >= self.max_size:
            self._cache.popitem(last=False)
        self._cache[key] = (time.time(), val)

    def clear(self) -> None:
        self._cache.clear()

    def __len__(self) -> int:
        return len(self._cache)


# Shared default cache and cooldown state
_global_corridor_cache = CorridorCache()
_global_failure_cooldown_until: float = 0.0
_global_last_failure_reason: str = ""


# ---------------------------------------------------------------------------
# Geographic Math Utilities
# ---------------------------------------------------------------------------

def _point_to_segment_dist_meters(
    p_lat: float, p_lng: float,
    a_lat: float, a_lng: float,
    b_lat: float, b_lng: float,
) -> float:
    """
    Compute approximate distance in meters from point P to line segment AB
    using local equirectangular projection.
    """
    mid_lat_rad = math.radians((a_lat + b_lat) / 2.0)
    cos_lat = math.cos(mid_lat_rad)
    meters_per_deg_lat = 111320.0
    meters_per_deg_lng = 111320.0 * cos_lat

    ax = a_lng * meters_per_deg_lng
    ay = a_lat * meters_per_deg_lat
    bx = b_lng * meters_per_deg_lng
    by = b_lat * meters_per_deg_lat
    px = p_lng * meters_per_deg_lng
    py = p_lat * meters_per_deg_lat

    dx = bx - ax
    dy = by - ay
    seg_len_sq = dx * dx + dy * dy

    if seg_len_sq < 1e-6:
        return math.hypot(px - ax, py - ay)

    # Project point onto segment, clamped to [0, 1]
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg_len_sq))
    proj_x = ax + t * dx
    proj_y = ay + t * dy

    return math.hypot(px - proj_x, py - proj_y)


def is_point_near_polyline(
    p_lat: float, p_lng: float,
    coords: list[list[float]],
    threshold_meters: float = CORRIDOR_PROXIMITY_METERS,
) -> bool:
    """
    Check if point (p_lat, p_lng) is within threshold_meters of any segment
    in the route polyline (where coords are [lat, lng]).
    """
    if len(coords) < 2:
        return False

    # For long polylines, sample segments if very dense to keep performance snappy
    step = max(1, len(coords) // 150)
    sampled = coords[::step]
    if sampled[-1] != coords[-1]:
        sampled.append(coords[-1])

    for i in range(len(sampled) - 1):
        a_lat, a_lng = sampled[i][0], sampled[i][1]
        b_lat, b_lng = sampled[i + 1][0], sampled[i + 1][1]
        dist = _point_to_segment_dist_meters(p_lat, p_lng, a_lat, a_lng, b_lat, b_lng)
        if dist <= threshold_meters:
            return True
    return False


# ---------------------------------------------------------------------------
# Safe Diagnostic Logging
# ---------------------------------------------------------------------------

def _safe_host(url: str) -> str:
    """Safely extract hostname without logging paths, tokens, or query params."""
    try:
        parsed = urlparse(url)
        return parsed.hostname or url
    except Exception:
        return "unknown_host"


# ---------------------------------------------------------------------------
# Overpass Query Generator
# ---------------------------------------------------------------------------

def build_overpass_query(south: float, west: float, north: float, east: float, timeout_sec: int) -> str:
    """
    Build a targeted Overpass QL query strictly requesting mapped assistance amenities,
    transit, major road classifications, explicit lighting, and CCTV nodes/ways.
    Uses 'out tags center qt' for minimal payload and high query efficiency.
    Excludes unindexed full-corridor scans of residential paths to respect public server limits.
    """
    return f"""[out:json][timeout:{timeout_sec}];
(
  node["amenity"~"^(police|hospital|clinic|pharmacy)$"]({south:.5f},{west:.5f},{north:.5f},{east:.5f});
  way["amenity"~"^(police|hospital|clinic|pharmacy)$"]({south:.5f},{west:.5f},{north:.5f},{east:.5f});
  node["highway"="bus_stop"]({south:.5f},{west:.5f},{north:.5f},{east:.5f});
  node["railway"~"^(station|subway_entrance|tram_stop)$"]({south:.5f},{west:.5f},{north:.5f},{east:.5f});
  node["highway"="street_lamp"]({south:.5f},{west:.5f},{north:.5f},{east:.5f});
  node["man_made"="surveillance"]({south:.5f},{west:.5f},{north:.5f},{east:.5f});
  way["lit"]({south:.5f},{west:.5f},{north:.5f},{east:.5f});
  way["surveillance"]({south:.5f},{west:.5f},{north:.5f},{east:.5f});
  way["highway"~"^(primary|secondary|tertiary)$"]({south:.5f},{west:.5f},{north:.5f},{east:.5f});
);
out tags center qt;"""


# ---------------------------------------------------------------------------
# Provider Class
# ---------------------------------------------------------------------------

class OpenStreetMapEvidenceProvider:
    """
    Retrieves and summarizes real OpenStreetMap geographic context along route corridors.
    Includes targeted queries, bounding box envelopes, controlled fallback,
    failure cooldowns, and shared-corridor query reuse across route alternatives.
    """

    def __init__(
        self,
        endpoint: Optional[str] = None,
        fallback_endpoint: Optional[str] = None,
        timeout_sec: Optional[float] = None,
        cooldown_sec: Optional[float] = None,
        cache: Optional[CorridorCache] = None,
        client: Optional[httpx.Client] = None,
    ):
        self.endpoint = (
            endpoint
            if endpoint is not None
            else os.getenv("OVERPASS_ENDPOINT", DEFAULT_OVERPASS_ENDPOINT).strip()
        )
        self.fallback_endpoint = (
            fallback_endpoint
            if fallback_endpoint is not None
            else os.getenv("OVERPASS_FALLBACK_ENDPOINT", DEFAULT_OVERPASS_FALLBACK_ENDPOINT).strip()
        )
        self.timeout_sec = (
            timeout_sec
            if timeout_sec is not None
            else float(os.getenv("OVERPASS_TIMEOUT_SEC", str(DEFAULT_TIMEOUT_SEC)))
        )
        self.cooldown_sec = (
            cooldown_sec
            if cooldown_sec is not None
            else float(os.getenv("OVERPASS_COOLDOWN_SEC", str(DEFAULT_FAILURE_COOLDOWN_SEC)))
        )
        self.cache = cache if cache is not None else _global_corridor_cache
        self._client = client

        # Dynamic circuit-breaker cooldown state
        self._failure_cooldown_until: float = 0.0
        self._last_failure_reason: str = ""

    @classmethod
    def reset_cooldown(cls) -> None:
        """Reset failure cooldown state (useful for tests and manual retries)."""
        global _global_failure_cooldown_until, _global_last_failure_reason
        _global_failure_cooldown_until = 0.0
        _global_last_failure_reason = ""

    def _get_client(self) -> httpx.Client:
        if self._client is not None:
            return self._client
        # Bounded connect timeout so dead IPs fail fast rather than hanging 15+ seconds
        connect_t = min(DEFAULT_CONNECT_TIMEOUT_SEC, self.timeout_sec)
        timeout = httpx.Timeout(self.timeout_sec, connect=connect_t)
        return httpx.Client(timeout=timeout)

    def _send_overpass_request(
        self,
        target_endpoint: str,
        query: str,
        headers: dict[str, str],
    ) -> tuple[Optional[list[dict[str, Any]]], Optional[str], Optional[GeographicEvidence]]:
        """
        Execute POST query against target_endpoint.
        Returns (elements, retrieved_iso, None) on success, or (None, None, failure_evidence) on failure.
        Safe diagnostic logging is performed without logging sensitive information.
        """
        host = _safe_host(target_endpoint)
        t0 = time.time()
        logger.info("Overpass query starting | host: %s | timeout: %.1fs", host, self.timeout_sec)

        try:
            client = self._get_client()
            resp = client.post(
                target_endpoint,
                data={"data": query},
                headers=headers,
            )
            duration = time.time() - t0
        except httpx.TimeoutException:
            duration = time.time() - t0
            logger.warning(
                "Overpass query timed out | host: %s | duration: %.2fs | error_category: TimeoutException",
                host, duration,
            )
            fail_ev = GeographicEvidence(
                endpoint=target_endpoint,
                status="unavailable",
                retrieved_at=None,
                limitations=[
                    f"External geographic data source timed out ({self.timeout_sec}s).",
                    "Physical map features do NOT establish route safety.",
                ],
                missing_data_notes=[
                    "Overpass API query timed out. No geographic features could be verified for this corridor.",
                ],
            )
            return None, "timeout", fail_ev
        except (httpx.RequestError, Exception) as exc:
            duration = time.time() - t0
            err_cat = type(exc).__name__
            logger.warning(
                "Overpass connection error | host: %s | duration: %.2fs | error_category: %s",
                host, duration, err_cat,
            )
            fail_ev = GeographicEvidence(
                endpoint=target_endpoint,
                status="unavailable",
                retrieved_at=None,
                limitations=[
                    f"Could not connect to external geographic data source: {err_cat}.",
                    "Physical map features do NOT establish route safety.",
                ],
                missing_data_notes=[
                    "Connection failed; no geographic context retrieved.",
                ],
            )
            return None, "connect_error", fail_ev

        # Handle HTTP status codes
        if resp.status_code == 429:
            logger.warning("Overpass rate limit reached | host: %s | duration: %.2fs | status: 429", host, duration)
            fail_ev = GeographicEvidence(
                endpoint=target_endpoint,
                status="unavailable",
                retrieved_at=None,
                limitations=[
                    "Overpass API rate limit reached. Upstream service throttled the request.",
                ],
                missing_data_notes=[
                    "Data temporarily unavailable due to upstream rate limits.",
                ],
            )
            return None, "rate_limited", fail_ev

        if resp.status_code != 200:
            logger.warning("Overpass HTTP error | host: %s | duration: %.2fs | status: %d", host, duration, resp.status_code)
            fail_ev = GeographicEvidence(
                endpoint=target_endpoint,
                status="error",
                retrieved_at=None,
                limitations=[
                    f"Overpass API returned HTTP status {resp.status_code}.",
                ],
                missing_data_notes=[
                    f"Upstream provider error ({resp.status_code}); no fake context substituted.",
                ],
            )
            return None, f"http_{resp.status_code}", fail_ev

        try:
            data = resp.json()
            elements = data.get("elements", [])
            retrieved_iso = datetime.now(timezone.utc).isoformat()
            logger.info(
                "Overpass query successful | host: %s | duration: %.2fs | elements: %d",
                host, duration, len(elements),
            )
            return elements, retrieved_iso, None
        except Exception as exc:
            logger.warning("Overpass JSON parsing error | host: %s | duration: %.2fs | error: %s", host, duration, exc)
            fail_ev = GeographicEvidence(
                endpoint=target_endpoint,
                status="error",
                retrieved_at=None,
                limitations=["Malformed response received from geographic data provider."],
                missing_data_notes=["Could not parse provider JSON response."],
            )
            return None, "json_parse_error", fail_ev

    def _fetch_elements(
        self,
        south: float,
        west: float,
        north: float,
        east: float,
        cache_key: str,
    ) -> tuple[Optional[list[dict[str, Any]]], Optional[str], str, Optional[GeographicEvidence]]:
        """
        Fetch elements for bounding box, checking cache, failure cooldown, primary endpoint,
        and controlled fallback endpoint.
        Returns (elements, retrieved_iso, endpoint_used, failure_evidence).
        """
        # 1. Check in-memory cache
        cached = self.cache.get(cache_key)
        if cached is not None:
            logger.info("Overpass cache hit for key: %s", cache_key)
            elements, retrieved_iso = cached
            return elements, retrieved_iso, self.endpoint, None

        # 2. Check failure cooldown (prevents retry storms when provider is down)
        global _global_failure_cooldown_until, _global_last_failure_reason
        now = time.time()
        if now < _global_failure_cooldown_until:
            remaining = _global_failure_cooldown_until - now
            logger.warning(
                "Overpass cooldown active (%.1fs remaining) after recent %s. Skipping query.",
                remaining, _global_last_failure_reason,
            )
            cooldown_ev = GeographicEvidence(
                endpoint=self.endpoint,
                status="unavailable",
                retrieved_at=None,
                limitations=[
                    "External geographic data provider is temporarily cooling down to prevent retry storms.",
                    "Physical map features do NOT establish route safety.",
                ],
                missing_data_notes=[
                    "Overpass API query temporarily paused due to upstream timeouts/overload.",
                ],
            )
            return None, None, self.endpoint, cooldown_ev

        # 3. Construct query and headers
        query = build_overpass_query(south, west, north, east, int(self.timeout_sec))
        headers = {
            "User-Agent": "NightWise/1.0 (women-route-safety-hackathon-prototype)",
            "Accept": "application/json",
        }

        # 4. Try primary endpoint
        elements, retrieved_iso_or_err, fail_ev = self._send_overpass_request(self.endpoint, query, headers)
        if elements is not None:
            # Success on primary
            self.reset_cooldown()
            self.cache.set(cache_key, (elements, retrieved_iso_or_err))
            return elements, retrieved_iso_or_err, self.endpoint, None

        # 5. Primary failed: try fallback endpoint if configured
        primary_reason = retrieved_iso_or_err or "unknown"
        if self.fallback_endpoint and self.fallback_endpoint != self.endpoint:
            fb_host = _safe_host(self.fallback_endpoint)
            logger.info("Attempting Overpass fallback | host: %s after primary %s", fb_host, primary_reason)
            fb_elements, fb_retrieved_iso_or_err, fb_fail_ev = self._send_overpass_request(
                self.fallback_endpoint, query, headers
            )
            if fb_elements is not None:
                # Success on fallback
                self.reset_cooldown()
                self.cache.set(cache_key, (fb_elements, fb_retrieved_iso_or_err))
                return fb_elements, fb_retrieved_iso_or_err, self.fallback_endpoint, None
            else:
                fail_ev = fb_fail_ev
                primary_reason = f"{primary_reason}_and_fallback_{fb_retrieved_iso_or_err}"

        # 6. Both primary and fallback failed: activate short cooldown to protect upstream
        _global_failure_cooldown_until = time.time() + self.cooldown_sec
        _global_last_failure_reason = primary_reason
        logger.warning(
            "Overpass all endpoints failed (%s). Cooldown activated for %.0fs.",
            primary_reason, self.cooldown_sec,
        )
        return None, None, self.endpoint, fail_ev

    def _filter_and_aggregate(
        self,
        elements: list[dict[str, Any]],
        coords: list[list[float]],
        endpoint: str,
        retrieved_iso: Optional[str],
    ) -> GeographicEvidence:
        """Filter raw elements against a specific route polyline and aggregate counts and tag breakdown."""
        counts = FeatureCounts()
        tag_summary = TagEvidenceSummary()

        for el in elements:
            # Extract point or center coordinate
            lat: Optional[float] = el.get("lat")
            lng: Optional[float] = el.get("lon")
            if lat is None or lng is None:
                center = el.get("center")
                if isinstance(center, dict):
                    lat = center.get("lat")
                    lng = center.get("lon")

            if lat is None or lng is None:
                continue

            # Verify that element is physically near this specific route polyline (within ~150m)
            if not is_point_near_polyline(float(lat), float(lng), coords, CORRIDOR_PROXIMITY_METERS):
                continue

            tags: dict[str, Any] = el.get("tags", {})

            # A. Assistance amenities (Police, Hospital, Clinic, Pharmacy)
            amenity = tags.get("amenity")
            if amenity in ("police", "hospital", "clinic", "pharmacy"):
                counts.assistance_amenities += 1
                tag_summary.amenity_types[amenity] = tag_summary.amenity_types.get(amenity, 0) + 1

            # B. Public transport
            highway = tags.get("highway")
            railway = tags.get("railway")
            public_transport = tags.get("public_transport")
            if highway == "bus_stop":
                counts.transport_stops += 1
                tag_summary.transport_types["bus_stop"] = tag_summary.transport_types.get("bus_stop", 0) + 1
            elif railway in ("station", "subway_entrance", "tram_stop"):
                counts.transport_stops += 1
                tag_summary.transport_types[railway] = tag_summary.transport_types.get(railway, 0) + 1
            elif public_transport in ("platform", "stop_position"):
                counts.transport_stops += 1
                tag_summary.transport_types[public_transport] = tag_summary.transport_types.get(public_transport, 0) + 1

            # C. Lighting (Explicitly tagged street lamps and lit path ways)
            if highway == "street_lamp":
                counts.street_lamps += 1
                tag_summary.lighting_tags["street_lamp"] = tag_summary.lighting_tags.get("street_lamp", 0) + 1
            lit_val = tags.get("lit")
            if lit_val is not None:
                counts.lit_path_segments += 1
                key = f"lit_{lit_val}"
                tag_summary.lighting_tags[key] = tag_summary.lighting_tags.get(key, 0) + 1

            # D. Surveillance / CCTV (Explicitly tagged)
            if tags.get("man_made") == "surveillance" or tags.get("surveillance") is not None:
                counts.surveillance_points += 1
                surv_val = str(tags.get("surveillance") or tags.get("man_made"))
                tag_summary.surveillance_tags[surv_val] = tag_summary.surveillance_tags.get(surv_val, 0) + 1

            # E. Road Network / Path Segments
            if highway in ("primary", "secondary", "tertiary", "residential", "pedestrian", "footway", "cycleway", "path"):
                counts.road_segments += 1
                tag_summary.highway_types[highway] = tag_summary.highway_types.get(highway, 0) + 1

        # Formulate missing-data notes and limitations
        missing_notes: list[str] = []
        if counts.street_lamps == 0 and counts.lit_path_segments == 0:
            missing_notes.append("Lighting: No streetlamps or lit tags recorded in OpenStreetMap along this corridor.")
        if counts.surveillance_points == 0:
            missing_notes.append("Surveillance: No CCTV or surveillance tags recorded in OpenStreetMap along this corridor.")
        if counts.assistance_amenities == 0:
            missing_notes.append("Assistance: No police stations, hospitals, or clinics recorded within 150m in OpenStreetMap.")
        if counts.transport_stops == 0:
            missing_notes.append("Public Transport: No transit stops recorded within 150m in OpenStreetMap.")

        limitations = [
            "OpenStreetMap relies on volunteer contributors. Missing map tags indicate unrecorded data in OSM, NOT confirmed absence in the physical world.",
            "Mapped assistance points, lighting tags, and transit stops provide physical context only; they do not establish route safety or guarantee personnel presence.",
            "Always rely on personal judgement and trusted local awareness.",
        ]

        return GeographicEvidence(
            source="OpenStreetMap",
            attribution="© OpenStreetMap contributors (ODbL)",
            endpoint=endpoint,
            retrieved_at=retrieved_iso,
            status="available",
            counts=counts,
            observed_tags=tag_summary,
            limitations=limitations,
            missing_data_notes=missing_notes,
        )

    def get_corridor_evidence(self, coords: list[list[float]]) -> GeographicEvidence:
        """
        Query real mapped OSM features along a single route corridor defined by coords ([lat, lng]).
        Returns structured GeographicEvidence. Never raises HTTP exceptions to callers.
        """
        results = self.get_multi_corridor_evidence([coords])
        return results[0] if results else GeographicEvidence(
            endpoint=self.endpoint,
            status="unavailable",
            limitations=["No route coordinates available to query."],
            missing_data_notes=["No route coordinates available to query."],
        )

    def get_multi_corridor_evidence(
        self,
        routes_coords: list[list[list[float]]],
    ) -> list[GeographicEvidence]:
        """
        Retrieve evidence for multiple route alternatives sharing an origin-destination trip.
        Computes the shared corridor bounding box and issues at most ONE upstream Overpass query,
        then independently filters and aggregates physical features for each alternative route.
        Prevents multiplying timeout delays and upstream load across alternatives.
        """
        if not routes_coords:
            return []

        # If a subclass has overridden get_corridor_evidence but not get_multi_corridor_evidence,
        # respect the subclass's custom get_corridor_evidence implementation.
        if type(self).get_corridor_evidence is not OpenStreetMapEvidenceProvider.get_corridor_evidence:
            return [self.get_corridor_evidence(c) for c in routes_coords]

        # Validate coordinate sets
        valid_coords: list[list[list[float]]] = []
        all_lats: list[float] = []
        all_lngs: list[float] = []

        for coords in routes_coords:
            if coords and len(coords) >= 2:
                valid_coords.append(coords)
                for pt in coords:
                    all_lats.append(pt[0])
                    all_lngs.append(pt[1])

        if not valid_coords or not all_lats or not all_lngs:
            # All provided routes lacked sufficient coordinates
            return [
                GeographicEvidence(
                    endpoint=self.endpoint,
                    status="unavailable",
                    limitations=["Insufficient route coordinates for geographic corridor analysis."],
                    missing_data_notes=["No route coordinates available to query."],
                )
                for _ in routes_coords
            ]

        # 1. Compute shared bounding box envelope with corridor buffer
        south = min(all_lats) - DEFAULT_CORRIDOR_BUFFER_DEG
        north = max(all_lats) + DEFAULT_CORRIDOR_BUFFER_DEG
        west = min(all_lngs) - DEFAULT_CORRIDOR_BUFFER_DEG
        east = max(all_lngs) + DEFAULT_CORRIDOR_BUFFER_DEG

        lat_span = north - south
        lng_span = east - west
        max_span = float(os.getenv("OVERPASS_MAX_BBOX_SPAN", str(DEFAULT_MAX_BBOX_SPAN)))

        if lat_span > max_span or lng_span > max_span:
            # Combined envelope too large; return partial for each
            return [
                GeographicEvidence(
                    endpoint=self.endpoint,
                    status="partial",
                    limitations=[
                        f"Route corridor span ({max(lat_span, lng_span):.2f}°) exceeds maximum supported query limit ({max_span:.2f}°). Detailed Overpass query skipped to prevent server overload.",
                        "OpenStreetMap data is volunteer-maintained and varies by neighborhood. Missing tags denote unmapped data in OSM, not guaranteed absence in reality.",
                        "Physical map features do NOT establish route safety.",
                    ],
                    missing_data_notes=[
                        "Large corridor query skipped for upstream service reliability.",
                    ],
                )
                for _ in routes_coords
            ]

        # 2. Check cache / fetch elements for shared envelope (~100m grid resolution key)
        cache_key = f"{round(south, 3)},{round(west, 3)},{round(north, 3)},{round(east, 3)}"
        elements, retrieved_iso, endpoint_used, fail_ev = self._fetch_elements(south, west, north, east, cache_key)

        if fail_ev is not None:
            # Query failed or in cooldown: return explicit failure evidence for each alternative
            return [fail_ev for _ in routes_coords]

        # 3. For each route alternative, independently filter and aggregate features along its geometry
        evidence_results: list[GeographicEvidence] = []
        for coords in routes_coords:
            if not coords or len(coords) < 2:
                evidence_results.append(
                    GeographicEvidence(
                        endpoint=endpoint_used,
                        status="unavailable",
                        limitations=["Insufficient route coordinates for geographic corridor analysis."],
                        missing_data_notes=["No route coordinates available to query."],
                    )
                )
            else:
                route_ev = self._filter_and_aggregate(
                    elements=elements or [],
                    coords=coords,
                    endpoint=endpoint_used,
                    retrieved_iso=retrieved_iso,
                )
                evidence_results.append(route_ev)

        return evidence_results
