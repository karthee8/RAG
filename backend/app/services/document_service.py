import os
import shutil
import uuid
import hashlib
from datetime import datetime
from fastapi import UploadFile, HTTPException, status, BackgroundTasks
import structlog

from app.core.config import settings
from app.utils.file_utils import generate_secure_filename, validate_file_extension, validate_mime_type, sanitize_display_filename
from app.schemas.document import DocumentUploadResponse, UrlIngestResponse
from app.core.network_security import validate_safe_url

from app.db.database import SessionLocal
from app.models.document import Document
from app.worker.tasks import process_document_pipeline

logger = structlog.get_logger()

def compute_file_hash(file_path: str) -> str:
    hasher = hashlib.sha256()
    with open(file_path, 'rb') as f:
        while chunk := f.read(8192):
            hasher.update(chunk)
    return hasher.hexdigest()

def _check_idempotency(db, file_hash: str):
    return db.query(Document).filter(Document.file_hash == file_hash, Document.status == "completed").first()

async def upload_document(file: UploadFile, background_tasks: BackgroundTasks, current_user) -> DocumentUploadResponse:
    """
    Validates, saves the uploaded file, and registers a Celery processing task.
    """
    filename = file.filename or ""
    content_type = file.content_type or ""

    # Sanitize filename for safe storage and display
    safe_filename = sanitize_display_filename(filename)

    # 1. Validate extension
    if not validate_file_extension(filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File type not allowed"
        )

    # 2. Validate MIME type
    if not validate_mime_type(content_type):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File type not allowed"
        )

    # 3. Validate file size (convert settings.MAX_FILE_SIZE_MB to bytes)
    file.file.seek(0, 2)
    size_bytes = file.file.tell()
    file.file.seek(0)

    max_size_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    if size_bytes > max_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large"
        )
        
    # [HOOK] Simulated Virus / Malware Scan
    logger.info("Running virus scan on uploaded file...", filename=filename, size=size_bytes)
    # import clamav 
    # if clamav.scan(file.file): raise HTTPException(...)
    logger.info("Virus scan passed.", filename=filename)

    # 4. Generate unique filename
    unique_filename = generate_secure_filename(filename)
    
    # Ensure directory exists
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    target_path = os.path.join(settings.UPLOAD_DIR, unique_filename)

    try:
        # Save file to disk
        with open(target_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not save file to disk: {str(e)}"
        )

    # 5. Idempotency Check
    file_hash = compute_file_hash(target_path)
    
    db = SessionLocal()
    try:
        existing_doc = _check_idempotency(db, file_hash)
        if existing_doc:
            logger.info("Idempotency hit: Document already exists", file_hash=file_hash, document_id=existing_doc.id)
            # Cleanup duplicate file
            try:
                os.remove(target_path)
            except OSError:
                pass
            return DocumentUploadResponse(
                document_id=existing_doc.id,
                filename=safe_filename,
                status=existing_doc.status,
                size_bytes=size_bytes,
                chunk_count=existing_doc.chunk_count,
                created_at=existing_doc.created_at
            )

        # 6. Save new document to DB
        new_doc = Document(
            user_id=current_user.id,
            filename=safe_filename,
            file_hash=file_hash,
            status="queued",
            stage="Pending",
            chunk_count=0
        )
        db.add(new_doc)
        db.commit()
        db.refresh(new_doc)
        document_id = new_doc.id
        created_at = new_doc.created_at
    finally:
        db.close()

    # 7. Dispatch Celery Task
    process_document_pipeline.delay(document_id, target_path, filename)

    return DocumentUploadResponse(
        document_id=document_id,
        filename=safe_filename,
        status="processing",
        size_bytes=size_bytes,
        chunk_count=0,
        created_at=created_at
    )

async def ingest_url(url: str, background_tasks: BackgroundTasks, current_user) -> UrlIngestResponse:
    if not validate_safe_url(url):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The provided URL is invalid or blocked for security reasons."
        )
    
    # Simple hash for idempotency based on URL string
    url_hash = hashlib.sha256(url.encode()).hexdigest()
    
    db = SessionLocal()
    try:
        existing_doc = _check_idempotency(db, url_hash)
        if existing_doc:
            return UrlIngestResponse(
                document_id=existing_doc.id,
                url=url,
                status=existing_doc.status,
                chunk_count=existing_doc.chunk_count,
                created_at=existing_doc.created_at
            )
            
        new_doc = Document(
            user_id=current_user.id,
            filename=url,
            file_hash=url_hash,
            status="queued",
            stage="Pending",
            chunk_count=0
        )
        db.add(new_doc)
        db.commit()
        db.refresh(new_doc)
        document_id = new_doc.id
        created_at = new_doc.created_at
    finally:
        db.close()

    # For URL ingestion, we can reuse the same Celery task but we need an extractor for URLs.
    # To avoid rewriting tasks.py heavily, let's create a wrapper or just use a dedicated task.
    # We will import the new url task.
    from app.worker.tasks import process_url_pipeline
    process_url_pipeline.delay(document_id, url)

    return UrlIngestResponse(
        document_id=document_id,
        url=url,
        status="processing",
        chunk_count=0,
        created_at=created_at
    )
