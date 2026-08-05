import time
from typing import TypedDict, Annotated, List
from langgraph.graph import StateGraph, END
from app.core.config import settings
from app.rag.retriever import retrieve
from app.rag.reranker import rerank_chunks
from app.rag.generator import generate
from app.schemas.chat import ChatResponse, ChatSource
from app.schemas.document import RetrievedChunk

class AgentState(TypedDict):
    query: str
    session_id: str
    user_id: str
    document_id: str | None
    top_k: int
    candidate_pool: List[RetrievedChunk]
    retrieved_chunks: List[RetrievedChunk]
    history: List[dict]
    answer: str
    sources: List[ChatSource]
    attempts: int

def retrieve_node(state: AgentState):
    query = state["query"]
    top_k = state["top_k"]
    document_id = state.get("document_id")
    user_id = state.get("user_id")
    
    if settings.USE_RERANKER:
        candidate_pool = retrieve(query, top_k=25, document_id=document_id, user_id=user_id)
        return {"candidate_pool": candidate_pool}
    else:
        retrieved_chunks = retrieve(query, top_k=top_k, document_id=document_id, user_id=user_id)
        return {"retrieved_chunks": retrieved_chunks}

def rerank_node(state: AgentState):
    query = state["query"]
    top_k = state["top_k"]
    candidate_pool = state.get("candidate_pool", [])
    
    if not candidate_pool:
        return {"retrieved_chunks": []}
        
    reranked_chunks = rerank_chunks(query, candidate_pool)
    retrieved_chunks = reranked_chunks[:top_k]
    
    # Context Assembly: Deduplicate and Order chronologically
    seen = set()
    unique_chunks = []
    for chunk in retrieved_chunks:
        if chunk.chunk_id not in seen:
            seen.add(chunk.chunk_id)
            unique_chunks.append(chunk)
            
    # Sort by document, then page, then chunk index
    unique_chunks.sort(key=lambda c: (c.metadata.document_id, c.metadata.page, c.metadata.chunk_index))
    
    return {"retrieved_chunks": unique_chunks}

def memory_node(state: AgentState):
    from app.services.memory_service import memory_service
    history = memory_service.get_history(state["session_id"])
    return {"history": history}

def generate_node(state: AgentState):
    query = state["query"]
    chunks = state.get("retrieved_chunks", [])
    history = state.get("history", [])
    model = state.get("model")
    
    from app.rag.tools import fallback_to_web_search, url_grounding
    
    # Web search fallback for non-streaming LangGraph path
    chunks = fallback_to_web_search(query, chunks)
    
    # URL grounding if user provided a link
    chunks = url_grounding(query, chunks)
    
    # Inject skills memory if available
    skills_context = ""
    try:
        from app.services.skills_service import get_skills
        skills = get_skills()
        if skills:
            skills_context = f"\n\nLEARNED SKILLS/RULES TO FOLLOW:\n{skills}\n"
    except ImportError:
        pass
        
    full_query = query + skills_context
    
    # System prompt
    system_prompt = (
        "You are an autonomous agent assisting the user. "
        "If you want to save a permanent rule about the user's preferences, write 'SAVE RULE: <rule>'."
    )
    
    answer = generate(full_query, chunks, history=history, model=model)
    
    # Intercept Skills
    import re
    rule_match = re.search(r"SAVE RULE:\s*(.+)", answer, re.IGNORECASE)
    if rule_match:
        rule = rule_match.group(1).strip()
        try:
            from app.services.skills_service import save_skill
            save_skill(rule)
            # Remove the rule text from the final answer shown to the user
            answer = re.sub(r"SAVE RULE:\s*(.+)", f"*(Learned a new skill: {rule})*", answer, flags=re.IGNORECASE)
        except ImportError:
            pass
    
    # Save to memory
    if not answer.startswith("Error:"):
        from app.services.memory_service import memory_service
        memory_service.add_message(state["session_id"], "user", query)
        memory_service.add_message(state["session_id"], "assistant", answer)
        
    # Format sources
    sources = [
        ChatSource(
            chunk_id=chunk.chunk_id,
            source=chunk.metadata.source,
            page=chunk.metadata.page,
            score=chunk.score,
            text=(chunk.text[:300] + "…") if len(chunk.text) > 300 else chunk.text,
        )
        for chunk in chunks
    ]
    
    attempts = state.get("attempts", 0) + 1
    return {"answer": answer, "sources": sources, "attempts": attempts}

def verify_node(state: AgentState):
    """
    Agentic reflection step: uses a smaller/faster LLM call to verify if the 
    generated answer is grounded in the retrieved chunks. If it detects a hallucination,
    it returns a flag to regenerate.
    """
    answer = state["answer"]
    chunks = state.get("retrieved_chunks", [])
    attempts = state.get("attempts", 1)
    
    # If we've already tried regenerating twice, just return the answer to avoid infinite loops
    if attempts >= 3 or not chunks:
        return state
        
    # We use the generator to do a quick Yes/No verification
    context = "\n\n".join([c.text for c in chunks])
    verification_query = (
        f"You are a strict fact-checker. Determine if the following statement is supported by the context.\n"
        f"Context: {context}\n\n"
        f"Statement: {answer}\n\n"
        f"Reply ONLY with 'YES' if it is supported, or 'NO' if it introduces facts not in the context."
    )
    
    from app.rag.generator import generate
    model = state.get("model")
    
    try:
        verification = generate(verification_query, [], [], model=model).strip().upper()
        if verification.startswith("NO"):
            # It's a hallucination, append a strict instruction to the query for the next generation pass
            new_query = state["query"] + "\n\nCRITICAL INSTRUCTION: Your previous answer hallucinated facts. You MUST stick ONLY to the provided context."
            return {"query": new_query, "answer": ""} # Reset answer
    except Exception as e:
        pass
        
    return state

# Build LangGraph Agent Workflow
workflow = StateGraph(AgentState)
workflow.add_node("retrieve", retrieve_node)
workflow.add_node("rerank", rerank_node)
workflow.add_node("memory", memory_node)
workflow.add_node("generate", generate_node)
workflow.add_node("verify", verify_node)

workflow.set_entry_point("retrieve")

def should_rerank(state: AgentState):
    if settings.USE_RERANKER:
        return "rerank"
    return "memory"

def should_regenerate(state: AgentState):
    if state.get("answer") == "" and state.get("attempts", 0) < 3:
        return "generate"
    return END

workflow.add_conditional_edges("retrieve", should_rerank)
workflow.add_edge("rerank", "memory")
workflow.add_edge("memory", "generate")
workflow.add_edge("generate", "verify")
workflow.add_conditional_edges("verify", should_regenerate)

app_graph = workflow.compile()

def run_pipeline(
    query: str,
    session_id: str,
    user_id: str,
    document_id: str | None = None,
    top_k: int = 5,
    model: str | None = None
) -> ChatResponse:
    """
    Orchestrates the entire RAG pipeline using a LangGraph State Machine.
    """
    start_time = time.perf_counter()
    
    initial_state = {
        "query": query,
        "session_id": session_id,
        "user_id": user_id,
        "document_id": document_id,
        "top_k": top_k,
        "candidate_pool": [],
        "retrieved_chunks": [],
        "history": [],
        "answer": "",
        "sources": [],
        "attempts": 0
    }
    
    final_state = app_graph.invoke(initial_state)
    latency_ms = int((time.perf_counter() - start_time) * 1000)
    
    return ChatResponse(
        answer=final_state["answer"],
        sources=final_state["sources"],
        session_id=session_id,
        latency_ms=latency_ms
    )



def run_pipeline_stream(
    query: str,
    session_id: str,
    user_id: str,
    document_id: str | None = None,
    top_k: int = 5,
    model: str | None = None
) -> tuple[list[RetrievedChunk], list[dict], list[ChatSource]]:
    """
    Orchestrates the retrieval and reranking stages of the RAG pipeline,
    and returns the selected context chunks, conversation history, and formatted sources,
    ready to be streamed to the client.
    """
    # 2. Retrieve relevant chunks
    if settings.USE_RERANKER:
        candidate_pool = retrieve(query, top_k=25, document_id=document_id, user_id=user_id)
        reranked_chunks = rerank_chunks(query, candidate_pool)
        retrieved_chunks = reranked_chunks[:top_k]
    else:
        retrieved_chunks = retrieve(query, top_k=top_k, document_id=document_id, user_id=user_id)

    from app.rag.tools import fallback_to_web_search, url_grounding
    
    # Web search fallback
    retrieved_chunks = fallback_to_web_search(query, retrieved_chunks)
    
    # URL grounding if user provided a link
    retrieved_chunks = url_grounding(query, retrieved_chunks)

    # Context Assembly: Deduplicate and Order chronologically
    seen = set()
    unique_chunks = []
    for chunk in retrieved_chunks:
        if chunk.chunk_id not in seen:
            seen.add(chunk.chunk_id)
            unique_chunks.append(chunk)
            
    # Sort by document, then page, then chunk index to provide logical chronological context to LLM
    unique_chunks.sort(key=lambda c: (c.metadata.document_id, c.metadata.page, c.metadata.chunk_index))
    retrieved_chunks = unique_chunks

    from app.services.memory_service import memory_service
    history = memory_service.get_history(session_id)

    sources = [
        ChatSource(
            chunk_id=chunk.chunk_id,
            source=chunk.metadata.source,
            page=chunk.metadata.page,
            score=chunk.score,
            text=(chunk.text[:300] + "…") if len(chunk.text) > 300 else chunk.text,
        )
        for chunk in retrieved_chunks
    ]
    return retrieved_chunks, history, sources
