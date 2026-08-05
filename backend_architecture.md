# AetherRAG Backend Architecture Overview

This document provides a comprehensive breakdown of the backend architecture for the AetherRAG project.

## 1. High-Level Overview

The backend is located in `d:\RAG\backend` and serves as the heavy-lifting engine for document processing and AI generation. It acts as a high-performance REST API built with FastAPI, executing heavy Natural Language Processing (NLP), document ingestion, vector embeddings, and Retrieval-Augmented Generation (RAG).

## 2. Core Technologies
*   **Framework**: FastAPI (Python), known for high performance and native async support.
*   **Database (Relational)**: PostgreSQL (via SQLAlchemy ORM & Alembic for migrations) for storing users, document metadata, and system configuration.
*   **Database (Vector)**: [ChromaDB](https://www.trychroma.com/), used to store and retrieve dense vector embeddings for RAG document similarity searches.
*   **Background Processing**: Relies on `asyncio` and FastAPI `BackgroundTasks` to process files without blocking the main API threads.
*   **AI / Machine Learning**: 
    *   **Embeddings**: FastEmbed (using `nomic-ai/nomic-embed-text-v1.5`)
    *   **LLM Provider**: Configurable to use local models via Ollama (`qwen3.5:4b`) or hosted models via OpenRouter.
    *   **Extraction Libraries**: `pypdf`, `python-docx`, `easyocr` (for image/scanned PDF text extraction), and `openai-whisper` (for transcribing audio/video files like `.mp4`).

## 3. Directory Structure & Responsibilities
*   **`app/main.py`**: The entry point. Initializes the FastAPI application, mounts CORS middleware, and registers the routers.
*   **`app/api/`**: The route controllers for `auth.py`, `chat.py`, `documents.py`, etc.
*   **`app/rag/`**: The core AI logic.
    *   `extractor.py`: Handles parsing text out of various file formats (PDF, DOCX, TXT, MP4, PNG).
    *   `generator.py`: Manages communication with the LLMs (Ollama/OpenRouter) for answering user questions.
    *   `indexer.py` & `retriever.py`: Manages chunking documents, converting them into vector embeddings, saving them to ChromaDB, and retrieving the top-K most relevant chunks when a user asks a question.
*   **`app/services/`**: Business logic, such as `document_service.py` which orchestrates the pipeline of uploading a file, extracting text, chunking, and embedding it in the background.
*   **`app/db/` & `app/models/`**: SQLAlchemy configurations and database schemas.
*   **`app/core/config.py`**: Pydantic-based configuration management loading environments from `.env`.

## 4. Data Flow Example (Document Upload)
1. Next.js proxy forwards a multipart form file (e.g., `.pdf` or `.mp4`) to the backend `/api/documents/upload`.
2. The FastAPI route saves the file to the `./uploads` directory and returns a `document_id` immediately to the frontend.
3. In the background, `document_service.py` takes over:
    * Extracts text (using `whisper` for video, `easyocr`/`pypdf` for documents).
    * Chunks the text into smaller overlapping segments.
    * Generates embeddings for each chunk using `FastEmbed`.
    * Stores the embeddings in ChromaDB.
4. The frontend can occasionally poll the backend's `/progress` endpoint to update the UI from "processing" to "ready".
