import structlog
from sqlalchemy.orm import Session

from app.worker.celery_app import celery_app
from app.db.database import SessionLocal
from app.models.document import Document
from app.rag.extractor import extract_text_from_file
from app.rag.chunker import chunk_text
from app.rag.embedder import embed_texts
from app.rag.vector_store import add_chunks

logger = structlog.get_logger()

def update_document_status(db: Session, document_id: str, stage: str = None, status: str = None, chunk_count: int = None, error_message: str = None):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        logger.error("Document not found for status update", document_id=document_id)
        return
    if stage is not None:
        doc.stage = stage
    if status is not None:
        doc.status = status
    if chunk_count is not None:
        doc.chunk_count = chunk_count
    if error_message is not None:
        doc.error_message = error_message
    db.commit()

@celery_app.task(bind=True, autoretry_for=(Exception,), retry_backoff=True, max_retries=3)
def process_document_pipeline(self, document_id: str, file_path: str, original_filename: str):
    logger.info("Starting document processing task", document_id=document_id)
    db = SessionLocal()
    try:
        update_document_status(db, document_id, stage="Extracting Text", status="extracting")
        
        # 1. Text extraction
        text, success = extract_text_from_file(file_path)
        if not success:
            raise Exception("Failed to extract text from document")

        # 2. Chunking
        update_document_status(db, document_id, stage="Chunking Document", status="chunking")
        
        # Fetch user_id for tenant isolation
        doc = db.query(Document).filter(Document.id == document_id).first()
        user_id = doc.user_id if doc else "system"
        
        chunks = chunk_text(text, original_filename, document_id, user_id)
        if not chunks:
            logger.warning("No chunks generated from document", document_id=document_id)
            update_document_status(db, document_id, stage="Completed", status="completed", chunk_count=0)
            return

        # 3. Embeddings
        update_document_status(db, document_id, stage="Generating Embeddings", status="embedding")
        chunk_texts = [c.text for c in chunks]
        embeddings = embed_texts(chunk_texts)

        # 4. Save to LanceDB (or ChromaDB as per user prompt/future config, currently vector_store uses LanceDB)
        update_document_status(db, document_id, stage="Indexing Vector DB", status="embedding")
        add_chunks(chunks, embeddings)
        
        # 5. Extract Graph Entities (Optional/Demo)
        try:
            from app.rag.extractor import extract_graph_entities
            from app.rag.graph_store import add_triplets
            if chunks:
                triplets = extract_graph_entities(chunks[0].text)
                if triplets:
                    add_triplets(triplets, document_id)
        except Exception as e:
            logger.warning("Graph extraction failed during ingestion", error=str(e))

        # Update status to completed
        update_document_status(db, document_id, stage="Completed", status="completed", chunk_count=len(chunks))
        logger.info("Document processed successfully", document_id=document_id, chunk_count=len(chunks))

    except Exception as e:
        logger.error("Error in document processing pipeline", document_id=document_id, error=str(e))
        
        if self.request.retries == self.max_retries:
            # Dead letter logic
            update_document_status(db, document_id, stage="Failed", status="failed", error_message=str(e))
            logger.error("Exhausted retries, marked document as failed", document_id=document_id)
        
        raise  # Re-raise to trigger Celery retry
    finally:
        db.close()

@celery_app.task(bind=True, autoretry_for=(Exception,), retry_backoff=True, max_retries=3)
def process_url_pipeline(self, document_id: str, url: str):
    logger.info("Starting URL processing task", document_id=document_id)
    db = SessionLocal()
    try:
        from app.rag.extractor import extract_youtube, extract_webpage
        update_document_status(db, document_id, stage="Extracting URL Content", status="extracting")
        
        # 1. Text extraction
        if "youtube.com" in url or "youtu.be" in url:
            text, success = extract_youtube(url)
        else:
            text, success = extract_webpage(url)
            
        if not success:
            raise Exception("Failed to extract text from URL")

        # 2. Chunking
        update_document_status(db, document_id, stage="Chunking URL Content", status="chunking")
        
        doc = db.query(Document).filter(Document.id == document_id).first()
        user_id = doc.user_id if doc else "system"
        
        chunks = chunk_text(text, url, document_id, user_id)
        if not chunks:
            logger.warning("No chunks generated from URL", document_id=document_id)
            update_document_status(db, document_id, stage="Completed", status="completed", chunk_count=0)
            return

        # 3. Embeddings
        update_document_status(db, document_id, stage="Generating Embeddings", status="embedding")
        chunk_texts = [c.text for c in chunks]
        embeddings = embed_texts(chunk_texts)

        # 4. Save to LanceDB/ChromaDB
        update_document_status(db, document_id, stage="Indexing Vector DB", status="embedding")
        add_chunks(chunks, embeddings)

        # 5. Extract Graph Entities
        try:
            from app.rag.extractor import extract_graph_entities
            from app.rag.graph_store import add_triplets
            if chunks:
                triplets = extract_graph_entities(chunks[0].text)
                if triplets:
                    add_triplets(triplets, document_id)
        except Exception as e:
            logger.warning("Graph extraction failed during URL ingestion", error=str(e))

        # Update status to completed
        update_document_status(db, document_id, stage="Completed", status="completed", chunk_count=len(chunks))
        logger.info("URL processed successfully", document_id=document_id, chunk_count=len(chunks))

    except Exception as e:
        logger.error("Error in URL processing pipeline", document_id=document_id, error=str(e))
        
        if self.request.retries == self.max_retries:
            update_document_status(db, document_id, stage="Failed", status="failed", error_message=str(e))
            logger.error("Exhausted retries, marked URL as failed", document_id=document_id)
        
        raise
    finally:
        db.close()
