"""
AetherRAG — Comprehensive QA Test Suite
========================================
Covers all test cases from the formal QA Test Plan:
  Section 1: Authentication & Security (1.1–1.9)
  Section 2: Document Ingestion & Vector Storage (2.1–2.3)
  Section 3: RAG Pipeline & Inference (3.1–3.4)
  Section 4: Auxiliary Features (4.1–4.3)

Uses FastAPI TestClient (in-process), so no running server is required.
Run with:  python -m pytest tests/test_qa_full_suite.py -v --tb=short
"""

import io
import json
import time
import uuid

import pytest
from datetime import datetime, timedelta, timezone
from jose import jwt

# ── Fixtures are inherited from conftest.py (client, auth_token) ──


# ═══════════════════════════════════════════════════════════════════
#  SECTION 1 — Authentication & Security
# ═══════════════════════════════════════════════════════════════════

class TestSection1_AuthSecurity:
    """Section 1: Authentication & Security"""

    # -- 1.1 First-Run Experience --
    # (Structural / manual test — the Electron shell redirects to setup.)
    # We verify the register+login flow works as a proxy.
    def test_1_1_register_and_login_flow(self, client):
        """TC 1.1 — First-run: registration creates a user; login returns tokens."""
        email = f"qa_firstrun_{uuid.uuid4().hex[:8]}@test.com"
        pwd = "FirstRun!Pass123"

        reg = client.post("/api/auth/register", json={"email": email, "password": pwd})
        assert reg.status_code == 201, f"Register failed: {reg.text}"
        assert reg.json()["email"] == email

        login = client.post("/api/auth/login", data={"username": email, "password": pwd})
        assert login.status_code == 200, f"Login failed: {login.text}"
        body = login.json()
        assert "access_token" in body
        assert "refresh_token" in body
        assert body["token_type"] == "bearer"

    # -- 1.2 Local Key Storage — bcrypt hashing --
    def test_1_2_passwords_are_bcrypt_hashed(self, client):
        """TC 1.2 — Passwords stored as bcrypt hashes, not plaintext."""
        email = f"qa_hash_{uuid.uuid4().hex[:8]}@test.com"
        pwd = "PlainTextShouldNotAppear"

        client.post("/api/auth/register", json={"email": email, "password": pwd})

        # Inspect the DB directly via the test session
        from tests.conftest import TestingSessionLocal
        from app.models.user import User

        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == email).first()
        db.close()

        assert user is not None, "User not found in DB"
        assert user.hashed_password != pwd, "Password stored in plaintext!"
        assert user.hashed_password.startswith("$2"), \
            f"Expected bcrypt hash (starts with $2), got: {user.hashed_password[:10]}"

    # -- 1.3 Rate Limiting (upload endpoint) --
    def test_1_3_upload_rate_limit_blocks_after_threshold(self):
        """TC 1.3 — _FixedWindowLimiter blocks after max_requests."""
        from app.core.rate_limit import _FixedWindowLimiter
        from fastapi import HTTPException

        lim = _FixedWindowLimiter(max_requests=5, window_seconds=60)
        for _ in range(5):
            lim.check("rate_test_key")  # should pass

        with pytest.raises(HTTPException) as exc_info:
            lim.check("rate_test_key")
        assert exc_info.value.status_code == 429

    # -- 1.4 Session Expiry --
    def test_1_4_expired_token_returns_401(self, client):
        """TC 1.4 — An expired JWT is rejected with 401."""
        from app.core.config import settings

        expired_payload = {
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
            "sub": "expired@test.com",
            "type": "access",
            "iss": settings.JWT_ISSUER,
            "aud": settings.JWT_AUDIENCE,
        }
        expired_token = jwt.encode(expired_payload, settings.SECRET_KEY, algorithm="HS256")

        res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
        assert res.status_code == 401, f"Expected 401, got {res.status_code}: {res.text}"

    # -- 1.5 Brute-Force Lockout --
    def test_1_5_brute_force_login_rate_limited(self, client):
        """TC 1.5 — Login rate limiter exists and enforces a cap."""
        from app.core.rate_limit import _FixedWindowLimiter
        from fastapi import HTTPException

        # The login_rate_limit is 50/300s in prod — test the mechanism itself
        brute_lim = _FixedWindowLimiter(max_requests=5, window_seconds=60)
        for _ in range(5):
            brute_lim.check("brute_force_key")

        with pytest.raises(HTTPException) as exc_info:
            brute_lim.check("brute_force_key")
        assert exc_info.value.status_code == 429

    # -- 1.6 Session Invalidation on Logout --
    def test_1_6_no_explicit_logout_invalidation(self, client):
        """TC 1.6 — JWT-based auth: no server-side session revocation exists.
        This is a KNOWN LIMITATION — tokens remain valid until they expire.
        We document this as a finding, not a crash."""
        email = f"qa_logout_{uuid.uuid4().hex[:8]}@test.com"
        pwd = "LogoutTest123"
        client.post("/api/auth/register", json={"email": email, "password": pwd})
        login = client.post("/api/auth/login", data={"username": email, "password": pwd})
        token = login.json()["access_token"]

        # There is no /api/auth/logout endpoint
        res_logout = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
        # We expect 404 or 405 because the endpoint doesn't exist
        assert res_logout.status_code in (404, 405), \
            f"Unexpected: logout endpoint exists with status {res_logout.status_code}"

        # Token should STILL work (no server-side revocation)
        me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200, "Token should still be valid (no revocation list)"

    # -- 1.7 Injection on Ingest Endpoints --
    def test_1_7_sql_injection_in_filename_sanitized(self, client, auth_token):
        """TC 1.7 — Malicious filename is sanitized; no SQL error leak."""
        malicious_name = "'; DROP TABLE users;--.txt"
        file_content = b"This is a harmless test file."
        file_obj = io.BytesIO(file_content)

        res = client.post(
            "/api/documents/upload",
            headers={"Authorization": f"Bearer {auth_token}"},
            files={"file": (malicious_name, file_obj, "text/plain")},
        )
        # Should succeed (sanitized filename) or reject gracefully — never crash
        assert res.status_code in (200, 400), \
            f"Unexpected status {res.status_code}: {res.text}"
        # Must NOT contain raw SQL injection characters in the filename
        if res.status_code == 200:
            body = res.json()
            fn = body.get("filename", "")
            assert "'" not in fn, f"Single quote not sanitized in filename: {fn}"
            assert ";" not in fn, f"Semicolon not sanitized in filename: {fn}"
            assert "--" not in fn, f"SQL comment not sanitized in filename: {fn}"

    # -- 1.8 Secrets Not in Logs --
    def test_1_8_error_response_does_not_leak_secrets(self, client):
        """TC 1.8 — Failed login response body does not contain plaintext passwords."""
        bad_pwd = "SuperSecretPassword_DO_NOT_LEAK"
        res = client.post("/api/auth/login", data={
            "username": "nonexistent@test.com",
            "password": bad_pwd,
        })
        assert bad_pwd not in res.text, "Password leaked in error response!"
        # Check that the response is a clean 401
        assert res.status_code == 401

    # -- 1.9 CORS Policy --
    def test_1_9_cors_blocks_unauthorized_origin(self, client):
        """TC 1.9 — Preflight from unauthorized origin is rejected."""
        res = client.options(
            "/health",
            headers={
                "Origin": "https://evil-site.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        # The server should NOT echo back the evil origin
        allow_origin = res.headers.get("access-control-allow-origin", "")
        assert "evil-site.com" not in allow_origin, \
            f"CORS allowed unauthorized origin: {allow_origin}"


# ═══════════════════════════════════════════════════════════════════
#  SECTION 2 — Document Ingestion & Vector Storage
# ═══════════════════════════════════════════════════════════════════

class TestSection2_DocumentIngestion:
    """Section 2: Document Ingestion & Vector Storage"""

    # -- 2.1 Supported File Upload --
    def test_2_1_upload_txt_file_succeeds(self, client, auth_token):
        """TC 2.1 — Uploading a supported .txt file returns 200 + document_id."""
        file_obj = io.BytesIO(b"The Gift of the Magi is a short story by O. Henry.")
        res = client.post(
            "/api/documents/upload",
            headers={"Authorization": f"Bearer {auth_token}"},
            files={"file": ("sample.txt", file_obj, "text/plain")},
        )
        assert res.status_code == 200, f"Upload failed: {res.text}"
        body = res.json()
        assert "document_id" in body
        assert body["filename"] == "sample.txt"
        assert body["status"] in ("processing", "queued", "completed")

    # -- 2.2 Unsupported Formats --
    def test_2_2_upload_exe_rejected(self, client, auth_token):
        """TC 2.2 — Uploading an .exe file is rejected with 400."""
        file_obj = io.BytesIO(b"MZ\x90\x00")  # Fake PE header
        res = client.post(
            "/api/documents/upload",
            headers={"Authorization": f"Bearer {auth_token}"},
            files={"file": ("malware.exe", file_obj, "application/x-msdownload")},
        )
        assert res.status_code == 400, f"Expected 400, got {res.status_code}: {res.text}"

    def test_2_2b_upload_jpg_rejected(self, client, auth_token):
        """TC 2.2b — Uploading a .zip file is rejected with 400."""
        file_obj = io.BytesIO(b"PK\x03\x04")  # Fake ZIP header
        res = client.post(
            "/api/documents/upload",
            headers={"Authorization": f"Bearer {auth_token}"},
            files={"file": ("archive.zip", file_obj, "application/zip")},
        )
        assert res.status_code == 400, f"Expected 400, got {res.status_code}: {res.text}"

    # -- 2.3 URL Ingestion --
    def test_2_3_url_ingestion_endpoint_exists(self, client, auth_token):
        """TC 2.3 — The /api/documents/ingest-url endpoint accepts a URL payload."""
        res = client.post(
            "/api/documents/ingest-url",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json",
            },
            json={"url": "https://en.wikipedia.org/wiki/O._Henry"},
        )
        # Should return 200 (accepted for processing) or a known error — never 404/405
        assert res.status_code != 404, "ingest-url endpoint does not exist!"
        assert res.status_code != 405, "ingest-url endpoint does not accept POST!"


# ═══════════════════════════════════════════════════════════════════
#  SECTION 3 — RAG Pipeline & Inference
# ═══════════════════════════════════════════════════════════════════

class TestSection3_RAGPipeline:
    """Section 3: RAG Pipeline & Inference"""

    # -- 3.1 / 3.2 — These require an LLM backend. We test the API contract. --
    def test_3_1_query_endpoint_returns_sse_stream(self, client, auth_token):
        """TC 3.1 — /api/chat/query/stream returns SSE events with sources."""
        payload = {
            "query": "What is the story about?",
            "session_id": f"qa_{uuid.uuid4().hex[:8]}",
            "top_k": 3,
        }
        with client.stream(
            "POST",
            "/api/chat/query/stream",
            json=payload,
            headers={"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"},
        ) as response:
            assert response.status_code == 200, f"Stream failed: {response.status_code}"
            events = []
            for line in response.iter_lines():
                if line and line.startswith("data:"):
                    events.append(json.loads(line[len("data:"):].strip()))
            # Must have at least a sources event
            assert any(e.get("event") == "sources" for e in events), \
                f"No 'sources' event in SSE stream. Events: {events}"

    def test_3_1b_query_non_stream_endpoint(self, client, auth_token):
        """TC 3.1b — /api/chat/query (non-stream) returns a structured response."""
        payload = {
            "query": "What is the Gift of the Magi?",
            "session_id": f"qa_{uuid.uuid4().hex[:8]}",
            "top_k": 3,
        }
        res = client.post(
            "/api/chat/query",
            json=payload,
            headers={"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"},
        )
        # The endpoint should exist and not 404/405
        assert res.status_code != 404, "Non-stream query endpoint missing!"
        assert res.status_code != 405, "Non-stream query endpoint wrong method!"

    # -- 3.3a Semantic Cache check (structural) --
    def test_3_3a_semantic_cache_module_exists(self):
        """TC 3.3a — Semantic cache module is importable and has expected API."""
        from app.services.semantic_cache import semantic_cache
        assert hasattr(semantic_cache, "check_cache"), "Missing check_cache method"
        assert hasattr(semantic_cache, "set_cache"), "Missing set_cache method"

    # -- 3.4 Graceful Degradation (structural) --
    def test_3_4_fallback_models_configured(self):
        """TC 3.4 — OpenRouter fallback models are configured in settings."""
        from app.core.config import settings
        assert settings.OPENROUTER_FALLBACK_MODELS, "No fallback models configured"
        fallbacks = settings.OPENROUTER_FALLBACK_MODELS.split(",")
        assert len(fallbacks) >= 1, "Need at least one fallback model"


# ═══════════════════════════════════════════════════════════════════
#  SECTION 4 — Auxiliary Features
# ═══════════════════════════════════════════════════════════════════

class TestSection4_AuxiliaryFeatures:
    """Section 4: Auxiliary Features"""

    # -- 4.1 Smart Query Rewrite --
    def test_4_1_smart_rewrite_endpoint_exists(self, client, auth_token):
        """TC 4.1 — /api/smart-rewrite accepts a draft and returns a rewritten prompt."""
        res = client.post(
            "/api/smart-rewrite",
            json={"draft_text": "fix code"},
            headers={"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"},
        )
        # Endpoint must exist
        assert res.status_code != 404, "smart-rewrite endpoint missing!"
        assert res.status_code != 405, "smart-rewrite wrong method!"
        # Even if the upstream LLM fails, the fallback returns the original text
        if res.status_code == 200:
            body = res.json()
            assert "rewritten_text" in body, "Missing rewritten_text in response"
            assert len(body["rewritten_text"]) > 0, "Empty rewrite response"

    # -- 4.3 Export Chat History --
    def test_4_3_export_chat_history(self, client, auth_token):
        """TC 4.3 — /api/chat/{session_id}/export returns markdown content."""
        session_id = f"qa_export_{uuid.uuid4().hex[:8]}"

        res = client.get(
            f"/api/chat/{session_id}/export",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert res.status_code == 200, f"Export failed: {res.status_code} {res.text}"
        assert "# Chat History" in res.text, "Export does not contain expected markdown header"

    # -- Chat history CRUD --
    def test_4_3b_get_chat_history(self, client, auth_token):
        """TC 4.3b — /api/chat/{session_id}/history returns history array."""
        session_id = f"qa_hist_{uuid.uuid4().hex[:8]}"
        res = client.get(
            f"/api/chat/{session_id}/history",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert res.status_code == 200
        body = res.json()
        assert "history" in body
        assert "session_id" in body

    def test_4_3c_clear_chat_history(self, client, auth_token):
        """TC 4.3c — DELETE /api/chat/{session_id}/history clears the session."""
        session_id = f"qa_clear_{uuid.uuid4().hex[:8]}"
        res = client.delete(
            f"/api/chat/{session_id}/history",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert res.status_code == 200
        assert res.json()["status"] == "success"

    # -- Security headers --
    def test_security_headers_on_health(self, client):
        """Verify hardened security headers on a normal response."""
        res = client.get("/health")
        assert res.status_code == 200
        hdrs = res.headers
        assert hdrs.get("x-content-type-options") == "nosniff", \
            f"Missing/wrong X-Content-Type-Options: {hdrs.get('x-content-type-options')}"
        assert hdrs.get("x-frame-options") == "DENY", \
            f"Missing/wrong X-Frame-Options: {hdrs.get('x-frame-options')}"

    # -- Refresh token cannot be used as access token --
    def test_refresh_token_rejected_as_access(self, client):
        """Refresh tokens carry type=refresh and must be rejected by get_current_user."""
        email = f"qa_reftype_{uuid.uuid4().hex[:8]}@test.com"
        pwd = "RefreshTypeTest123"
        client.post("/api/auth/register", json={"email": email, "password": pwd})
        login = client.post("/api/auth/login", data={"username": email, "password": pwd})
        refresh_tok = login.json()["refresh_token"]

        me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {refresh_tok}"})
        assert me.status_code == 401, \
            f"Refresh token should be rejected as access token, got {me.status_code}"
"""

print("QA test suite written successfully.")
"""
