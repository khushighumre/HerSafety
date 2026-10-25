"""
backend/tests/test_triage.py

Tests for POST /api/v1/triage — Digital Safety Triage API.

Covers:
1.  Valid requests return HTTP 200.
2.  All five supported frontend categories are accepted.
3.  Unsupported categories are rejected (422).
4.  Blank descriptions are rejected (422).
5.  Descriptions exceeding 2,000 characters are rejected (422).
6.  Surrounding whitespace in inputs is normalised.
7.  Identical inputs produce identical outputs (determinism).
8.  Scores stay within 0–100.
9.  Recommendations are returned and relevant to the category.
10. Response identifies method: "rules".
11. Disclaimer is present and does not claim validated AI predictions.
12. Malformed requests return 422.
"""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from main import app

client = TestClient(app)

_URL = "/api/v1/triage"

_ALL_CATEGORIES = ["harassment", "sextortion", "impersonation", "account", "phishing"]

# Minimal valid payload for each category
_VALID = {
    "harassment":    {"category": "harassment",    "platform": "WhatsApp",    "description": "Receiving repeated abusive messages."},
    "sextortion":    {"category": "sextortion",    "platform": "Instagram",   "description": "Someone is threatening to share private images unless I pay."},
    "impersonation": {"category": "impersonation", "platform": "Dating app",  "description": "A fake profile is using my photos to contact people."},
    "account":       {"category": "account",       "platform": "Email",       "description": "I cannot log in and my password appears to have been changed."},
    "phishing":      {"category": "phishing",      "platform": "SMS",         "description": "I received a suspicious link asking for my card details."},
}


# ---------------------------------------------------------------------------
# 1. Valid requests return HTTP 200
# ---------------------------------------------------------------------------

def test_valid_request_returns_200():
    r = client.post(_URL, json=_VALID["harassment"])
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# 2. All five supported categories are accepted
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("cat", _ALL_CATEGORIES)
def test_all_supported_categories_accepted(cat):
    r = client.post(_URL, json=_VALID[cat])
    assert r.status_code == 200, f"Category '{cat}' was rejected: {r.text}"
    assert r.json()["category"] == cat


# ---------------------------------------------------------------------------
# 3. Unsupported categories are rejected
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("bad_cat", ["malware", "deepfake", "", "HARASSMENT_EXTRA", "123"])
def test_unsupported_category_rejected(bad_cat):
    r = client.post(_URL, json={"category": bad_cat, "platform": "WhatsApp", "description": "Some description."})
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# 4. Blank descriptions are rejected
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("blank", ["", "   ", "\t\n"])
def test_blank_description_rejected(blank):
    r = client.post(_URL, json={"category": "harassment", "platform": "WhatsApp", "description": blank})
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# 5. Descriptions exceeding 2,000 characters are rejected
# ---------------------------------------------------------------------------

def test_description_too_long_rejected():
    r = client.post(_URL, json={"category": "harassment", "platform": "WhatsApp", "description": "x" * 2001})
    assert r.status_code == 422


def test_description_at_limit_accepted():
    r = client.post(_URL, json={"category": "harassment", "platform": "WhatsApp", "description": "x" * 2000})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# 6. Surrounding whitespace is normalised
# ---------------------------------------------------------------------------

def test_whitespace_trimmed_from_description():
    r = client.post(_URL, json={"category": "harassment", "platform": "WhatsApp", "description": "  Abusive messages.  "})
    assert r.status_code == 200


def test_whitespace_trimmed_from_platform():
    r = client.post(_URL, json={"category": "harassment", "platform": "  WhatsApp  ", "description": "Abusive messages."})
    assert r.status_code == 200
    assert r.json()["platform"] == "WhatsApp"


def test_category_case_insensitive():
    r = client.post(_URL, json={"category": "HARASSMENT", "platform": "WhatsApp", "description": "Abusive messages."})
    assert r.status_code == 200
    assert r.json()["category"] == "harassment"


# ---------------------------------------------------------------------------
# 7. Identical inputs produce identical outputs (determinism)
# ---------------------------------------------------------------------------

def test_identical_inputs_produce_identical_outputs():
    payload = {"category": "phishing", "platform": "SMS", "description": "Suspicious link asking for OTP and card number."}
    r1 = client.post(_URL, json=payload).json()
    r2 = client.post(_URL, json=payload).json()
    assert r1["urgency_score"]  == r2["urgency_score"]
    assert r1["exposure_score"] == r2["exposure_score"]
    assert r1["confidence"]     == r2["confidence"]
    assert r1["verdict"]        == r2["verdict"]
    assert r1["recommended_actions"] == r2["recommended_actions"]


# ---------------------------------------------------------------------------
# 8. Scores stay within 0–100
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("cat", _ALL_CATEGORIES)
def test_scores_bounded_0_to_100(cat):
    r = client.post(_URL, json=_VALID[cat])
    assert r.status_code == 200
    b = r.json()
    assert 0 <= b["urgency_score"]  <= 100, f"urgency_score out of range for {cat}"
    assert 0 <= b["exposure_score"] <= 100, f"exposure_score out of range for {cat}"


def test_scores_bounded_with_many_keywords():
    # Pile in as many urgency/exposure keywords as possible to test the cap
    desc = (
        "threat kill hurt violence follow stalk address home location find you "
        "repeated every day won't stop keeps non-stop public post share screenshot "
        "group broadcast everyone friends family workplace employer"
    )
    r = client.post(_URL, json={"category": "harassment", "platform": "Instagram", "description": desc})
    assert r.status_code == 200
    b = r.json()
    assert 0 <= b["urgency_score"]  <= 100
    assert 0 <= b["exposure_score"] <= 100


# ---------------------------------------------------------------------------
# 9. Recommendations are returned and relevant to the category
# ---------------------------------------------------------------------------

def test_recommendations_non_empty():
    for cat, payload in _VALID.items():
        r = client.post(_URL, json=payload)
        assert r.status_code == 200
        actions = r.json()["recommended_actions"]
        assert isinstance(actions, list) and len(actions) > 0, f"No actions for {cat}"


def test_sextortion_actions_include_do_not_pay():
    r = client.post(_URL, json=_VALID["sextortion"])
    actions_text = " ".join(r.json()["recommended_actions"]).lower()
    assert "do not pay" in actions_text or "not pay" in actions_text


def test_account_actions_include_password():
    r = client.post(_URL, json=_VALID["account"])
    actions_text = " ".join(r.json()["recommended_actions"]).lower()
    assert "password" in actions_text


def test_phishing_actions_include_otp_warning():
    r = client.post(_URL, json=_VALID["phishing"])
    actions_text = " ".join(r.json()["recommended_actions"]).lower()
    assert "otp" in actions_text or "card" in actions_text


# ---------------------------------------------------------------------------
# 10. Response identifies method: "rules"
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("cat", _ALL_CATEGORIES)
def test_method_is_rules(cat):
    r = client.post(_URL, json=_VALID[cat])
    assert r.json()["method"] == "rules"


# ---------------------------------------------------------------------------
# 11. Disclaimer is present and does not claim validated AI predictions
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("cat", _ALL_CATEGORIES)
def test_disclaimer_present(cat):
    r = client.post(_URL, json=_VALID[cat])
    disclaimer = r.json()["disclaimer"]
    assert isinstance(disclaimer, str) and len(disclaimer) > 20


def test_disclaimer_does_not_claim_ai():
    r = client.post(_URL, json=_VALID["harassment"])
    disclaimer = r.json()["disclaimer"].lower()
    # Must not claim to be an AI model or validated prediction
    assert "ai model" not in disclaimer
    assert "machine learning" not in disclaimer


def test_disclaimer_states_demo_or_illustrative():
    r = client.post(_URL, json=_VALID["harassment"])
    disclaimer = r.json()["disclaimer"].lower()
    assert "demo" in disclaimer or "illustrative" in disclaimer


# ---------------------------------------------------------------------------
# 12. Malformed requests return 422
# ---------------------------------------------------------------------------

def test_missing_category_returns_422():
    r = client.post(_URL, json={"platform": "WhatsApp", "description": "Some text."})
    assert r.status_code == 422


def test_missing_platform_returns_422():
    r = client.post(_URL, json={"category": "harassment", "description": "Some text."})
    assert r.status_code == 422


def test_missing_description_returns_422():
    r = client.post(_URL, json={"category": "harassment", "platform": "WhatsApp"})
    assert r.status_code == 422


def test_empty_body_returns_422():
    r = client.post(_URL, json={})
    assert r.status_code == 422


def test_non_json_body_returns_422():
    r = client.post(_URL, content=b"not json", headers={"Content-Type": "application/json"})
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Keyword scoring raises scores (smoke test for rule logic)
# ---------------------------------------------------------------------------

def test_high_signal_description_raises_urgency():
    low_signal  = client.post(_URL, json={"category": "harassment", "platform": "WhatsApp", "description": "Someone sent me a message."}).json()
    high_signal = client.post(_URL, json={"category": "harassment", "platform": "WhatsApp", "description": "Repeated threats of violence, they know my home address and follow me every day."}).json()
    assert high_signal["urgency_score"] > low_signal["urgency_score"]


def test_high_exposure_platform_raises_exposure():
    sms_result  = client.post(_URL, json={"category": "phishing", "platform": "SMS",       "description": "Suspicious link."}).json()
    ig_result   = client.post(_URL, json={"category": "phishing", "platform": "Instagram", "description": "Suspicious link."}).json()
    assert ig_result["exposure_score"] > sms_result["exposure_score"]
