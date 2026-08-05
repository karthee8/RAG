import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Text

from app.db.database import Base

class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, index=True, default=lambda: f"doc_{uuid.uuid4().hex[:8]}")
    user_id = Column(String, index=True, nullable=False, default="system")
    filename = Column(String, nullable=False)
    file_hash = Column(String, index=True, nullable=True)  # For idempotency checks
    
    # Statuses: queued, extracting, chunking, embedding, ready, failed
    status = Column(String, default="queued")
    stage = Column(String, default="Pending")
    
    chunk_count = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
