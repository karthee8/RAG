import json
import httpx
import structlog
import asyncio
import re
import time
from app.core.config import settings
from app.schemas.document import RetrievedChunk

# Degeneration detection patterns
REPETITION_PATTERN = re.compile(r'(\b\w+\b)(?:\s+\1){4,}')
SPECIAL_TOKENS = re.compile(r'<\|?(?:im_end|im_start|end_of_turn|pad|endoftext|eos)\|?>')
REPEATED_PHRASE = re.compile(r'(.{3,50}?)\1{3,}')

def clean_output(text: str) -> str:
    """Remove special tokens and trim repetition loops."""
    text = SPECIAL_TOKENS.sub('', text)
    text = REPETITION_PATTERN.sub(r'\1', text)
    text = REPEATED_PHRASE.sub(r'\1', text)
    return text.strip()

logger = structlog.get_logger()

PROMPT_TEMPLATE = """CONTEXT:
{context}

QUESTION:
{question}

ANSWER:"""

PROMPT_TEMPLATE_WITH_HISTORY = """CONVERSATION HISTORY:
{history}

CONTEXT:
{context}

QUESTION:
{question}

ANSWER:"""



def build_prompt(query: str, context_chunks: list[RetrievedChunk], history: list[dict] | None = None) -> str:
    """
    Builds the final prompt string from context chunks, query, and optional conversation history.
    Enforces a strict token budget for the context chunks to prevent context window overflow.
    """
    # Enforce token budget (assume 1 token ~ 4 chars for rough estimation)
    TOKEN_BUDGET = getattr(settings, "LLM_CONTEXT_WINDOW", 8192)
    MAX_CHARS = int(TOKEN_BUDGET * 3.5) # Conservative multiplier
    
    # Pre-calculate query and history lengths
    query_chars = len(query)
    history_chars = 0
    history_str = ""
    if history:
        history_str = "\n".join([
            f"{'User' if msg['role'] == 'user' else 'Assistant'}: {msg['content']}"
            for msg in history
        ])
        history_chars = len(history_str)
        
    available_chars = MAX_CHARS - query_chars - history_chars - 200 # 200 for template boilerplate
    
    # Assemble context chunks until budget is exhausted
    included_chunks = []
    current_chars = 0
    for chunk in context_chunks:
        if current_chars + len(chunk.text) > available_chars:
            if available_chars - current_chars > 200: # Allow partial inclusion if significant space left
                included_chunks.append(chunk.text[:(available_chars - current_chars)] + "...[TRUNCATED]")
            break
        included_chunks.append(chunk.text)
        current_chars += len(chunk.text) + 2 # +2 for the \n\n delimiter
        
    context_str = "\n\n".join(included_chunks)
    
    if history:
        return PROMPT_TEMPLATE_WITH_HISTORY.format(history=history_str, context=context_str, question=query)
        
    return PROMPT_TEMPLATE.format(context=context_str, question=query)

def _openrouter_headers() -> dict:
    """Auth + recommended attribution headers for OpenRouter."""
    return {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        # Optional but recommended by OpenRouter for app attribution.
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": settings.APP_NAME,
    }


# ----------------------------- Non-streaming ------------------------------

def generate(query: str, context_chunks: list[RetrievedChunk], history: list[dict] | None = None, model: str | None = None) -> str:
    """
    Generates a response from the configured LLM provider (Ollama or OpenRouter)
    based on retrieved context and history. Returns the fallback answer when the
    context is empty, and handles connection/timeout errors gracefully.
    """
    if not context_chunks:
        return "I cannot find this in the provided documents."

    from app.services.redis_cache import redis_cache, generate_llm_cache_key
    
    # Check Exact-Match LLM Cache
    cache_key = generate_llm_cache_key(query, context_chunks)
    cached_response = redis_cache.get(cache_key)
    if cached_response:
        logger.info("Exact match LLM cache hit", key=cache_key)
        return cached_response

    prompt = build_prompt(query, context_chunks, history)

    if settings.LLM_PROVIDER == "openrouter":
        answer = _generate_openrouter(prompt, model=model)
    else:
        answer = _generate_ollama(prompt, model=model)
        
    # Cache the generated response for 1 hour (3600 seconds)
    if not answer.startswith("Error:"):
        redis_cache.set(cache_key, answer, ttl_seconds=3600)
        
    return answer


def _generate_ollama(prompt: str, model: str | None = None) -> str:
    url = f"{settings.OLLAMA_BASE_URL}/api/generate"
    payload = {
        "model": model or settings.LLM_MODEL,
        "prompt": prompt,
        "system": "You are a precise question-answering assistant.\nUse ONLY the context provided to answer the question.\nIf the answer is not in the context, say exactly: \"I cannot find this in the provided documents.\"\nDo not add information not present in the context.",
        "stream": False,
        "think": settings.LLM_THINK,
        "keep_alive": settings.LLM_KEEP_ALIVE,
        "options": {
            "temperature": settings.LLM_TEMPERATURE,
            "num_predict": settings.LLM_MAX_TOKENS,
        },
    }
    try:
        with httpx.Client(timeout=180.0) as client:
            response = client.post(url, json=payload)
            response.raise_for_status()
            return response.json().get("response", "").strip()
    except httpx.RequestError as e:
        logger.error("Ollama connection error during generation", error=str(e), url=url)
        return "Error: Could not connect to the LLM generation service."
    except Exception as e:
        logger.error("Unexpected error in generator", error=str(e))
        return "Error: An unexpected error occurred during generation."


def _generate_openrouter(prompt: str, model: str | None = None) -> str:
    url = f"{settings.OPENROUTER_BASE_URL}/chat/completions"
    
    models = [m.strip() for m in getattr(settings, "OPENROUTER_FALLBACK_MODELS", settings.OPENROUTER_MODEL).split(",") if m.strip()]
    if model and "/" in model:
        models = [model]
        
    for attempt in range(2):
        for model_idx, current_model in enumerate(models):
            payload = {
                "model": current_model,
                "messages": [
                    {"role": "system", "content": "You are a precise question-answering assistant.\nUse ONLY the context provided to answer the question.\nIf the answer is not in the context, say exactly: \"I cannot find this in the provided documents.\"\nDo not add information not present in the context."},
                    {"role": "user", "content": prompt}
                ],
                "stream": False,
                "temperature": settings.LLM_TEMPERATURE,
                "max_tokens": settings.LLM_MAX_TOKENS,
                "repetition_penalty": getattr(settings, "LLM_REPETITION_PENALTY", 1.1),
            }
            try:
                with httpx.Client(timeout=getattr(settings, "OPENROUTER_RESPONSE_TIMEOUT", 120.0)) as client:
                    response = client.post(url, json=payload, headers=_openrouter_headers())
                    if response.status_code == 429:
                        logger.warning("OpenRouter rate limit (429)", model=current_model)
                        continue
                    response.raise_for_status()
                    data = response.json()
                    return clean_output(data["choices"][0]["message"]["content"].strip())
            except httpx.HTTPStatusError as e:
                logger.error("OpenRouter HTTP error", status=e.response.status_code, body=e.response.text[:300])
                continue
            except httpx.RequestError as e:
                logger.error("OpenRouter connection error during generation", error=str(e), url=url)
                continue
            except Exception as e:
                logger.error("Unexpected error in OpenRouter generator", error=str(e))
                continue
        if attempt == 0:
            logger.warning("All OpenRouter models failed. Backing off and retrying.")
            import time
            time.sleep(2)
            
    return "Error: The online LLM service rejected the request (check API key / model)."


# ------------------------------- Streaming --------------------------------

async def generate_stream(query: str, context_chunks: list[RetrievedChunk], history: list[dict] | None = None, model: str | None = None):
    """
    Async generator yielding token segments from the configured provider,
    normalized to JSON {"token": str, "done": bool} for the SSE layer.
    """
    if not context_chunks:
        yield json.dumps({"token": "I cannot find this in the provided documents.", "done": True})
        return

    prompt = build_prompt(query, context_chunks, history)

    if settings.LLM_PROVIDER == "openrouter":
        if model and "/" not in model:
            model = settings.OPENROUTER_MODEL
        async for chunk in _generate_openrouter_stream(prompt, model=model):
            yield chunk
    else:
        async for chunk in _generate_ollama_stream(prompt, model=model):
            yield chunk


async def _generate_ollama_stream(prompt: str, model: str | None = None):
    url = f"{settings.OLLAMA_BASE_URL}/api/generate"
    payload = {
        "model": model or settings.LLM_MODEL,
        "prompt": prompt,
        "system": "You are a precise question-answering assistant.\nUse ONLY the context provided to answer the question.\nIf the answer is not in the context, say exactly: \"I cannot find this in the provided documents.\"\nDo not add information not present in the context.",
        "stream": True,
        "think": getattr(settings, "LLM_THINK", False),
        "keep_alive": settings.LLM_KEEP_ALIVE,
        "options": {
            "temperature": settings.LLM_TEMPERATURE,
            "num_predict": settings.LLM_MAX_TOKENS,
            "repeat_penalty": getattr(settings, "LLM_REPETITION_PENALTY", 1.1),
        },
    }
    accumulated = ""
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            async with client.stream("POST", url, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        data = json.loads(line)
                        token = data.get("response", "")
                        accumulated += token
                        if REPEATED_PHRASE.search(accumulated):
                            yield json.dumps({"token": "", "done": True})
                            break
                        yield json.dumps({"token": token, "done": data.get("done", False)})
                        if data.get("done", False):
                            break
                    except json.JSONDecodeError:
                        continue
    except httpx.RequestError as e:
        logger.error("Ollama connection error during streaming", error=str(e), url=url)
        yield json.dumps({"token": "Error: Could not connect to the LLM generation service.", "done": True})
    except Exception as e:
        logger.error("Unexpected error in streaming generator", error=str(e))
        yield json.dumps({"token": "Error: An unexpected error occurred during streaming.", "done": True})


async def _generate_openrouter_stream(prompt: str, model: str | None = None):
    url = f"{settings.OPENROUTER_BASE_URL}/chat/completions"
    
    models = [m.strip() for m in getattr(settings, "OPENROUTER_FALLBACK_MODELS", settings.OPENROUTER_MODEL).split(",") if m.strip()]
    if model and "/" in model:
        models = [model]
        
    for attempt in range(2):
        for model_idx, current_model in enumerate(models):
            payload = {
                "model": current_model,
                "messages": [
                    {"role": "system", "content": "You are a precise question-answering assistant.\nUse ONLY the context provided to answer the question.\nIf the answer is not in the context, say exactly: \"I cannot find this in the provided documents.\"\nDo not add information not present in the context."},
                    {"role": "user", "content": prompt}
                ],
                "stream": True,
                "temperature": settings.LLM_TEMPERATURE,
                "max_tokens": settings.LLM_MAX_TOKENS,
                "repetition_penalty": getattr(settings, "LLM_REPETITION_PENALTY", 1.1),
            }
            accumulated = ""
            partial_success = False
            
            try:
                timeout = httpx.Timeout(
                    connect=10.0,
                    read=getattr(settings, "OPENROUTER_STALL_TIMEOUT", 15.0),
                    write=10.0,
                    pool=10.0
                )
                async with httpx.AsyncClient(timeout=timeout) as client:
                    async with client.stream("POST", url, json=payload, headers=_openrouter_headers()) as response:
                        if response.status_code == 429:
                            logger.warning("OpenRouter rate limit (429) during streaming", model=current_model)
                            continue
                        response.raise_for_status()
                        
                        first_token_deadline = time.time() + getattr(settings, "OPENROUTER_FIRST_TOKEN_TIMEOUT", 30.0)
                        response_deadline = time.time() + getattr(settings, "OPENROUTER_RESPONSE_TIMEOUT", 120.0)
                        first_token_received = False
                        
                        async for line in response.aiter_lines():
                            now = time.time()
                            if now > response_deadline:
                                logger.warning("OpenRouter response timeout", model=current_model)
                                break
                                
                            if not first_token_received and now > first_token_deadline:
                                logger.warning("OpenRouter first token timeout", model=current_model)
                                break
                                
                            line = line.strip()
                            if not line or not line.startswith("data:"):
                                continue
                            data_str = line[len("data:"):].strip()
                            if data_str == "[DONE]":
                                yield json.dumps({"token": "", "done": True})
                                return
                            try:
                                data = json.loads(data_str)
                                if "error" in data:
                                    if not partial_success:
                                        break # try next model
                                    yield json.dumps({"token": f"\n\n[API Error: {data['error'].get('message', 'Unknown Error')}]", "done": True})
                                    return
                                delta = data["choices"][0]["delta"].get("content", "") or ""
                                if delta:
                                    first_token_received = True
                                    partial_success = True
                                    accumulated += delta
                                    if REPEATED_PHRASE.search(accumulated):
                                        yield json.dumps({"token": "", "done": True})
                                        return
                                    yield json.dumps({"token": delta, "done": False})
                            except (json.JSONDecodeError, KeyError, IndexError):
                                continue
                                
                if partial_success:
                    yield json.dumps({"token": "", "done": True})
                    return
            except Exception as e:
                logger.warning(f"OpenRouter stream {current_model} failed", error=str(e))
                if partial_success:
                    yield json.dumps({"token": "", "done": True})
                    return
                continue
                
        if attempt == 0:
            logger.warning("All OpenRouter models failed. Backing off and retrying.")
            await asyncio.sleep(2)
            
    yield json.dumps({"token": "Error: The online LLM service rejected the request or timed out.", "done": True})
