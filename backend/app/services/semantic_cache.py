import os
import lancedb
import pyarrow as pa
import json
from app.core.config import settings
from app.rag.embedder import embed_texts
import structlog

logger = structlog.get_logger()

class SemanticCache:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(SemanticCache, cls).__new__(cls, *args, **kwargs)
            cls._instance._db = None
            cls._instance._table = None
        return cls._instance

    @property
    def db(self):
        if self._db is None:
            db_path = os.path.join(settings.CHROMA_PERSIST_DIR, "lancedb_cache")
            os.makedirs(db_path, exist_ok=True)
            self._db = lancedb.connect(db_path)
        return self._db

    @property
    def table(self):
        if self._table is None:
            schema = pa.schema([
                pa.field("query", pa.string()),
                pa.field("answer", pa.string()),
                pa.field("sources", pa.string()),
                pa.field("vector", pa.list_(pa.float32(), settings.EMBEDDING_DIMENSION))
            ])
            try:
                self._table = self.db.open_table("semantic_cache")
            except Exception:
                self._table = self.db.create_table("semantic_cache", schema=schema)
        return self._table

    def check_cache(self, query: str, threshold: float = 0.95):
        """
        Check if a semantically similar query exists in the cache.
        Returns (answer, sources) if hit, else None.
        """
        try:
            query_embedding = embed_texts([query])[0]
            
            # Since LanceDB uses L2 distance or Cosine distance, we need to be careful.
            # FastEmbed models usually return normalized vectors, so Cosine distance is 1 - Cosine Similarity.
            # Similarity of 0.95 means Cosine distance <= 0.05.
            max_distance = 1.0 - threshold
            
            if len(self.table) == 0:
                return None
                
            results = self.table.search(query_embedding).metric("cosine").limit(1).to_arrow().to_pylist()
            
            if results and results[0].get("_distance", 1.0) <= max_distance:
                logger.info("Semantic cache HIT", query=query, distance=results[0].get("_distance"))
                return results[0]["answer"], json.loads(results[0]["sources"])
                
            logger.info("Semantic cache MISS", query=query)
            return None
        except Exception as e:
            logger.error("Error checking semantic cache", error=str(e))
            return None

    def set_cache(self, query: str, answer: str, sources: list):
        """
        Save the query, answer, and sources into the semantic cache.
        """
        try:
            query_embedding = embed_texts([query])[0]
            data = [{
                "query": query,
                "answer": answer,
                "sources": json.dumps([s.model_dump() if hasattr(s, "model_dump") else s for s in sources]),
                "vector": query_embedding
            }]
            self.table.add(data)
            logger.info("Saved to semantic cache", query=query)
        except Exception as e:
            logger.error("Error saving to semantic cache", error=str(e))

semantic_cache = SemanticCache()
