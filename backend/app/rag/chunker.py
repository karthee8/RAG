from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.core.config import settings
from app.schemas.document import ChunkSchema, ChunkMetadata
import time

def chunk_text(text: str, source_name: str, document_id: str, user_id: str) -> list[ChunkSchema]:
    """
    Splits text using RecursiveCharacterTextSplitter for structure-aware chunking.
    Respects paragraph and heading boundaries.
    """
    # Split by custom PAGE_BREAK to preserve page boundary metadata
    pages = text.split("---PAGE_BREAK---")
    
    # Use RecursiveCharacterTextSplitter
    text_splitter = RecursiveCharacterTextSplitter(
        separators=["\n\n", "\n", " ", ""],
        chunk_size=800,
        chunk_overlap=120,
        length_function=len
    )
    
    chunks = []
    chunk_index = 0
    
    for page_idx, page_content in enumerate(pages):
        page_num = page_idx + 1
        page_content = page_content.strip()
        if not page_content:
            continue
        
        # Split page content into sub-chunks
        sub_chunks = text_splitter.split_text(page_content)
        
        for sub_chunk in sub_chunks:
            sub_chunk = sub_chunk.strip()
            # Ignore empty or overly short chunks
            if len(sub_chunk) < settings.MIN_CHUNK_LENGTH:
                continue
            
            chunk_id = f"chunk_{chunk_index:05d}"
            
            chunks.append(ChunkSchema(
                chunk_id=chunk_id,
                text=sub_chunk,
                metadata=ChunkMetadata(
                    source=source_name,
                    page=page_num,
                    chunk_index=chunk_index,
                    document_id=document_id,
                    user_id=user_id,
                    timestamp=time.time()
                )
            ))
            chunk_index += 1
            
    return chunks
