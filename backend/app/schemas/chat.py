from pydantic import BaseModel, Field

class ChatRequest(BaseModel):
    query: str = Field(..., max_length=2000)
    session_id: str
    top_k: int = Field(default=5, ge=1, le=20)
    document_id: str | None = None
    model: str | None = None

class ChatSource(BaseModel):
    chunk_id: str
    source: str
    page: int
    score: float
    # The actual retrieved passage, so the UI can show a real citation excerpt
    # rather than a synthetic "Source X, Page Y" string.
    text: str = ""

class ChatResponse(BaseModel):
    answer: str
    sources: list[ChatSource]
    session_id: str
    latency_ms: int

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatHistoryResponse(BaseModel):
    session_id: str
    history: list[ChatMessage]
