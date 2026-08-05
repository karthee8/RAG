from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
import json
import structlog
from app.schemas.chat import ChatRequest, ChatResponse, ChatHistoryResponse
from app.rag.pipeline import run_pipeline, run_pipeline_stream
from app.rag.generator import generate_stream
from app.services.semantic_cache import semantic_cache
from app.core.config import settings
import asyncio
from app.api.deps import get_current_user
from app.models.user import User

logger = structlog.get_logger()

router = APIRouter(prefix="/api/chat", tags=["chat"])

@router.get("/rag/debug")
async def debug_rag_retrieval(
    query: str,
    top_k: int = 5,
    document_id: str | None = None,
    current_user: User = Depends(get_current_user)
):
    """
    Debug endpoint for evaluating RAG retrieval and reranking quality.
    Returns the retrieved chunks, their metadata, RRF score, and reranker score.
    """
    from app.rag.retriever import retrieve
    from app.rag.reranker import _reranker
    
    # Retrieve top 25 candidates (Hybrid Search + RRF)
    candidate_pool = retrieve(query, top_k=25, document_id=document_id, user_id=current_user.id)
    
    # Rerank if configured
    if settings.USE_RERANKER:
        reranked_chunks = _reranker.rerank(query, candidate_pool.copy())
        final_chunks = reranked_chunks[:top_k]
    else:
        final_chunks = candidate_pool[:top_k]
        
    return {
        "query": query,
        "results": [
            {
                "chunk_id": chunk.chunk_id,
                "text": chunk.text,
                "score": chunk.score,
                "metadata": chunk.metadata.model_dump()
            }
            for chunk in final_chunks
        ]
    }

from fastapi import Request
from app.core.rate_limit import limiter

@router.post("/query/stream")
@limiter.limit("20/minute")
async def query_rag_stream(
    request: Request,
    chat_request: ChatRequest,
    current_user: User = Depends(get_current_user)
) -> StreamingResponse:
    """
    Query the RAG pipeline and stream the response via Server-Sent Events (SSE).
    Returns retrieved sources in the first event, then streams answer tokens.
    """
    if chat_request.query.strip().startswith("/"):
        from app.services.agent_service import process_slash_command
        
        async def slash_event_generator():
            yield f"data: {json.dumps({'event': 'sources', 'sources': []})}\n\n"
            response_text = await process_slash_command(chat_request.query)
            
            words = response_text.split(" ")
            for i, word in enumerate(words):
                token = word + (" " if i < len(words) - 1 else "")
                yield f"data: {json.dumps({'event': 'token', 'token': token})}\n\n"
                await asyncio.sleep(0.01)
                
            yield f"data: {json.dumps({'event': 'done'})}\n\n"
            
            from app.services.memory_service import memory_service
            memory_service.add_message(chat_request.session_id, "user", chat_request.query)
            memory_service.add_message(chat_request.session_id, "assistant", response_text)
            
        return StreamingResponse(slash_event_generator(), media_type="text/event-stream")
    # Check Semantic Cache first
    cached_result = semantic_cache.check_cache(chat_request.query)
    
    if cached_result:
        # Cache hit
        cached_answer, sources_data = cached_result
        
        async def cached_event_generator():
            # 1. Yield sources
            yield f"data: {json.dumps({'event': 'sources', 'sources': sources_data})}\n\n"
            
            # Send context meter event for cached hit
            approx_tokens = len(chat_request.query + cached_answer) // 4
            yield f"data: {json.dumps({'event': 'context_meter', 'tokens_used': approx_tokens, 'context_limit': 8192})}\n\n"
            
            # 2. Yield the cached answer smoothly
            # Simulate streaming so the UI animation looks natural
            words = cached_answer.split(" ")
            for i, word in enumerate(words):
                token = word + (" " if i < len(words) - 1 else "")
                yield f"data: {json.dumps({'event': 'token', 'token': token})}\n\n"
                await asyncio.sleep(0.01) # tiny delay to simulate generation
                
            yield f"data: {json.dumps({'event': 'done'})}\n\n"
            
            # Save to memory since this is still part of the conversation
            from app.services.memory_service import memory_service
            memory_service.add_message(chat_request.session_id, "user", chat_request.query)
            memory_service.add_message(chat_request.session_id, "assistant", cached_answer)
            
        return StreamingResponse(cached_event_generator(), media_type="text/event-stream")

    # Cache miss
    # Offload CPU-bound retrieval pipeline to threadpool to prevent blocking the async event loop
    retrieved_chunks, history, sources = await asyncio.to_thread(
        run_pipeline_stream,
        query=chat_request.query,
        session_id=chat_request.session_id,
        user_id=current_user.id,
        document_id=chat_request.document_id,
        top_k=chat_request.top_k,
        model=chat_request.model
    )

    async def event_generator():
        accumulated_answer = []
        
        # 1. Yield sources immediately
        sources_data = [s.model_dump() for s in sources]
        yield f"data: {json.dumps({'event': 'sources', 'sources': sources_data})}\n\n"
        
        # Calculate approximate token usage for Context Meter
        context_text = chat_request.query + " ".join([c.text for c in retrieved_chunks]) + " ".join([m["content"] for m in history])
        approx_tokens = len(context_text) // 4
        yield f"data: {json.dumps({'event': 'context_meter', 'tokens_used': approx_tokens, 'context_limit': getattr(settings, 'LLM_CONTEXT_WINDOW', 8192)})}\n\n"
        
        from app.services.redis_cache import redis_cache, generate_llm_cache_key
        cache_key = generate_llm_cache_key(chat_request.query, retrieved_chunks)
        exact_cached = redis_cache.get(cache_key)
        
        if exact_cached:
            logger.info("Exact match LLM cache hit during stream", key=cache_key)
            # Simulate streaming
            words = exact_cached.split(" ")
            for i, word in enumerate(words):
                token = word + (" " if i < len(words) - 1 else "")
                yield f"data: {json.dumps({'event': 'token', 'token': token})}\n\n"
                await asyncio.sleep(0.01)
            yield f"data: {json.dumps({'event': 'done'})}\n\n"
            return
            
        # 2. Yield token stream from generator
        try:
            async for chunk_str in generate_stream(chat_request.query, retrieved_chunks, history, model=chat_request.model):
                chunk = json.loads(chunk_str)
                token = chunk.get("token", "")
                done = chunk.get("done", False)
                if token:
                    accumulated_answer.append(token)
                    yield f"data: {json.dumps({'event': 'token', 'token': token})}\n\n"
                if done:
                    break
            
            # 3. Save to memory if response is valid
            full_response = "".join(accumulated_answer).strip()
            if full_response and not full_response.startswith("Error:"):
                from app.services.memory_service import memory_service
                memory_service.add_message(chat_request.session_id, "user", chat_request.query)
                memory_service.add_message(chat_request.session_id, "assistant", full_response)
                
                # Save to Semantic Cache and Exact-Match Cache
                semantic_cache.set_cache(chat_request.query, full_response, sources)
                redis_cache.set(cache_key, full_response, ttl_seconds=3600)
                
            yield f"data: {json.dumps({'event': 'done'})}\n\n"
        except Exception as e:
            logger.error("Error in query streaming route", error=str(e))
            yield f"data: {json.dumps({'event': 'error', 'error': 'Internal server error during generation.'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.post("/query", response_model=ChatResponse)
@limiter.limit("20/minute")
async def query_rag(
    request: Request,
    chat_request: ChatRequest,
    current_user: User = Depends(get_current_user)
) -> ChatResponse:
    """
    Query the RAG pipeline. Searches ingested chunks, applies relevance constraints,
    queries the LLM generator, and returns the final answer along with reference sources.
    """
    # Check Semantic Cache first
    cached_result = semantic_cache.check_cache(chat_request.query)
    
    if cached_result:
        # Cache hit
        from app.schemas.chat import ChatSource
        cached_answer, sources_data = cached_result
        sources = [ChatSource(**s) for s in sources_data]
        from app.services.memory_service import memory_service
        memory_service.add_message(chat_request.session_id, "user", chat_request.query)
        memory_service.add_message(chat_request.session_id, "assistant", cached_answer)
        
        return ChatResponse(
            answer=cached_answer,
            sources=sources,
            session_id=chat_request.session_id,
            latency_ms=0
        )

    # Cache miss
    # Offload to threadpool to prevent blocking the async event loop
    import asyncio
    response = await asyncio.to_thread(
        run_pipeline,
        query=chat_request.query,
        session_id=chat_request.session_id,
        user_id=current_user.id,
        document_id=chat_request.document_id,
        top_k=chat_request.top_k,
        model=chat_request.model
    )
    
    # Save to Semantic Cache
    if not response.answer.startswith("Error:"):
        semantic_cache.set_cache(chat_request.query, response.answer, response.sources)
        
    return response

@router.get("/{session_id}/history", response_model=ChatHistoryResponse)
async def get_chat_history(
    session_id: str,
    current_user: User = Depends(get_current_user)
) -> ChatHistoryResponse:
    """
    Retrieves the conversation history for a given session.
    """
    from app.services.memory_service import memory_service
    history = memory_service.get_history(session_id)
    return ChatHistoryResponse(session_id=session_id, history=history)

@router.delete("/{session_id}/history")
async def clear_chat_history(
    session_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Clears the conversation history for a given session.
    """
    from app.services.memory_service import memory_service
    memory_service.clear_history(session_id)
    return {"status": "success", "message": f"Chat history for session {session_id} has been cleared"}

from fastapi.responses import PlainTextResponse

@router.get("/{session_id}/export")
async def export_chat_history(
    session_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Exports the conversation history as a Markdown string.
    """
    from app.services.memory_service import memory_service
    history = memory_service.get_history(session_id)
    
    md_lines = [f"# Chat History: {session_id}\n"]
    for msg in history:
        role = "User" if msg["role"] == "user" else "Assistant"
        md_lines.append(f"### {role}")
        md_lines.append(f"{msg['content']}\n")
    
    md_content = "\n".join(md_lines)
    
    return PlainTextResponse(
        content=md_content,
        headers={"Content-Disposition": f"attachment; filename=\"chat_export_{session_id}.md\""}
    )

