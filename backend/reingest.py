"""Re-ingest all uploaded documents into the vector store."""
import sys, os, asyncio
sys.path.insert(0, ".")

from app.core.config import settings
from app.rag.extractor import extract_text_from_file
from app.rag.chunker import chunk_text
from app.rag.embedder import embed_texts
from app.rag.vector_store import add_chunks

upload_dir = settings.UPLOAD_DIR

# Get all files in uploads
files = [f for f in os.listdir(upload_dir) if os.path.isfile(os.path.join(upload_dir, f))]
print(f"Found {len(files)} uploaded files in {upload_dir}")

total_chunks = 0
for filename in files:
    filepath = os.path.join(upload_dir, filename)
    
    # Extract the original filename (after UUID prefix)
    parts = filename.split("_", 1)
    original_name = parts[1] if len(parts) > 1 else filename
    doc_id = f"doc_{parts[0][:8]}" if len(parts) > 1 else f"doc_{filename[:8]}"
    
    print(f"\nProcessing: {original_name} (doc_id={doc_id})")
    
    # 1. Extract text
    text, success = extract_text_from_file(filepath)
    if not success or not text.strip():
        print(f"  SKIP: Failed to extract text from {original_name}")
        continue
    
    print(f"  Extracted {len(text)} characters of text")
    
    # 2. Chunk
    chunks = chunk_text(text, original_name, doc_id)
    if not chunks:
        print(f"  SKIP: No chunks generated")
        continue
    
    print(f"  Generated {len(chunks)} chunks")
    
    # 3. Embed
    chunk_texts = [c.text for c in chunks]
    embeddings = embed_texts(chunk_texts)
    print(f"  Created {len(embeddings)} embeddings")
    
    # 4. Store
    add_chunks(chunks, embeddings)
    total_chunks += len(chunks)
    print(f"  Stored in vector DB!")

print(f"\n{'='*50}")
print(f"DONE! Total chunks ingested: {total_chunks}")

# Verify
from app.rag.vector_store import _vector_store
count = _vector_store.table.count_rows()
print(f"Vector store now contains: {count} chunks")
