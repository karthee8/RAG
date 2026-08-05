import json
import threading
import structlog
from rank_bm25 import BM25Okapi
from app.core.config import settings
from app.rag.embedder import embed_texts
from app.rag.vector_store import search, _vector_store
from app.schemas.document import RetrievedChunk, ChunkMetadata

logger = structlog.get_logger()

# Cache for the corpus pull + BM25 index. Building BM25 over the whole corpus on
# every query is wasteful since the index only changes when documents are
# ingested or deleted. Cached payload: (ids, documents, metadatas, bm25).
# Invalidated via invalidate_retrieval_cache() from the vector store on mutation.
_corpus_cache: dict = {}
_corpus_cache_lock = threading.Lock()


def invalidate_retrieval_cache() -> None:
    """Drop the cached corpus/BM25 index. Called when the vector store changes."""
    with _corpus_cache_lock:
        _corpus_cache.clear()


def _get_corpus_and_bm25(filters: dict, document_id: str | None):
    """
    Returns (ids, documents, metadatas, bm25) for the given filter, building and
    caching the BM25 index lazily. The cache is keyed by document filter and is
    cleared whenever documents are added or removed.
    
    Uses LanceDB's table API instead of ChromaDB's collection API.
    """
    key = document_id or "__all__"
    with _corpus_cache_lock:
        cached = _corpus_cache.get(key)
        if cached is not None:
            return cached

    # Query LanceDB table directly instead of using ChromaDB's collection.get()
    try:
        table = _vector_store.table
        total_rows = table.count_rows()
        
        query_builder = table.search()
        
        user_id = filters.get("user_id")
        if user_id:
            query_builder = query_builder.where(f"user_id = '{user_id}'")
            
        if document_id:
            if "," in document_id:
                ids_str = ", ".join(f"'{id.strip()}'" for id in document_id.split(","))
                if user_id:
                    query_builder = query_builder.where(f"document_id IN ({ids_str}) AND user_id = '{user_id}'")
                else:
                    query_builder = query_builder.where(f"document_id IN ({ids_str})")
            else:
                if user_id:
                    query_builder = query_builder.where(f"document_id = '{document_id}' AND user_id = '{user_id}'")
                else:
                    query_builder = query_builder.where(f"document_id = '{document_id}'")
                
        results = query_builder.limit(total_rows or 10000).to_arrow().to_pylist()
    except Exception as e:
        logger.error("Failed to query LanceDB table for BM25 corpus", error=str(e))
        results = []

    ids = []
    documents = []
    metadatas = []

    for row in results:
        ids.append(row.get("chunk_id", ""))
        documents.append(row.get("text", ""))
        # Parse metadata from JSON string
        meta_raw = row.get("metadata", "{}")
        if isinstance(meta_raw, str):
            try:
                meta = json.loads(meta_raw)
            except json.JSONDecodeError:
                meta = {"source": "", "page": 0, "chunk_index": 0, "document_id": document_id or ""}
        else:
            meta = meta_raw
        metadatas.append(meta)

    bm25 = None
    if ids:
        tokenized_corpus = [doc.lower().split() for doc in documents]
        bm25 = BM25Okapi(tokenized_corpus)

    payload = (ids, documents, metadatas, bm25)
    with _corpus_cache_lock:
        _corpus_cache[key] = payload
    return payload


def retrieve(
    query: str,
    top_k: int,
    document_id: str | None = None,
    user_id: str | None = None
) -> list[RetrievedChunk]:
    """
    End-to-end hybrid retrieval: combines dense vector search and sparse BM25 lexical search.
    Computes a weighted combined score:
        Score = alpha * semantic_score + (1 - alpha) * lexical_score
    Filters out matches below a 0.3 combined similarity threshold.
    """
    if not query or not query.strip():
        return []

    # 1. Retrieve all candidate chunks matching the filter from LanceDB
    filters = {}
    if document_id:
        filters["document_id"] = document_id
    if user_id:
        filters["user_id"] = user_id

    try:
        ids, documents, metadatas, bm25 = _get_corpus_and_bm25(filters, document_id)
    except Exception as e:
        logger.error("Failed to retrieve candidate documents from vector store", error=str(e))
        return []

    if not ids:
        logger.info("No candidates found in vector store for hybrid search", filters=filters)
        return []

    logger.info("Hybrid search corpus loaded", num_candidates=len(ids), document_id=document_id)

    # 2. Sparse Lexical Search (BM25) using the cached corpus index
    tokenized_query = query.lower().split()
    bm25_scores = bm25.get_scores(tokenized_query)

    max_bm25_score = max(bm25_scores) if len(bm25_scores) > 0 else 0.0
    normalized_bm25_scores = [
        (score / max_bm25_score) if max_bm25_score > 0 else 0.0
        for score in bm25_scores
    ]

    # 3. Dense Semantic Search (Vector)
    query_embeddings = embed_texts([query])
    if not query_embeddings:
        return []
    query_emb = query_embeddings[0]

    dense_top_k = min(len(ids), max(100, top_k * 10))
    semantic_results = search(query_embedding=query_emb, top_k=dense_top_k, filters=filters)
    
    # 4. Reciprocal Rank Fusion (RRF)
    # RRF Formula: Score = 1 / (k + rank), where k=60 is standard
    RRF_K = 60
    rrf_scores = {}

    # Rank Dense Results
    for rank, item in enumerate(semantic_results):
        chunk_id = item["chunk_id"]
        # item is sorted by distance ascending (best first)
        rrf_scores[chunk_id] = rrf_scores.get(chunk_id, 0.0) + 1.0 / (RRF_K + rank + 1)

    # Rank Sparse Results (BM25)
    # Filter out 0 scores to only rank actual sparse matches
    sparse_matches = [(ids[idx], score) for idx, score in enumerate(bm25_scores) if score > 0]
    sparse_matches.sort(key=lambda x: x[1], reverse=True)
    
    for rank, (chunk_id, score) in enumerate(sparse_matches[:dense_top_k]):
        rrf_scores[chunk_id] = rrf_scores.get(chunk_id, 0.0) + 1.0 / (RRF_K + rank + 1)

    # 5. Assemble final candidates
    hybrid_results = []
    
    # We need to map chunk_id back to text and metadata
    id_to_doc = {chunk_id: documents[idx] for idx, chunk_id in enumerate(ids)}
    id_to_meta = {chunk_id: metadatas[idx] for idx, chunk_id in enumerate(ids)}

    for chunk_id, combined_score in rrf_scores.items():
        # Minimal RRF threshold to filter out extreme tail (e.g. ranked 100th in only one list)
        if combined_score < (1.0 / (RRF_K + 100)):
            continue

        metadata = id_to_meta.get(chunk_id, {})
        text = id_to_doc.get(chunk_id, "")

        hybrid_results.append(RetrievedChunk(
            chunk_id=chunk_id,
            text=text,
            metadata=ChunkMetadata(
                source=metadata.get("source", ""),
                page=metadata.get("page", 0),
                chunk_index=metadata.get("chunk_index", 0),
                document_id=metadata.get("document_id", "")
            ),
            score=round(float(combined_score), 4)
        ))

    # Sort by RRF score descending and limit to top_k
    hybrid_results.sort(key=lambda x: x.score, reverse=True)
    logger.info("Hybrid RRF retrieval complete", num_results=len(hybrid_results), top_k=top_k)
    return hybrid_results[:top_k]
