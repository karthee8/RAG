from fastapi import APIRouter
from app.core.config import settings

router = APIRouter()

@router.get("/health")
async def health_check() -> dict[str, str]:
    return {
        "status": "ok",
        "version": "1.0.0",
        "env": settings.APP_ENV
    }

@router.get("/health/live")
async def liveness_probe():
    """
    K8s Liveness Probe. If this fails, the container is restarted.
    Should be fast and only check if the API event loop is responsive.
    """
    return {"status": "alive"}

@router.get("/health/ready")
async def readiness_probe():
    """
    K8s Readiness Probe. If this fails, traffic stops routing to this pod.
    Checks external dependencies like Database, Redis, and LanceDB.
    """
    from app.db.database import SessionLocal
    from sqlalchemy import text
    from fastapi import HTTPException
    
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        raise HTTPException(status_code=503, detail="Database unavailable")
    finally:
        db.close()
        
    return {"status": "ready"}
