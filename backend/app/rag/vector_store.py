import os
import lancedb
import pyarrow as pa
from app.core.config import settings
from app.schemas.document import ChunkSchema

def _invalidate_retrieval_cache() -> None:
    """Clear the retriever's cached BM25 index after the corpus changes.

    Imported lazily to avoid a circular import (retriever imports this module).
    """
    try:
        from app.rag.retriever import invalidate_retrieval_cache
        invalidate_retrieval_cache()
    except Exception:
        # Retriever may not be imported yet (e.g. during ingestion-only flows).
        pass


class VectorStore:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(VectorStore, cls).__new__(cls, *args, **kwargs)
            cls._instance._db = None
            cls._instance._table = None
        return cls._instance

    @property
    def db(self):
        if self._db is None:
            # Ensure persist directory exists
            db_path = os.path.join(settings.CHROMA_PERSIST_DIR, "lancedb")
            os.makedirs(db_path, exist_ok=True)
            self._db = lancedb.connect(db_path)
        return self._db

    @property
    def table(self):
        if self._table is None:
            # Define schema for LanceDB
            schema = pa.schema([
                pa.field("chunk_id", pa.string()),
                pa.field("document_id", pa.string()),
                pa.field("user_id", pa.string()),
                pa.field("text", pa.string()),
                pa.field("metadata", pa.string()), # store metadata as json string for simplicity
                pa.field("vector", pa.list_(pa.float32(), settings.EMBEDDING_DIMENSION))
            ])
            try:
                self._table = self.db.open_table(settings.CHROMA_COLLECTION_NAME)
            except Exception:
                self._table = self.db.create_table(settings.CHROMA_COLLECTION_NAME, schema=schema)
        return self._table

    def add_chunks(self, chunks: list[ChunkSchema], embeddings: list[list[float]]) -> None:
        """
        Upserts document chunks and their embeddings into LanceDB.
        """
        if not chunks:
            return

        import json
        data = []
        for chunk, embedding in zip(chunks, embeddings):
            data.append({
                "chunk_id": chunk.chunk_id,
                "document_id": chunk.metadata.document_id,
                "user_id": chunk.metadata.user_id,
                "text": chunk.text,
                "metadata": json.dumps(chunk.metadata.model_dump()),
                "vector": embedding
            })

        self.table.add(data)
        _invalidate_retrieval_cache()

    def search(
        self,
        query_embedding: list[float],
        top_k: int,
        filters: dict | None = None
    ) -> list[dict]:
        """
        Queries LanceDB for the closest top_k matching chunks.
        """
        import json
        
        query_builder = self.table.search(query_embedding).metric("cosine").limit(top_k)
        
        if filters:
            if "user_id" in filters:
                query_builder = query_builder.where(f"user_id = '{filters['user_id']}'")
            if "document_id" in filters:
                doc_id = filters["document_id"]
                if "," in doc_id:
                    ids_str = ", ".join(f"'{id.strip()}'" for id in doc_id.split(","))
                    query_builder = query_builder.where(f"document_id IN ({ids_str})")
                else:
                    query_builder = query_builder.where(f"document_id = '{doc_id}'")

        results = query_builder.to_arrow().to_pylist()

        matched_chunks = []
        import time
        import math
        current_time = time.time()
        
        for res in results:
            metadata = json.loads(res["metadata"])
            # base distance from vector search (lower is better, cosine distance)
            distance = res.get("_distance", 0.0)
            
            # Apply time decay penalty: older chunks get slightly penalized
            # Assuming metadata has timestamp. Decay half-life: 30 days (2592000 seconds)
            chunk_time = metadata.get("timestamp", current_time)
            age_seconds = max(0, current_time - chunk_time)
            
            # Decay factor (alpha). Example: penalize distance by up to +0.2 for very old docs
            # score = distance + penalty
            decay_penalty = 0.2 * (1.0 - math.exp(-age_seconds / 2592000))
            weighted_distance = distance + decay_penalty
            
            matched_chunks.append({
                "chunk_id": res["chunk_id"],
                "text": res["text"],
                "metadata": metadata,
                "distance": weighted_distance
            })
            
        # Re-sort by the new weighted distance (since we added penalties, the order might change)
        matched_chunks.sort(key=lambda x: x["distance"])

        return matched_chunks

    def delete_document(self, document_id: str, user_id: str | None = None) -> None:
        """
        Deletes all chunks associated with a document_id.
        """
        if user_id:
            self.table.delete(f"document_id = '{document_id}' AND user_id = '{user_id}'")
        else:
            self.table.delete(f"document_id = '{document_id}'")
        _invalidate_retrieval_cache()

    def collection_stats(self) -> dict:
        """
        Returns stats such as total chunk count.
        """
        return {
            "chunk_count": len(self.table)
        }

# Singleton instance
_vector_store = VectorStore()

def add_chunks(chunks: list[ChunkSchema], embeddings: list[list[float]]) -> None:
    _vector_store.add_chunks(chunks, embeddings)

def search(
    query_embedding: list[float],
    top_k: int,
    filters: dict | None = None
) -> list[dict]:
    return _vector_store.search(query_embedding, top_k, filters)

def delete_document(document_id: str, user_id: str | None = None) -> None:
    _vector_store.delete_document(document_id, user_id)

def collection_stats() -> dict:
    return _vector_store.collection_stats()
