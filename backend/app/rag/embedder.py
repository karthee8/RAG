import os
import structlog
from fastembed import TextEmbedding
from app.core.config import settings

logger = structlog.get_logger()

# Quiet the Windows symlink caching warning from huggingface_hub.
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")


class Embedder:
    """
    ONNX-based text embedder (fastembed). Replaces the previous
    sentence-transformers/torch implementation to keep the dependency
    footprint small enough to package into a desktop installer.
    """

    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(Embedder, cls).__new__(cls, *args, **kwargs)
            cls._instance._model = None
        return cls._instance

    @property
    def model(self) -> TextEmbedding:
        if self._model is None:
            logger.info("Loading embedding model (ONNX/fastembed)", model=settings.EMBEDDING_MODEL)
            self._model = TextEmbedding(
                model_name=settings.EMBEDDING_MODEL,
                cache_dir=settings.EMBEDDING_CACHE_DIR or None,
            )
            logger.info("Embedding model loaded successfully")
        return self._model

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
            
        from app.services.redis_cache import redis_cache, generate_hash
        
        results = []
        texts_to_embed = []
        texts_to_embed_indices = []
        
        # 1. Check cache for each text
        for i, text in enumerate(texts):
            key = f"embed:{generate_hash(text)}"
            cached_vector = redis_cache.get(key)
            if cached_vector:
                results.append(cached_vector)
            else:
                results.append(None) # Placeholder
                texts_to_embed.append(text)
                texts_to_embed_indices.append(i)
                
        # 2. Embed missing texts
        if texts_to_embed:
            new_vectors = [
                vec.tolist()
                for vec in self.model.embed(texts_to_embed, batch_size=settings.EMBEDDING_BATCH_SIZE)
            ]
            
            # 3. Cache new vectors and fill results
            for j, vec in enumerate(new_vectors):
                idx = texts_to_embed_indices[j]
                text = texts_to_embed[j]
                key = f"embed:{generate_hash(text)}"
                
                # Cache without TTL (embeddings don't expire)
                redis_cache.set(key, vec)
                results[idx] = vec
                
        return results

    async def aembed_texts(self, texts: list[str]) -> list[list[float]]:
        import asyncio
        if not texts:
            return []
        return await asyncio.to_thread(self.embed_texts, texts)


# Singleton instance
_embedder = Embedder()


def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    Converts a list of strings into 768-dimensional embeddings using the
    nomic-embed-text-v1.5 model via fastembed.
    """
    return _embedder.embed_texts(texts)

async def aembed_texts(texts: list[str]) -> list[list[float]]:
    """
    Asynchronous version of embed_texts using asyncio.to_thread to unblock the event loop.
    """
    return await _embedder.aembed_texts(texts)
