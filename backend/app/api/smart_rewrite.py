from fastapi import APIRouter, Depends
from pydantic import BaseModel
import httpx
import structlog
from app.api.deps import get_current_user
from app.models.user import User
from app.core.config import settings

logger = structlog.get_logger()

router = APIRouter(prefix="/api/smart-rewrite", tags=["smart-rewrite"])

class RewriteRequest(BaseModel):
    draft_text: str

class RewriteResponse(BaseModel):
    rewritten_text: str

SYSTEM_PROMPT = (
    "You are an expert editor and prompt optimizer. Your task is to rewrite "
    "the user's short input into a highly detailed, professional, and clear prompt. "
    "Do NOT answer the prompt. ONLY output the rewritten version."
)

@router.post("", response_model=RewriteResponse)
async def smart_rewrite(
    request: RewriteRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Takes a short user prompt and rewrites it into a professional, highly detailed prompt.
    Uses the configured OpenRouter model.
    """
    # Use the user's configured model or default to gemma-2-9b-it:free
    model = settings.OPENROUTER_MODEL or "google/gemma-2-9b-it:free"
    
    url = f"{settings.OPENROUTER_BASE_URL}/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": request.draft_text},
        ],
        "stream": False,
        "temperature": 0.7,
        "max_tokens": settings.LLM_MAX_TOKENS,
    }
    
    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": settings.APP_NAME,
    }
    
    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            rewritten = data["choices"][0]["message"]["content"].strip()
            
            # If the LLM returned nothing, return the original
            if not rewritten:
                return RewriteResponse(rewritten_text=request.draft_text)
                
            return RewriteResponse(rewritten_text=rewritten)
    except httpx.HTTPStatusError as e:
        logger.error("OpenRouter HTTP Error in smart rewrite", status=e.response.status_code, text=e.response.text)
        return RewriteResponse(rewritten_text=request.draft_text)
    except Exception as e:
        logger.error("Unexpected error in smart rewrite", error=str(e))
        # Safely fallback to the original prompt
        return RewriteResponse(rewritten_text=request.draft_text)
