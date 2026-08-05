from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "worker",
    broker=settings.get_celery_broker_url,
    backend=settings.get_celery_result_backend,
    include=["app.worker.tasks"]
)

# Optional configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,
    task_always_eager=True, # Run tasks synchronously for local dev without Redis
)
