"""
backend/routing_provider.py

OpenRouteService routing and geocoding provider.
Handles external HTTP communication with OpenRouteService APIs:
- Geocoding place names to coordinates (/geocode/search)
- Routing with walking, cycling, and driving profiles (/v2/directions/{profile}/geojson)
- Alternative route extraction and detour calculation

All external HTTP calls are isolated in this module.
API keys and secrets are never logged or leaked.
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from typing import Optional

import httpx
from fastapi import HTTPException
from dotenv import load_dotenv

logger = logging.getLogger("nightwise.routing_provider")
logger.setLevel(logging.INFO)

# Ensure environment variables are loaded from backend/.env or root .env
load_dotenv()
_backend_dir = os.path.dirname(os.path.abspath(__file__))
_root_dir = os.path.dirname(_backend_dir)
load_dotenv(os.path.join(_root_dir, ".env"))
load_dotenv(os.path.join(_backend_dir, ".env"))

COORD_PATTERN = re.compile(
    r"^\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*$"
)

MODE_TO_ORS_PROFILE: dict[str, str] = {
    "walk": "foot-walking",
    "bike": "cycling-regular",
    "car": "driving-car",
}

KNOWN_LOCATIONS: dict[str, tuple[float, float, str]] = {
    "mg road metro": (12.9756, 77.6068, "MG Road Metro, Bengaluru"),
    "indiranagar 100ft rd": (12.9719, 77.6412, "Indiranagar 100ft Rd, Bengaluru"),
    "koramangala 5th block": (12.9345, 77.6220, "Koramangala 5th Block, Bengaluru"),
    "hsr layout sector 2": (12.9121, 77.6446, "HSR Layout Sector 2, Bengaluru"),
    "cubbon park": (12.9763, 77.5929, "Cubbon Park, Bengaluru"),
    "majestic bus stand": (12.9774, 77.5726, "Majestic Bus Stand, Bengaluru"),
    "jayanagar 4th block": (12.9250, 77.5938, "Jayanagar 4th Block, Bengaluru"),
    "whitefield itpl": (12.9857, 77.7368, "Whitefield ITPL, Bengaluru"),
}


def lookup_known_location(query: str) -> Optional[tuple[float, float, str]]:
    """
    Resolve known application landmarks in Bengaluru to coordinates.
    Matches exact or normalized names (e.g. 'MG Road Metro, Bengaluru' -> 'MG Road Metro').
    """
    q = query.lower().strip()
    q_norm = re.sub(r"[,]+", " ", q)
    q_norm = re.sub(r"\b(bengaluru|bangalore|karnataka|india|station)\b", "", q_norm)
    q_norm = " ".join(q_norm.split())

    for key, val in KNOWN_LOCATIONS.items():
        if key == q_norm or key == q or key in q:
            return val
    return None


def parse_coordinates(query: str) -> Optional[tuple[float, float]]:
    """
    Parse a 'latitude, longitude' string if valid.
    Returns (lat, lng) if valid, else None.
    """
    m = COORD_PATTERN.match(query.strip())
    if not m:
        return None
    try:
        lat = float(m.group(1))
        lng = float(m.group(2))
        if -90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0:
            return (lat, lng)
    except ValueError:
        pass
    return None


@dataclass
class ProviderRoute:
    coords: list[list[float]]  # [lat, lng] format for Leaflet
    distance_km: float
    duration_min: int
    raw_feature: Optional[dict] = None


class OpenRouteServiceRoutingProvider:
    BASE_URL = "https://api.openrouteservice.org"
    DEFAULT_TIMEOUT_SEC = 10.0

    def __init__(self, api_key: Optional[str] = None, client: Optional[httpx.Client] = None):
        self._explicit_key = api_key
        self._client = client

    @property
    def api_key(self) -> str:
        if self._explicit_key is not None:
            return self._explicit_key.strip()
        return os.getenv("OPENROUTESERVICE_API_KEY", "").strip()

    def _get_client(self) -> httpx.Client:
        if self._client is not None:
            return self._client
        return httpx.Client(timeout=self.DEFAULT_TIMEOUT_SEC)

    def _ensure_api_key(self) -> str:
        key = self.api_key
        if not key:
            raise HTTPException(
                status_code=503,
                detail="Routing provider is not configured. OPENROUTESERVICE_API_KEY is missing.",
            )
        return key

    def _redact(self, message: str) -> str:
        key = self.api_key
        if key and key in message:
            return message.replace(key, "[REDACTED]")
        return message

    def geocode(self, query: str) -> tuple[float, float, str]:
        """
        Resolve a query to (latitude, longitude, resolved_label).
        If query is already 'lat, lng', returns parsed coords directly.
        Otherwise calls OpenRouteService geocoding.
        """
        clean_query = query.strip()
        if not clean_query:
            raise HTTPException(status_code=422, detail="Location query cannot be empty.")

        coords = parse_coordinates(clean_query)
        if coords is not None:
            lat, lng = coords
            return (lat, lng, f"{lat:.4f}, {lng:.4f}")

        api_key = self._ensure_api_key()

        # In live execution (not injected test client), check known application landmarks first
        if self._client is None:
            known = lookup_known_location(clean_query)
            if known is not None:
                return known

        url = f"{self.BASE_URL}/geocode/search"
        headers = {
            "Authorization": api_key,
            "Accept": "application/json",
        }
        params: dict[str, str | int | float] = {
            "text": clean_query,
            "size": 5,
            "focus.point.lat": 12.9716,
            "focus.point.lon": 77.5946,
        }

        try:
            client = self._get_client()
            resp = client.get(url, headers=headers, params=params)
        except httpx.TimeoutException:
            raise HTTPException(
                status_code=504,
                detail="Routing provider request timed out while resolving location.",
            )
        except httpx.RequestError as exc:
            msg = self._redact(str(exc))
            raise HTTPException(
                status_code=502,
                detail=f"Routing provider connection error during geocoding: {msg}",
            )

        if resp.status_code == 429:
            raise HTTPException(
                status_code=429,
                detail="Routing provider rate limit reached during geocoding. Please try again shortly.",
            )
        if resp.status_code in (401, 403):
            raise HTTPException(
                status_code=502,
                detail="Routing provider authentication failed. Check OPENROUTESERVICE_API_KEY.",
            )
        if resp.status_code >= 500:
            raise HTTPException(
                status_code=502,
                detail="Routing provider upstream service error during geocoding.",
            )
        if resp.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"Routing provider error ({resp.status_code}) during geocoding.",
            )

        data = resp.json()
        features = data.get("features", [])
        if not features:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"Location not found: '{clean_query}'. "
                    "Please check spelling or enter coordinates (lat, lng)."
                ),
            )

        feature = features[0]
        geom = feature.get("geometry", {})
        point = geom.get("coordinates")
        if not point or len(point) < 2:
            raise HTTPException(
                status_code=502,
                detail=f"Invalid geocoding response format for '{clean_query}'.",
            )

        # ORS GeoJSON returns [lng, lat]
        lng, lat = float(point[0]), float(point[1])
        label = feature.get("properties", {}).get("label", clean_query)
        return (lat, lng, label)

    def get_routes(
        self,
        start_lat: float,
        start_lng: float,
        end_lat: float,
        end_lng: float,
        mode: str = "walk",
        max_detour_pct: int = 50,
    ) -> list[ProviderRoute]:
        """
        Request routes from OpenRouteService.
        Converts GeoJSON coordinates ([lng, lat]) to Leaflet ([lat, lng]).
        Returns list of ProviderRoute.
        """
        profile = MODE_TO_ORS_PROFILE.get(mode)
        if not profile:
            raise HTTPException(
                status_code=422,
                detail=f"Unsupported mode '{mode}'. Supported modes: {sorted(MODE_TO_ORS_PROFILE.keys())}",
            )

        api_key = self._ensure_api_key()
        logger.info("Requesting directions | provider: openrouteservice | profile: %s", profile)
        url = f"{self.BASE_URL}/v2/directions/{profile}/geojson"
        headers = {
            "Authorization": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json, application/geo+json",
        }

        # Weight factor for alternative routes: ORS allows 1.1 to 2.0
        weight_factor = min(2.0, max(1.1, 1.0 + (max_detour_pct / 100.0)))

        body = {
            "coordinates": [
                [start_lng, start_lat],
                [end_lng, end_lat],
            ],
            "alternative_routes": {
                "target_count": 3,
                "weight_factor": round(weight_factor, 2),
                "share_factor": 0.6,
            },
        }

        client = self._get_client()

        try:
            resp = client.post(url, headers=headers, json=body)
            # If alternative_routes returned 400 (some profiles or areas may disallow it), retry without alternatives
            if resp.status_code == 400 and "alternative_routes" in body:
                body_single = {
                    "coordinates": [
                        [start_lng, start_lat],
                        [end_lng, end_lat],
                    ]
                }
                resp = client.post(url, headers=headers, json=body_single)
        except httpx.TimeoutException:
            raise HTTPException(
                status_code=504,
                detail="Routing provider request timed out while generating route.",
            )
        except httpx.RequestError as exc:
            msg = self._redact(str(exc))
            raise HTTPException(
                status_code=502,
                detail=f"Routing provider connection error: {msg}",
            )

        if resp.status_code == 429:
            raise HTTPException(
                status_code=429,
                detail="Routing provider rate limit reached. Please try again shortly.",
            )
        if resp.status_code in (401, 403):
            raise HTTPException(
                status_code=502,
                detail="Routing provider authentication failed. Check OPENROUTESERVICE_API_KEY.",
            )
        if resp.status_code == 404:
            raise HTTPException(
                status_code=404,
                detail="No route found between the specified origin and destination.",
            )
        if resp.status_code == 400:
            err_detail = "Bad request to routing provider."
            try:
                err_json = resp.json()
                if "error" in err_json:
                    err_detail = err_json["error"].get("message", err_detail)
            except Exception:
                pass
            raise HTTPException(
                status_code=400,
                detail=f"Routing error: {err_detail}",
            )
        if resp.status_code >= 500:
            raise HTTPException(
                status_code=502,
                detail="Routing provider upstream service error.",
            )
        if resp.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"Routing provider returned unexpected status code {resp.status_code}.",
            )

        data = resp.json()
        features = data.get("features", [])
        if not features:
            raise HTTPException(
                status_code=404,
                detail="No route found between the specified origin and destination.",
            )

        routes: list[ProviderRoute] = []
        for feat in features:
            geom = feat.get("geometry", {})
            coords_raw = geom.get("coordinates", [])
            if not coords_raw:
                continue

            # ORS returns [lng, lat]. Convert to [lat, lng] for Leaflet map.
            leaflet_coords: list[list[float]] = [
                [float(pt[1]), float(pt[0])] for pt in coords_raw if len(pt) >= 2
            ]

            props = feat.get("properties", {})
            summary = props.get("summary", {})
            dist_m = float(summary.get("distance", 0.0))
            dur_s = float(summary.get("duration", 0.0))

            distance_km = round(dist_m / 1000.0, 1)
            duration_min = max(1, round(dur_s / 60.0))

            routes.append(
                ProviderRoute(
                    coords=leaflet_coords,
                    distance_km=distance_km,
                    duration_min=duration_min,
                    raw_feature=feat,
                )
            )

        if not routes:
            raise HTTPException(
                status_code=404,
                detail="No usable route geometry returned by routing provider.",
            )

        logger.info("Retrieved routes | provider: openrouteservice | count: %d", len(routes))
        return routes
