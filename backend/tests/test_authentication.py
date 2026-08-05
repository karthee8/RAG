import pytest
import uuid

def test_access_protected_route_without_auth(client):
    response = client.get("/api/chat/sess_test/history")
    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated"

def test_register_new_user(client):
    email = f"auth_test_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "securepassword123"
    
    # Register
    reg_payload = {"email": email, "password": pwd}
    response_reg = client.post("/api/auth/register", json=reg_payload)
    assert response_reg.status_code == 201
    assert response_reg.json()["email"] == email
    assert "id" in response_reg.json()

    # Duplicate registration
    response_dup = client.post("/api/auth/register", json=reg_payload)
    assert response_dup.status_code == 400

    # Login
    login_data = {"username": email, "password": pwd}
    response_login = client.post("/api/auth/login", data=login_data)
    assert response_login.status_code == 200
    token_info = response_login.json()
    assert "access_token" in token_info
    assert "refresh_token" in token_info

    # Access protected route
    token = token_info["access_token"]
    response_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response_me.status_code == 200
    assert response_me.json()["email"] == email

def test_refresh_token(client, auth_token):
    # We don't have the refresh token in auth_token fixture, so let's do a full login
    email = f"refresh_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "testpassword123"
    client.post("/api/auth/register", json={"email": email, "password": pwd})
    response_login = client.post("/api/auth/login", data={"username": email, "password": pwd})
    
    refresh_token = response_login.json()["refresh_token"]
    
    response_refresh = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert response_refresh.status_code == 200
    assert "access_token" in response_refresh.json()
    assert "refresh_token" in response_refresh.json()
