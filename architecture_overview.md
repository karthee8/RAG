# AetherRAG Architecture Overview

This document provides a comprehensive breakdown of the frontend and backend architectures for the AetherRAG project, detailing how the different components are structured and how they communicate with each other.

---

## 1. High-Level System Architecture

AetherRAG is built on a decoupled **Client-Server architecture**.
*   **Frontend**: A modern web application built with **Next.js** (React), serving as the user interface and handling client-side state, layouts, and API proxying.
*   **Backend**: A high-performance REST API built with **FastAPI** (Python). It is responsible for handling heavy computational tasks like Natural Language Processing (NLP), document ingestion, vector embeddings, and Retrieval-Augmented Generation (RAG) using Large Language Models (LLMs).

Communication between the two occurs over HTTP (REST) and Server-Sent Events (SSE) for streaming real-time chat responses.

---

## 2. Frontend Architecture (Next.js)

The frontend is located in `d:\RAG\frontend` and uses the **Next.js App Router** (`src/app`). It emphasizes a rich, interactive UI combined with a proxy layer for security and ease of local development.

### Core Technologies
*   **Framework**: Next.js 15+ (React 19)
*   **Styling**: Tailwind CSS, integrated with `lucide-react` for iconography.
*   **State Management**: [Zustand](https://github.com/pmndrs/zustand) (found in `src/stores`), used for managing global app state such as authentication (`auth.store.ts`) and user workspaces (`workspace.store.ts`).
*   **Mock Database**: For rapid frontend development and local persistence of conversations and workspace configurations, the frontend uses a local JSON-backed mock database (`src/lib/mock-db.ts`).

### Directory Structure & Responsibilities
*   **`src/app/`**: Contains the page layouts, UI components, and the Next.js App Router structure.
*   **`src/app/api/`**: **The Proxy Layer**. Next.js API routes (like `/api/documents`, `/api/messages`, `/api/workspaces`) intercept calls from the browser. 
    *   *Why?* This allows the frontend to manage a local database of workspaces and chat history (`mock-db.ts`) while securely forwarding computationally heavy tasks (like file uploads and LLM queries) to the Python backend.
*   **`src/components/`**: Modular React components. Key folders include `/chat` for the chat interface (streaming text processing) and `/upload` for the drag-and-drop document upload zones.
*   **`src/lib/api-client.ts`**: A centralized `fetch` wrapper that handles attaching authorization headers and standardizing error handling for all outbound requests.

### Data Flow Example (Chat)
1. User types a message in `ChatArea.tsx`.
2. The component calls `fetch('/api/messages')` (Next.js API route).
3. The Next.js API route opens a stream to the FastAPI backend (`/api/chat/query/stream`).
4. As tokens (words) stream in from the backend LLM, the Next.js API route relays them back to `ChatArea.tsx` in real-time using Server-Sent Events (SSE).

---

## 3. Backend Architecture (FastAPI)

The backend is located in `d:\RAG\backend` and serves as the heavy-lifting engine for document processing and AI generation. 

### Core Technologies
*   **Framework**: FastAPI (Python), known for high performance and native async support.
*   **Database (Relational)**: PostgreSQL (via SQLAlchemy ORM & Alembic for migrations) for storing users, document metadata, and system configuration.
*   **Database (Vector)**: [ChromaDB](https://www.trychroma.com/), used to store and retrieve dense vector embeddings for RAG document similarity searches.
*   **Background Processing**: Relies on `asyncio` and FastAPI `BackgroundTasks` to process files without blocking the main API threads.
*   **AI / Machine Learning**: 
    *   **Embeddings**: FastEmbed (using `nomic-ai/nomic-embed-text-v1.5`)
    *   **LLM Provider**: Configurable to use local models via Ollama (`qwen3.5:4b`) or hosted models via OpenRouter.
    *   **Extraction Libraries**: `pypdf`, `python-docx`, `easyocr` (for image/scanned PDF text extraction), and `openai-whisper` (for transcribing audio/video files like `.mp4`).

### Directory Structure & Responsibilities
*   **`app/main.py`**: The entry point. Initializes the FastAPI application, mounts CORS middleware, and registers the routers.
*   **`app/api/`**: The route controllers for `auth.py`, `chat.py`, `documents.py`, etc.
*   **`app/rag/`**: The core AI logic.
    *   `extractor.py`: Handles parsing text out of various file formats (PDF, DOCX, TXT, MP4, PNG).
    *   `generator.py`: Manages communication with the LLMs (Ollama/OpenRouter) for answering user questions.
    *   `indexer.py` & `retriever.py`: Manages chunking documents, converting them into vector embeddings, saving them to ChromaDB, and retrieving the top-K most relevant chunks when a user asks a question.
*   **`app/services/`**: Business logic, such as `document_service.py` which orchestrates the pipeline of uploading a file, extracting text, chunking, and embedding it in the background.
*   **`app/db/` & `app/models/`**: SQLAlchemy configurations and database schemas.
*   **`app/core/config.py`**: Pydantic-based configuration management loading environments from `.env`.

### Data Flow Example (Document Upload)
1. Next.js proxy forwards a multipart form file (e.g., `.pdf` or `.mp4`) to the backend `/api/documents/upload`.
2. The FastAPI route saves the file to the `./uploads` directory and returns a `document_id` immediately to the frontend.
3. In the background, `document_service.py` takes over:
    * Extracts text (using `whisper` for video, `easyocr`/`pypdf` for documents).
    * Chunks the text into smaller overlapping segments.
    * Generates embeddings for each chunk using `FastEmbed`.
    * Stores the embeddings in ChromaDB.
4. The frontend can occasionally poll the backend's `/progress` endpoint to update the UI from "processing" to "ready".
