# AetherRAG (StrongRAG) - Project Architecture & Overview

AetherRAG is a full-stack, local-first Retrieval-Augmented Generation (RAG) desktop application. It is designed with a core philosophy of **graceful degradation**, ensuring the app remains functional even if optional external services (like Redis, Postgres, or internet-based LLMs) are unavailable. It prioritizes grounding and strict anti-hallucination guardrails to deliver a production-ready, reliable experience.

---

## 1. High-Level Architecture

The application is structured into three main layers:

1.  **Frontend (Next.js & React):** Provides a rich, responsive UI for chat, document management, and observability.
2.  **Backend (FastAPI):** Orchestrates the heavy lifting of RAG, including hybrid search, cross-encoder reranking, and LangGraph pipelines.
3.  **Desktop Shell (Electron):** Wraps the Next.js frontend and manages the lifecycle of the PyInstaller-frozen Python backend, providing a seamless single-click desktop experience.

---

## 2. Frontend Layer (Next.js)

*   **Framework:** Next.js App Router.
*   **Styling:** TailwindCSS for utility-first styling and a modern aesthetic.
*   **State Management:** Zustand for global state management (handling chat sessions, settings, etc.).
*   **Key Features:**
    *   **Streaming Chat:** Renders real-time LLM responses using Server-Sent Events (SSE).
    *   **Sources Drawer:** A dedicated UI component for viewing citations, chunk scores, and the exact source documents used to generate an answer.
    *   **Observability Dashboard:** A metrics dashboard fetching live data from the backend to monitor system health, database status, and API latencies.
    *   **First-Run Experience:** A startup dialog that prompts users for necessary API keys (e.g., OpenRouter) locally, ensuring secrets are never hardcoded into the installer.

---

## 3. Backend Layer (FastAPI)

The Python backend is the brain of the operation, structured around robust RAG pipelines.

### Core RAG Pipeline (LangGraph)
The pipeline is orchestrated using **LangGraph** (StateGraph), modeling the RAG process as a state machine:
1.  **Retrieve Node:** Fetches initial candidates.
2.  **Rerank Node:** Re-scores and aggressively filters candidates.
3.  **Memory Node:** Injects prior conversation history.
4.  **Generate Node:** Synthesizes the final answer using strictly enforced prompts.

### Ingestion & Chunking
*   **Supported Formats:** PDF, TXT, DOCX, plus multimedia (video/audio).
*   **Chunking:** Uses Semantic Chunking (via LangChain Experimental) to split documents based on semantic boundaries rather than arbitrary character limits.
*   **Special Extractors:** Capable of ingesting and extracting transcripts from YouTube URLs.

### Search & Retrieval
*   **Hybrid Search:** Combines dense Semantic Search (Vector) and sparse Lexical Search (BM25) using a weighted alpha score.
*   **Embeddings:** Uses `fastembed` with the ONNX `BAAI/bge-small-en-v1.5` (384-dimensional) model for blazing-fast local embeddings.
*   **Vector Store:** ChromaDB.

### Anti-Hallucination & Reranking
*   **Cross-Encoder Reranker:** Uses `ms-marco-MiniLM-L-6-v2` to score the relevance of retrieved chunks against the user's query.
*   **Strict Filtering:** Chunks with weak semantic baseline scores or low reranker scores (e.g., `< 0.5`) are actively dropped.
*   **Prompt Engineering:** The system strictly separates the system instructions from the user query, forcing the LLM to output exactly *"I cannot find this in the provided documents."* if the retrieved context is empty or irrelevant.

### Generation & LLMs
*   **Primary:** OpenRouter for access to high-quality, hosted free models (e.g., Llama 3).
*   **Fallback:** Ollama for fully local, offline inference (e.g., Qwen).
*   **Features:** Supports both standard REST completion and SSE streaming. Includes fallback logic to gracefully degrade from OpenRouter to Ollama on network failure.

### Advanced Tools
*   **Web-Search Fallback:** If local documents don't answer a query, the system can fallback to a DuckDuckGo web search to ground its answers.
*   **TTS Podcast Briefing:** An experimental Text-to-Speech service for generating audio briefings from documents.

---

## 4. Graceful Degradation & Resilience

A core differentiator of AetherRAG is its unbreakable design:
*   **Database:** Attempts to connect to PostgreSQL. If missing or unreachable, it silently falls back to a local SQLite database (`sql_app.db`).
*   **Memory & Cache:** Attempts to use Redis for Semantic Caching (to bypass LLM generation for repeated queries) and conversation history. If Redis is down, it falls back to a local, in-memory Python dictionary.
*   **LLM Connectivity:** Implements aggressive retry-with-backoff on OpenRouter 429 (Rate Limit) errors and falls back to local models when disconnected from the internet.

---

## 5. Deployment & Packaging

*   **Backend Freezing:** The FastAPI app and all its heavy ML dependencies (PyTorch, ONNX, Chroma) are bundled into a single standalone executable using `PyInstaller`.
*   **Electron Builder:** The Next.js static export and the Python executable are bundled together using `electron-builder` into an NSIS installer for Windows, ensuring the user only has to install a single `.exe` file to get the entire full-stack system running locally.
