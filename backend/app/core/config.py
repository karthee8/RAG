import os
import sys
from pydantic_settings import BaseSettings, SettingsConfigDict


def _env_file_path() -> str:
    """Locate the .env file in both source and PyInstaller-frozen runs.

    In a normal run the .env sits at the backend root (3 dirs up from this
    file). When frozen, ``__file__`` lives inside the temporary _MEIPASS
    extraction dir, so we look for a .env next to the executable instead
    (the desktop launcher writes one there). Env vars always take precedence,
    so a missing file is harmless when config is injected by the launcher.
    """
    if getattr(sys, "frozen", False):
        return os.path.join(os.path.dirname(sys.executable), ".env")
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        ".env",
    )


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_env_file_path(),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # App Settings
    APP_NAME: str = "StrongRAG"
    APP_ENV: str = "development"
    APP_PORT: int = 8000
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    # Refresh tokens are long-lived; the client silently exchanges them for new
    # access tokens so sessions don't drop mid-use.
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    JWT_ISSUER: str = "strongrag-auth"
    JWT_AUDIENCE: str = "strongrag-users"

    # CORS: comma-separated allowed origins. The desktop app only ever calls the
    # backend from the local Next.js server, so we restrict to localhost rather
    # than using a wildcard (which is invalid together with credentials).
    CORS_ALLOW_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Database & Redis Settings
    DATABASE_URL: str
    REDIS_URL: str
    CELERY_BROKER_URL: str | None = None
    CELERY_RESULT_BACKEND: str | None = None

    @property
    def get_celery_broker_url(self) -> str:
        return self.CELERY_BROKER_URL or self.REDIS_URL

    @property
    def get_celery_result_backend(self) -> str:
        return self.CELERY_RESULT_BACKEND or self.REDIS_URL

    # Vector Database Settings
    CHROMA_PERSIST_DIR: str = "./vector_store"
    CHROMA_COLLECTION_NAME: str = "strong_rag"

    # Embedding Settings (ONNX via fastembed)
    EMBEDDING_MODEL: str = "nomic-ai/nomic-embed-text-v1.5"
    EMBEDDING_BATCH_SIZE: int = 32
    EMBEDDING_DIMENSION: int = 768
    # Where fastembed caches the ONNX model (bundle-able for packaging).
    EMBEDDING_CACHE_DIR: str = "./model_cache"

    # LLM Settings
    # Which backend to generate with: "ollama" (local) or "openrouter" (hosted, free models).
    LLM_PROVIDER: str = "ollama"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    LLM_MODEL: str = "qwen3.5:4b"
    LLM_TEMPERATURE: float = 0.1
    LLM_MAX_TOKENS: int = 256
    # Qwen3 and other "thinking" models emit reasoning into a separate `thinking`
    # field and leave `response` empty until done, consuming the whole token
    # budget. Disable it so the model returns a direct answer immediately.
    LLM_THINK: bool = False
    # Keep the model resident in Ollama between requests to avoid cold reloads.
    # Accepts a duration string ("30m", "1h") or "-1" to keep loaded indefinitely.
    LLM_KEEP_ALIVE: str = "30m"
    # Warm up models (embedder + LLM) on startup so the first query isn't slow.
    WARMUP_ON_STARTUP: bool = True

    # OpenRouter (hosted) settings. Used when LLM_PROVIDER="openrouter".
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_MODEL: str = "openai/gpt-oss-20b:free"
    OPENROUTER_FALLBACK_MODELS: str = "google/gemma-3-1b-it:free,google/gemma-3-4b-it:free,openrouter/auto"
    OPENROUTER_FIRST_TOKEN_TIMEOUT: float = 30.0
    OPENROUTER_STALL_TIMEOUT: float = 15.0
    OPENROUTER_RESPONSE_TIMEOUT: float = 120.0
    
    LLM_REPETITION_PENALTY: float = 1.1

    # Chunking Settings
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 64
    MIN_CHUNK_LENGTH: int = 50

    # Retrieval Settings
    TOP_K: int = 3
    HYBRID_ALPHA: float = 0.5
    USE_RERANKER: bool = True
    RERANKER_MODEL: str = "BAAI/bge-reranker-base"

    # File Ingestion Settings
    MAX_FILE_SIZE_MB: int = 20
    ALLOWED_EXTENSIONS: str = "pdf,txt,docx,mp4,mp3,wav,png,jpg,jpeg"
    UPLOAD_DIR: str = "./uploads"

    # Logging Settings
    LOG_LEVEL: str = "INFO"
    LOG_DIR: str = "./logs"

settings = Settings()
