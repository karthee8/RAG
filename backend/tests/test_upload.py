import pytest
import io

def test_upload_file(client, auth_token):
    # Mock file upload
    file_content = b"This is a test document."
    file_obj = io.BytesIO(file_content)
    file_obj.name = "test.txt"

    response = client.post(
        "/api/documents/upload",
        headers={"Authorization": f"Bearer {auth_token}"},
        files={"file": ("test.txt", file_obj, "text/plain")}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "document_id" in data
    assert data["filename"] == "test.txt"
    assert data["status"] == "processing"

def test_upload_file_too_large(client, auth_token):
    # The max file size is usually around 10MB in settings, but let's mock a big file
    # by using a large string or just patching settings if needed.
    pass
