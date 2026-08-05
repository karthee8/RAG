from fastapi import APIRouter, File, UploadFile, BackgroundTasks, HTTPException, Depends
from fastapi.responses import FileResponse, StreamingResponse
from app.schemas.document import DocumentUploadResponse, DocumentStatusResponse, UrlIngestRequest, UrlIngestResponse
from app.services.document_service import upload_document, ingest_url
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/documents", tags=["documents"])

from fastapi import Request
from app.core.rate_limit import limiter

@router.post("/upload", response_model=DocumentUploadResponse)
@limiter.limit("5/minute")
async def upload_file(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
) -> DocumentUploadResponse:
    """
    Endpoint to upload a file (PDF, TXT, DOCX).
    Enforces format constraints and size limits, then starts background processing.
    """
    return await upload_document(file, background_tasks, current_user)

@router.get("/{document_id}/status", response_model=DocumentStatusResponse)
async def get_document_status(
    document_id: str,
    current_user: User = Depends(get_current_user)
) -> DocumentStatusResponse:
    """
    Checks the status of a document from the database.
    """
    from app.db.database import SessionLocal
    from app.models.document import Document
    
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == document_id, Document.user_id == current_user.id).first()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        return DocumentStatusResponse(
            document_id=doc.id,
            filename=doc.filename,
            status=doc.status,
            stage=doc.stage,
            chunk_count=doc.chunk_count,
            error=doc.error_message
        )
    finally:
        db.close()

@router.post("/ingest-url", response_model=UrlIngestResponse)
@limiter.limit("10/minute")
async def ingest_url_endpoint(
    request: Request,
    url_request: UrlIngestRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
) -> UrlIngestResponse:
    """
    Endpoint to ingest a URL (standard webpage or YouTube video).
    Starts background processing.
    """
    return await ingest_url(url_request.url, background_tasks, current_user)

@router.get("/{document_id}/progress")
async def get_document_progress(
    document_id: str,
    current_user: User = Depends(get_current_user)
):
    import asyncio
    import json
    from app.db.database import SessionLocal
    from app.models.document import Document
    
    async def event_generator():
        last_stage = None
        db = SessionLocal()
        try:
            while True:
                db.expire_all() # Ensure we get fresh data
                doc = db.query(Document).filter(Document.id == document_id, Document.user_id == current_user.id).first()
                if not doc:
                    yield f"data: {json.dumps({'error': 'Document not found'})}\n\n"
                    break
                    
                current_stage = doc.stage
                status_val = doc.status
                
                if current_stage != last_stage or status_val in ("completed", "failed"):
                    yield f"data: {json.dumps({'status': status_val, 'stage': current_stage, 'chunk_count': doc.chunk_count, 'error': doc.error_message})}\n\n"
                    last_stage = current_stage
                    
                if status_val in ("completed", "failed"):
                    break
                    
                await asyncio.sleep(0.5)
        finally:
            db.close()
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.get("/{document_id}/briefing")
async def get_document_briefing(
    document_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Generates a podcast-style audio summary of the document using LLM and TTS.
    Returns the MP3 audio file.
    """
    import os
    from app.rag.vector_store import _vector_store
    
    # 1. Reconstruct text from chunks
    try:
        results = _vector_store.table.search().where(f"document_id = '{document_id}' AND user_id = '{current_user.id}'").limit(100).to_arrow().to_pylist()
        if not results:
            raise HTTPException(status_code=404, detail="Document chunks not found")
            
        import json
        # Sort by chunk index to keep order
        results.sort(key=lambda x: json.loads(x["metadata"]).get("chunk_index", 0))
        text = "\n\n".join([r["text"] for r in results])
        
        # 2. Generate Audio
        from app.services.audio_service import generate_podcast_briefing
        from app.core.config import settings
        
        output_dir = os.path.join(settings.UPLOAD_DIR, "audio_briefings")
        mp3_path = await generate_podcast_briefing(text, output_dir)
        
        return FileResponse(mp3_path, media_type="audio/mpeg", filename=f"briefing_{document_id}.mp3")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{document_id}/content")
async def get_document_content(
    document_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Reconstructs and returns the full text of a document from its vector chunks.
    This serves as the 'cached snapshot' or 'transcript preview' in the frontend.
    """
    from app.rag.vector_store import _vector_store
    
    try:
        results = _vector_store.table.search().where(f"document_id = '{document_id}' AND user_id = '{current_user.id}'").limit(10000).to_arrow().to_pylist()
        if not results:
            raise HTTPException(status_code=404, detail="Document content not found")
            
        import json
        # Sort chunks back into original order
        results.sort(key=lambda x: json.loads(x["metadata"]).get("chunk_index", 0))
        text = "\n\n".join([r["text"] for r in results])
        
        return {"document_id": document_id, "content": text}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch content: {str(e)}")

@router.delete("/{document_id}")
async def delete_document_endpoint(
    document_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Deletes a document and all its chunks from the vector store and PostgreSQL.
    """
    from app.rag.vector_store import delete_document
    from app.db.database import SessionLocal
    from app.models.document import Document
    
    db = SessionLocal()
    try:
        # Check ownership first
        doc = db.query(Document).filter(Document.id == document_id, Document.user_id == current_user.id).first()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
            
        # Delete from Vector Store
        delete_document(document_id, user_id=current_user.id)
        
        # Delete from PostgreSQL
        db.delete(doc)
        db.commit()
            
        return {"status": "success", "message": f"Document {document_id} deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()
