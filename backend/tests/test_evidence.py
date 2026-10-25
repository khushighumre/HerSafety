import io, hashlib, os, struct, sys, zlib
from pathlib import Path
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from main import app
from database import SessionLocal, init_db
from models import Evidence, Incident

client = TestClient(app)


# ---------------------------------------------------------------------------
# Shared fixture: clean DB tables + redirect evidence store to tmp_path
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def clean_db(tmp_path):
    """Fresh tables and isolated evidence dir for every test."""
    init_db()
    evidence_dir = tmp_path / 'evidence_store'
    evidence_dir.mkdir()
    with SessionLocal() as db:
        db.query(Evidence).delete()
        db.query(Incident).delete()
        db.commit()
    with patch('routers.incidents._EVIDENCE_DIR', evidence_dir):
        yield evidence_dir
    with SessionLocal() as db:
        db.query(Evidence).delete()
        db.query(Incident).delete()
        db.commit()


# ---------------------------------------------------------------------------
# Minimal valid file byte generators
# ---------------------------------------------------------------------------

def _jpeg(c=b'pixels'): return b'\xff\xd8\xff' + c

def _png():
    sig = b'\x89PNG\r\n\x1a\n'
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t+d) & 0xFFFFFFFF)
    return sig + chunk(b'IHDR', struct.pack('>IIBBBBB',1,1,8,2,0,0,0)) + chunk(b'IDAT', zlib.compress(b'\x00\xff\xff\xff')) + chunk(b'IEND', b'')

def _gif(): return b'GIF89a\x01\x00\x01\x00\x00\x00\x00\x00\x00\x00\xff\xff\xff\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b'

def _webp():
    p = b'WEBP' + b'\x00'*4
    return b'RIFF' + struct.pack('<I', len(p)) + p

def _pdf(): return b'%PDF-1.4\n%minimal'


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_incident(title='Test', category='harassment'):
    r = client.post('/api/v1/incidents', json={'title': title, 'category': category})
    assert r.status_code == 201, r.text
    return r.json()['id']

def _upload(inc_id, data, filename='photo.jpg'):
    r = client.post(f'/api/v1/incidents/{inc_id}/evidence', files={'file': (filename, io.BytesIO(data), 'image/jpeg')})
    assert r.status_code == 201, r.text
    return r.json()['id']


# ---------------------------------------------------------------------------
# Upload - happy path
# ---------------------------------------------------------------------------

def test_upload_jpeg_returns_201_with_metadata():
    inc = _make_incident()
    data = _jpeg()
    r = client.post(f'/api/v1/incidents/{inc}/evidence', files={'file': ('photo.jpg', io.BytesIO(data), 'image/jpeg')})
    assert r.status_code == 201
    b = r.json()
    assert b['incident_id'] == inc
    assert b['original_filename'] == 'photo.jpg'
    assert b['file_type'] == 'image'
    assert b['size_bytes'] == len(data)
    assert b['sha256'] == hashlib.sha256(data).hexdigest()
    assert len(b['sha256']) == 64
    assert b['hash_verified'] is False
    assert 'id' in b and 'added_at' in b

def test_upload_png_accepted():
    inc = _make_incident()
    r = client.post(f'/api/v1/incidents/{inc}/evidence', files={'file': ('s.png', io.BytesIO(_png()), 'image/png')})
    assert r.status_code == 201
    assert r.json()['file_type'] == 'image'

def test_upload_gif_accepted():
    inc = _make_incident()
    r = client.post(f'/api/v1/incidents/{inc}/evidence', files={'file': ('a.gif', io.BytesIO(_gif()), 'image/gif')})
    assert r.status_code == 201
    assert r.json()['file_type'] == 'image'

def test_upload_webp_accepted():
    inc = _make_incident()
    r = client.post(f'/api/v1/incidents/{inc}/evidence', files={'file': ('i.webp', io.BytesIO(_webp()), 'image/webp')})
    assert r.status_code == 201
    assert r.json()['file_type'] == 'image'

def test_upload_pdf_accepted():
    inc = _make_incident()
    r = client.post(f'/api/v1/incidents/{inc}/evidence', files={'file': ('r.pdf', io.BytesIO(_pdf()), 'application/pdf')})
    assert r.status_code == 201
    assert r.json()['file_type'] == 'document'

def test_storage_path_not_in_response():
    inc = _make_incident()
    r = client.post(f'/api/v1/incidents/{inc}/evidence', files={'file': ('p.jpg', io.BytesIO(_jpeg()), 'image/jpeg')})
    assert r.status_code == 201
    assert 'storage_filename' not in r.json()
    assert 'storage_path' not in r.json()

def test_storage_filename_is_uuid_not_original(clean_db):
    ev_dir = clean_db
    inc = _make_incident()
    client.post(f'/api/v1/incidents/{inc}/evidence', files={'file': ('../../evil.jpg', io.BytesIO(_jpeg()), 'image/jpeg')})
    stored = list(ev_dir.iterdir())
    assert len(stored) == 1
    assert len(stored[0].stem) == 32
    assert 'evil' not in stored[0].name


# ---------------------------------------------------------------------------
# Upload - error cases
# ---------------------------------------------------------------------------

def test_unsupported_extension_returns_415():
    inc = _make_incident()
    r = client.post(f'/api/v1/incidents/{inc}/evidence', files={'file': ('m.exe', io.BytesIO(b'\x4d\x5a'), 'application/octet-stream')})
    assert r.status_code == 415
    assert 'not supported' in r.json()['detail'].lower()

def test_mp4_extension_returns_415():
    inc = _make_incident()
    r = client.post(f'/api/v1/incidents/{inc}/evidence', files={'file': ('v.mp4', io.BytesIO(b'\x00'*100), 'video/mp4')})
    assert r.status_code == 415

def test_content_extension_mismatch_returns_415():
    # PDF bytes (document) in a .jpg (image/jpeg) extension must be rejected.
    inc = _make_incident()
    r = client.post(f'/api/v1/incidents/{inc}/evidence', files={'file': ('t.jpg', io.BytesIO(_pdf()), 'image/jpeg')})
    assert r.status_code == 415
    assert 'content does not match' in r.json()['detail'].lower()

def test_pdf_bytes_in_jpg_extension_rejected():
    inc = _make_incident()
    r = client.post(f'/api/v1/incidents/{inc}/evidence', files={'file': ('d.jpg', io.BytesIO(_pdf()), 'image/jpeg')})
    assert r.status_code == 415

def test_png_bytes_in_jpg_extension_rejected():
    """PNG magic bytes with a .jpg extension must be rejected (per-format check)."""
    inc = _make_incident()
    r = client.post(f'/api/v1/incidents/{inc}/evidence', files={'file': ('photo.jpg', io.BytesIO(_png()), 'image/jpeg')})
    assert r.status_code == 415
    assert 'content does not match' in r.json()['detail'].lower()

def test_pdf_bytes_in_png_extension_rejected():
    """PDF bytes with a .png extension must be rejected."""
    inc = _make_incident()
    r = client.post(f'/api/v1/incidents/{inc}/evidence', files={'file': ('doc.png', io.BytesIO(_pdf()), 'image/png')})
    assert r.status_code == 415

def test_jpeg_bytes_in_png_extension_rejected():
    """JPEG bytes with a .png extension must be rejected."""
    inc = _make_incident()
    r = client.post(f'/api/v1/incidents/{inc}/evidence', files={'file': ('img.png', io.BytesIO(_jpeg()), 'image/png')})
    assert r.status_code == 415

def test_random_bytes_in_jpg_extension_rejected():
    """Arbitrary/malformed bytes with a .jpg extension must be rejected."""
    inc = _make_incident()
    r = client.post(f'/api/v1/incidents/{inc}/evidence', files={'file': ('bad.jpg', io.BytesIO(b'\x00' * 64), 'image/jpeg')})
    assert r.status_code == 415

def test_file_too_large_returns_413():
    inc = _make_incident()
    large = _jpeg() + b'\x00' * (10*1024*1024)
    r = client.post(f'/api/v1/incidents/{inc}/evidence', files={'file': ('b.jpg', io.BytesIO(large), 'image/jpeg')})
    assert r.status_code == 413
    assert '10 MB' in r.json()['detail']

def test_upload_to_nonexistent_incident_returns_404():
    r = client.post('/api/v1/incidents/99999/evidence', files={'file': ('p.jpg', io.BytesIO(_jpeg()), 'image/jpeg')})
    assert r.status_code == 404
    assert '99999' in r.json()['detail']


# ---------------------------------------------------------------------------
# List evidence
# ---------------------------------------------------------------------------

def test_list_evidence_empty():
    inc = _make_incident()
    assert client.get(f'/api/v1/incidents/{inc}/evidence').json() == []

def test_list_evidence_returns_all_uploaded():
    inc = _make_incident()
    for i in range(3):
        client.post(f'/api/v1/incidents/{inc}/evidence', files={'file': (f'p{i}.jpg', io.BytesIO(_jpeg(f'img{i}'.encode())), 'image/jpeg')})
    items = client.get(f'/api/v1/incidents/{inc}/evidence').json()
    assert len(items) == 3
    assert all(x['incident_id'] == inc for x in items)

def test_list_evidence_nonexistent_incident_returns_404():
    assert client.get('/api/v1/incidents/99999/evidence').status_code == 404

def test_evidence_scoped_to_incident():
    inc_a = _make_incident('A', 'stalking')
    inc_b = _make_incident('B', 'theft')
    client.post(f'/api/v1/incidents/{inc_a}/evidence', files={'file': ('a.jpg', io.BytesIO(_jpeg()), 'image/jpeg')})
    assert client.get(f'/api/v1/incidents/{inc_b}/evidence').json() == []


# ---------------------------------------------------------------------------
# SHA-256 Verification
# ---------------------------------------------------------------------------

def test_verify_intact_file_returns_match_true():
    inc = _make_incident()
    data = _jpeg(b'authentic')
    ev_id = _upload(inc, data)
    r = client.get(f'/api/v1/incidents/{inc}/evidence/{ev_id}/verify')
    assert r.status_code == 200
    b = r.json()
    assert b['match'] is True
    assert b['evidence_id'] == ev_id
    assert b['stored_sha256'] == hashlib.sha256(data).hexdigest()
    assert b['computed_sha256'] == b['stored_sha256']

def test_verify_tampered_file_returns_match_false(clean_db):
    ev_dir = clean_db
    inc = _make_incident()
    data = _jpeg(b'real')
    ev_id = _upload(inc, data)
    list(ev_dir.iterdir())[0].write_bytes(b'\xff\xd8\xff' + b'tampered')
    r = client.get(f'/api/v1/incidents/{inc}/evidence/{ev_id}/verify')
    assert r.status_code == 200
    b = r.json()
    assert b['match'] is False
    assert b['stored_sha256'] != b['computed_sha256']
    assert b['stored_sha256'] == hashlib.sha256(data).hexdigest()

def test_verify_missing_stored_file_returns_409(clean_db):
    ev_dir = clean_db
    inc = _make_incident()
    ev_id = _upload(inc, _jpeg())
    for f in ev_dir.iterdir(): f.unlink()
    r = client.get(f'/api/v1/incidents/{inc}/evidence/{ev_id}/verify')
    assert r.status_code == 409
    assert 'missing' in r.json()['detail'].lower()

def test_verify_nonexistent_evidence_returns_404():
    inc = _make_incident()
    assert client.get(f'/api/v1/incidents/{inc}/evidence/99999/verify').status_code == 404

def test_verify_evidence_from_wrong_incident_returns_404():
    inc_a = _make_incident('A', 'harassment')
    inc_b = _make_incident('B', 'theft')
    ev_id = _upload(inc_a, _jpeg())
    assert client.get(f'/api/v1/incidents/{inc_b}/evidence/{ev_id}/verify').status_code == 404

def test_verify_updates_hash_verified_flag():
    inc = _make_incident()
    ev_id = _upload(inc, _jpeg(b'flag'))
    assert client.get(f'/api/v1/incidents/{inc}/evidence').json()[0]['hash_verified'] is False
    client.get(f'/api/v1/incidents/{inc}/evidence/{ev_id}/verify')
    assert client.get(f'/api/v1/incidents/{inc}/evidence').json()[0]['hash_verified'] is True
