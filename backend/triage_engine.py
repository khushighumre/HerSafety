"""
backend/triage_engine.py

Deterministic rules-based threat assessment for the Digital Safety triage endpoint.

Design principles:
- Same normalised input always produces the same output (no randomness).
- Scores are bounded 0–100 and computed from explicit, auditable rules.
- Keyword matches are treated as indicators, not proof of a genuine threat.
- Ambiguous or sparse descriptions are handled cautiously (lower confidence).
- No external API calls, no ML model, no persistence of raw descriptions.
- Do not log raw user descriptions.

Limitations (stated clearly):
- Rules are illustrative heuristics for a hackathon demo.
- Scores are NOT scientifically validated risk probabilities.
- This is NOT professional legal, medical, or law-enforcement advice.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# Supported categories — must match frontend DIGITAL_THREATS ids exactly.
# ---------------------------------------------------------------------------

SUPPORTED_CATEGORIES: frozenset[str] = frozenset(
    {"harassment", "sextortion", "impersonation", "account", "phishing"}
)

_DISCLAIMER = (
    "This is an illustrative demo assessment produced by simple keyword rules. "
    "It is not a validated threat prediction, professional security analysis, "
    "legal advice, or medical guidance. Treat scores as rough indicators only."
)

# ---------------------------------------------------------------------------
# Per-category configuration
# ---------------------------------------------------------------------------

@dataclass
class _CategoryConfig:
    # Base scores before keyword adjustment
    base_urgency: int
    base_exposure: int
    # Keywords that raise urgency (each hit adds urgency_per_hit, capped)
    urgency_keywords: list[str]
    urgency_per_hit: int
    urgency_cap: int          # max urgency from keywords alone
    # Keywords that raise exposure (each hit adds exposure_per_hit, capped)
    exposure_keywords: list[str]
    exposure_per_hit: int
    exposure_cap: int
    # Recommended actions (ordered, practical, user-centred)
    actions: list[str]
    # Verdict template — {confidence} is substituted at runtime
    verdict_template: str


_CONFIGS: dict[str, _CategoryConfig] = {
    "harassment": _CategoryConfig(
        base_urgency=35,
        base_exposure=30,
        urgency_keywords=[
            "threat", "threaten", "kill", "hurt", "violence", "follow", "stalk",
            "address", "home", "location", "find you", "come for", "repeated",
            "every day", "daily", "won't stop", "keeps", "non-stop",
        ],
        urgency_per_hit=8,
        urgency_cap=55,
        exposure_keywords=[
            "public", "post", "share", "screenshot", "group", "broadcast",
            "everyone", "friends", "family", "workplace", "employer",
        ],
        exposure_per_hit=10,
        exposure_cap=50,
        actions=[
            "Screenshot every message with timestamps visible before blocking.",
            "Use the platform's block and report tools; note the report reference number.",
            "Log each incident in the Evidence Vault with date and platform.",
            "If messages mention your location, address, or physical harm, treat this as a physical safety risk too.",
            "Tell one trusted person what is happening — you do not have to handle this alone.",
        ],
        verdict_template=(
            "Indicators suggest {confidence} of online harassment. "
            "Preserving evidence before blocking is the most important immediate step."
        ),
    ),

    "sextortion": _CategoryConfig(
        base_urgency=65,
        base_exposure=60,
        urgency_keywords=[
            "pay", "money", "send", "transfer", "bitcoin", "crypto", "gift card",
            "more photos", "more videos", "or else", "unless", "deadline",
            "24 hours", "48 hours", "expose", "publish", "release",
        ],
        urgency_per_hit=6,
        urgency_cap=30,
        exposure_keywords=[
            "contacts", "family", "friends", "employer", "post online",
            "share", "leak", "spread", "everyone will see",
        ],
        exposure_per_hit=8,
        exposure_cap=30,
        actions=[
            "Do not pay or send anything further — compliance almost always escalates demands.",
            "Stop all contact with the person but preserve all evidence; do not delete chats.",
            "Report via the platform's abuse tools and the national cybercrime portal (cybercrime.gov.in / 1930).",
            "Tell one trusted person — this is a crime and you are not at fault.",
            "Contact a support organisation if you feel unsafe; see the Resources page.",
        ],
        verdict_template=(
            "Indicators suggest {confidence} of a sextortion attempt. "
            "Do not comply with demands. Reporting and evidence preservation are the priority."
        ),
    ),

    "impersonation": _CategoryConfig(
        base_urgency=40,
        base_exposure=45,
        urgency_keywords=[
            "fake account", "fake profile", "pretending", "using my photos",
            "my name", "my pictures", "messaging my", "contacting my",
            "already sent", "already messaged", "spreading",
        ],
        urgency_per_hit=7,
        urgency_cap=40,
        exposure_keywords=[
            "contacts", "friends", "family", "colleagues", "dating", "public",
            "many people", "everyone", "widely",
        ],
        exposure_per_hit=9,
        exposure_cap=40,
        actions=[
            "Report the fake profile with direct links and screenshots.",
            "Ask close contacts to report it too — volume speeds up platform takedowns.",
            "Tighten your profile privacy so fewer photos are publicly downloadable.",
            "Send a brief note to close contacts warning them about the fake account.",
            "Document the fake profile URL and screenshots in the Evidence Vault.",
        ],
        verdict_template=(
            "Indicators suggest {confidence} of an impersonation attempt. "
            "Reporting quickly and alerting your contacts limits the harm."
        ),
    ),

    "account": _CategoryConfig(
        base_urgency=55,
        base_exposure=40,
        urgency_keywords=[
            "locked out", "can't log in", "password changed", "email changed",
            "recovery", "otp", "code sent", "unauthorised", "unauthorized",
            "someone else", "strange login", "unknown device", "suspicious activity",
            "taken over", "hacked",
        ],
        urgency_per_hit=6,
        urgency_cap=35,
        exposure_keywords=[
            "bank", "payment", "financial", "contacts", "messages read",
            "private", "personal data", "photos", "documents",
        ],
        exposure_per_hit=8,
        exposure_cap=40,
        actions=[
            "Change the password immediately from a trusted device you control.",
            "Sign out all active sessions and re-enable two-factor authentication with fresh codes.",
            "Check your recovery email and phone number for tampering.",
            "Warn your contacts that messages from your account may not be from you.",
            "Review recent account activity for unauthorised actions (posts, purchases, transfers).",
        ],
        verdict_template=(
            "Indicators suggest {confidence} of account compromise. "
            "Changing credentials and signing out all sessions is the most urgent step."
        ),
    ),

    "phishing": _CategoryConfig(
        base_urgency=30,
        base_exposure=25,
        urgency_keywords=[
            "clicked", "entered", "submitted", "gave", "provided",
            "otp", "card number", "cvv", "password", "bank details",
            "already paid", "transferred", "sent money",
        ],
        urgency_per_hit=10,
        urgency_cap=50,
        exposure_keywords=[
            "bank", "credit card", "debit card", "account number", "ifsc",
            "aadhaar", "pan", "identity", "personal details",
        ],
        exposure_per_hit=10,
        exposure_cap=45,
        actions=[
            "Never enter OTPs, card details, or passwords from a link you did not initiate.",
            "Verify the request directly with the company via its official app or published phone number.",
            "If you already entered credentials, change them immediately and contact your bank.",
            "Report the number or link to your telecom provider's spam channel.",
            "If money was transferred, call your bank's fraud line within minutes to attempt a freeze.",
        ],
        verdict_template=(
            "Indicators suggest {confidence} of a phishing or scam attempt. "
            "If credentials or payment details were shared, act immediately."
        ),
    ),
}

# ---------------------------------------------------------------------------
# Platform exposure modifiers
# ---------------------------------------------------------------------------

# Platforms where content spreads more widely raise exposure slightly.
_HIGH_SPREAD_PLATFORMS = {"instagram", "twitter", "facebook", "tiktok", "youtube", "reddit"}
_LOW_SPREAD_PLATFORMS  = {"email", "sms"}

_PLATFORM_EXPOSURE_DELTA: dict[str, int] = {p: +8 for p in _HIGH_SPREAD_PLATFORMS}
_PLATFORM_EXPOSURE_DELTA.update({p: -5 for p in _LOW_SPREAD_PLATFORMS})


# ---------------------------------------------------------------------------
# Confidence thresholds
# ---------------------------------------------------------------------------

def _confidence_label(keyword_hits: int, desc_len: int) -> str:
    """
    Derive a confidence label from how much signal the description contains.
    More keyword hits and a longer description → higher confidence.
    """
    signal = keyword_hits * 10 + min(desc_len // 50, 20)
    if signal >= 40:
        return "high confidence"
    if signal >= 20:
        return "moderate confidence"
    return "low confidence (limited information provided)"


# ---------------------------------------------------------------------------
# Public assessment function
# ---------------------------------------------------------------------------

@dataclass
class TriageResult:
    category: str
    platform: str
    urgency_score: int
    exposure_score: int
    confidence: str
    verdict: str
    recommended_actions: list[str] = field(default_factory=list)
    method: str = "rules"
    disclaimer: str = _DISCLAIMER


def assess(category: str, platform: str, description: str) -> TriageResult:
    """
    Run a deterministic rules-based triage assessment.

    Parameters are assumed to be already validated (non-empty, category in
    SUPPORTED_CATEGORIES).  Description is lowercased internally for matching;
    the raw text is never stored or logged.
    """
    cfg = _CONFIGS[category]
    text = description.lower()
    platform_key = platform.lower().strip()

    # --- Urgency ---
    urgency_hits = sum(1 for kw in cfg.urgency_keywords if kw in text)
    urgency = cfg.base_urgency + min(urgency_hits * cfg.urgency_per_hit, cfg.urgency_cap)

    # --- Exposure ---
    exposure_hits = sum(1 for kw in cfg.exposure_keywords if kw in text)
    exposure = cfg.base_exposure + min(exposure_hits * cfg.exposure_per_hit, cfg.exposure_cap)
    exposure += _PLATFORM_EXPOSURE_DELTA.get(platform_key, 0)

    # Clamp both to [0, 100]
    urgency  = max(0, min(100, urgency))
    exposure = max(0, min(100, exposure))

    total_hits = urgency_hits + exposure_hits
    confidence = _confidence_label(total_hits, len(description))
    verdict = cfg.verdict_template.format(confidence=confidence)

    return TriageResult(
        category=category,
        platform=platform,
        urgency_score=urgency,
        exposure_score=exposure,
        confidence=confidence,
        verdict=verdict,
        recommended_actions=list(cfg.actions),
    )
