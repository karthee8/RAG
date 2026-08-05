import json
import hashlib
import structlog
from redis import Redis
from app.core.config import settings

logger = structlog.get_logger()

class RedisCache:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(RedisCache, cls).__new__(cls, *args, **kwargs)
            cls._instance.client = None
            cls._instance._init_client()
        return cls._instance

    def _init_client(self):
        try:
            self.client = Redis.from_url(settings.REDIS_URL, decode_responses=True)
            # Test connection
            self.client.ping()
            logger.info("Connected to Redis cache successfully")
        except Exception as e:
            logger.warning("Failed to connect to Redis cache. Caching will be disabled.", error=str(e))
            self.client = None

    def get(self, key: str):
        if not self.client:
            return None
        try:
            val = self.client.get(key)
            return json.loads(val) if val else None
        except Exception as e:
            logger.error("Redis get error", error=str(e), key=key)
            return None

    def set(self, key: str, value: any, ttl_seconds: int | None = None):
        if not self.client:
            return
        try:
            val = json.dumps(value)
            if ttl_seconds:
                self.client.setex(key, ttl_seconds, val)
            else:
                self.client.set(key, val)
        except Exception as e:
            logger.error("Redis set error", error=str(e), key=key)

redis_cache = RedisCache()

def generate_hash(text: str) -> str:
    """Generate MD5 hash of text for cache keys."""
    return hashlib.md5(text.encode('utf-8')).hexdigest()

def generate_llm_cache_key(query: str, context_chunks: list) -> str:
    """Generate a cache key based on query and retrieved context."""
    context_text = "".join([c.text for c in context_chunks])
    return "llm_cache:" + hashlib.md5((query + context_text).encode('utf-8')).hexdigest()
