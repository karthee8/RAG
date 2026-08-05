import json
import httpx
import structlog
from app.core.config import settings

logger = structlog.get_logger()

async def handle_grill_me(user_prompt: str) -> str:
    """
    Handles the /grill-me command by running an interactive interview.
    Instead of answering, it generates clarifying questions.
    """
    # Remove the command prefix
    content = user_prompt.replace("/grill-me", "").strip()
    
    SYSTEM_PROMPT = (
        "You are an expert architect and analyst. The user has provided a task or plan. "
        "Your job is to strictly respond with a JSON array of 2-3 highly critical clarifying questions "
        "to 'grill' the user and refine their plan before execution. "
        "Output ONLY valid JSON array of strings."
    )
    
    model = settings.OPENROUTER_MODEL or "google/gemma-2-9b-it:free"
    url = f"{settings.OPENROUTER_BASE_URL}/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Plan:\n{content}"},
        ],
        "temperature": 0.7,
        "response_format": {"type": "json_object"}
    }
    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            raw_text = data["choices"][0]["message"]["content"].strip()
            
            # Basic JSON extraction in case model wrapped it
            if "```json" in raw_text:
                raw_text = raw_text.split("```json")[1].split("```")[0].strip()
            
            questions = json.loads(raw_text)
            if isinstance(questions, list):
                out = "Here are a few questions to refine your plan:\n\n"
                for q in questions:
                    out += f"- {q}\n"
                return out
            return raw_text
    except Exception as e:
        logger.error("Failed /grill-me", error=str(e))
        return "I could not generate questions right now due to an API error. Please try again."

async def process_slash_command(command_text: str) -> str:
    """
    Routes a slash command to the appropriate agent handler.
    """
    if command_text.startswith("/grill-me"):
        return await handle_grill_me(command_text)
    
    # Fallback for unimplemented commands
    cmd = command_text.split(" ")[0]
    return f"The command `{cmd}` is not yet fully implemented in this phase. Try `/grill-me <your idea>` instead!"
