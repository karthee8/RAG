from datetime import datetime
from pydantic import BaseModel, ConfigDict

class DocumentUploadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    document_id: str
    filename: str
    status: str
    size_bytes: int
    chunk_count: int = 0
    created_at: datetime

class ChunkMetadata(BaseModel):
    source: str
    page: int
    chunk_index: int
    document_id: str
    user_id: str = ""
    timestamp: float = 0.0

class ChunkSchema(BaseModel):
    chunk_id: str
    text: str
    metadata: ChunkMetadata

class RetrievedChunk(BaseModel):
    chunk_id: str
    text: str
    metadata: ChunkMetadata
    score: float

class DocumentStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    document_id: str
    filename: str
    status: str
    stage: str | None = None
    chunk_count: int
    error: str | None = None


from pydantic import Field
class UrlIngestRequest(BaseModel):
    url: str = Field(..., max_length=1000)

class UrlIngestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    document_id: str
    url: str
    status: str
    chunk_count: int = 0
    created_at: datetime
