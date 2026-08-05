import time
import uuid
import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = structlog.get_logger()

class StructlogRequestMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        client_host = request.client.host if request.client else "unknown"
        method = request.method
        url = request.url.path

        # Bind context to the logger for this request
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            client_host=client_host,
            method=method,
            url=url,
        )

        start_time = time.perf_counter()
        try:
            response = await call_next(request)
            process_time = time.perf_counter() - start_time
            
            # Avoid logging health checks to reduce noise
            if url not in ("/health", "/metrics", "/health/live", "/health/ready"):
                logger.info(
                    "Request completed",
                    status_code=response.status_code,
                    duration_ms=round(process_time * 1000, 2)
                )
            
            response.headers["X-Request-ID"] = request_id
            return response
        except Exception as e:
            process_time = time.perf_counter() - start_time
            logger.exception(
                "Request failed",
                duration_ms=round(process_time * 1000, 2),
                error=str(e)
            )
            raise e
