import time
import uuid
from locust import HttpUser, task, between

class RAGUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self):
        """Register and login to get an access token before running tasks."""
        self.email = f"loadtest_{uuid.uuid4().hex[:8]}@example.com"
        self.password = "loadtestpass"
        
        # Register
        self.client.post("/api/auth/register", json={
            "email": self.email,
            "password": self.password
        })
        
        # Login
        res = self.client.post("/api/auth/login", data={
            "username": self.email,
            "password": self.password
        })
        
        if res.status_code == 200:
            self.token = res.json().get("access_token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            self.token = None
            self.headers = {}

    @task(3)
    def query_rag_stream(self):
        """Simulate sending a streaming query."""
        if not self.token:
            return
            
        payload = {
            "query": "What are the capabilities of the system?",
            "session_id": "loadtest_session",
            "top_k": 3
        }
        
        with self.client.post("/api/chat/query/stream", json=payload, headers=self.headers, stream=True, catch_response=True) as response:
            if response.status_code == 200:
                # Consume stream
                for line in response.iter_lines():
                    pass
                response.success()
            else:
                response.failure(f"Failed with status {response.status_code}")

    @task(1)
    def check_health(self):
        self.client.get("/health/live")
