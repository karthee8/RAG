# AetherRAG

![AetherRAG](https://img.shields.io/badge/AetherRAG-Local%20First-blue?style=for-the-badge)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![Next.js](https://img.shields.io/badge/Next.js-black?style=for-the-badge&logo=next.js)
![Python 3.12+](https://img.shields.io/badge/Python-3.12+-blue.svg?style=for-the-badge&logo=python)

A full-stack, local-first Retrieval-Augmented Generation (RAG) desktop application. Designed to be production-ready, resilient, and highly grounded to eliminate hallucinations.

AetherRAG emphasizes privacy and local processing, seamlessly combining the power of modern web technologies with robust Python-based machine learning pipelines.

---

## 🌟 Key Features

1. **Graceful Degradation**
   - Fully resilient to missing optional services (Redis, Postgres, Ollama).
   - Seamlessly falls back to local SQLite, local dict-based memory, and OpenRouter hosted models if local hardware acceleration is unavailable.

2. **Anti-Hallucination & Grounding**
   - Employs aggressive retrieval thresholds and cross-encoder reranking filters.
   - Strict LLM system prompts ensure the system only answers from the provided context, rejecting out-of-domain queries.

3. **Advanced Integrations**
   - Supports text extraction from a massive variety of file types: PDFs, DOCX, TXT.
   - Includes OCR capabilities for images and scanned PDFs via `EasyOCR`.
   - Native Video/Audio transcription using `OpenAI-Whisper`.
   - Web-search fallbacks for grounded knowledge, semantic chunking, YouTube ingest, and a text-to-speech (TTS) podcast briefing feature.

4. **Local-First & Secure**
   - API Keys are securely managed via the UI first-run flow and stored entirely in the user's local config folder.
   - Keys are **never** bundled in the app installer or leaked to external unauthorized services.

---

## 🏗️ Architecture

AetherRAG uses a decoupled **Client-Server architecture** orchestrated by an Electron shell.

### Backend (Python / FastAPI)
The engine powering the intelligence of AetherRAG:
- **API Framework:** FastAPI for high-performance, asynchronous REST endpoints.
- **Database:** PostgreSQL (or SQLite fallback) via SQLAlchemy.
- **Vector Store:** ChromaDB for managing dense vector embeddings.
- **Embeddings:** FastEmbed using `bge-small-en-v1.5`.
- **LLM Orchestration:** LangGraph (StateGraph) and LangChain, supporting Ollama (local) or OpenRouter (cloud).

### Frontend (TypeScript / Next.js)
The rich, interactive user interface:
- **Framework:** Next.js 15+ (App Router, React 19).
- **Styling:** TailwindCSS and `lucide-react`.
- **State Management:** Zustand for global states (auth, workspaces).
- **Architecture:** Uses a Next.js API Proxy layer to securely communicate with the Python backend via HTTP and Server-Sent Events (SSE) for real-time text streaming.

### Desktop Shell (Electron)
- Packages the Next.js frontend into a native OS window.
- Spawns and manages the lifecycle of the PyInstaller-frozen Python backend seamlessly in the background.

*For a deeper dive into the system design, see the [Architecture Overview](architecture_overview.md).*

---

## 🚀 Getting Started (Development)

To launch the app in development mode, you will need **Python 3.12+** and **Node.js** installed on your system.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/karthee8/RAG.git
   cd RAG
   ```

2. **Run the start script:**
   The easiest way to boot up both the frontend and backend in development mode is to use the provided PowerShell script:
   ```powershell
   .\scripts\StartRAG.ps1
   ```
   *This script will automatically set up your Python virtual environment, install dependencies, and start the development servers.*

---

## 📦 Production & Building the Installer

AetherRAG can be compiled into a single, standalone installer. The backend is frozen into a binary using **PyInstaller**, and the frontend is packaged into an NSIS installer using **Electron Builder**.

1. **Build the Python Backend Executable:**
   ```bash
   cd backend
   venv\Scripts\python -m PyInstaller packaging\strongrag-backend.spec
   ```

2. **Build the Electron Installer:**
   ```bash
   cd frontend
   npm install
   npm run dist
   ```

Once finished, the production-ready `.exe` installer will be located in the `frontend/dist/` directory.

---

## 🔒 First-Run Experience

When you run AetherRAG for the first time, you will be greeted by a secure setup screen. You will be prompted to input any required API keys (such as your OpenRouter key if you aren't using local Ollama models). This architecture ensures that secrets are kept safely on your local machine and are never hard-coded into the application bundle.
