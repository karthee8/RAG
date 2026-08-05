import pytest
import json

def test_chat_query_stream(client, auth_token):
    payload = {
        "query": "hello world",
        "session_id": "test_session",
        "top_k": 2
    }
    headers = {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }

    # TestClient can handle streaming responses
    with client.stream("POST", "/api/chat/query/stream", json=payload, headers=headers) as response:
        assert response.status_code == 200
        
        events = []
        for line in response.iter_lines():
            if line:
                events.append(line)
        
        # In a test environment, if we mock the LLM this would return quickly.
        # Ensure we get at least the 'sources' event
        assert len(events) > 0
        assert "data:" in events[0]
