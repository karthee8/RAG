# AetherRAG

A full-stack, local-first RAG desktop application designed to be production-shippable, unbreakable, and grounded.

## Architecture

* **Backend**: FastAPI (Python), LanceDB (vector store), SQLite/SQLAlchemy (users), Ollama (local LLM fallback) / OpenRouter, fastembed ONNX (BAAI/bge-small-en-v1.5), LangGraph (StateGraph orchestration).
* **Frontend**: Next.js (App Router, React), TailwindCSS, Zustand.
* **Shell**: Electron (packages Next.js and spawns the PyInstaller-frozen Python backend).

## Key Features

1. **Graceful Degradation**: 
    * Fully resilient to missing optional services (Redis, Postgres, Ollama). It seamlessly falls back to local SQLite, local dict-based memory, and OpenRouter hosted models.
2. **Anti-Hallucination**:
    * Aggressive retrieval thresholds, cross-encoder reranking filters, and strict LLM system prompts ensure the system only answers from context and rejects out-of-domain queries.
3. **Advanced Integrations**:
    * Includes web-search fallbacks for grounded knowledge, semantic chunking, YouTube ingest, and a TTS podcast briefing feature.
4. **Local-First & Secure**:
    * Keys are securely managed via the UI first-run flow and stored in the user's local config folder, never bundled in the app installer.

## Development

To launch the app in development mode:

1. Ensure Python 3.12+ and Node.js are installed.
2. Run the start script from the root directory:
   ```powershell
   .\scripts\StartRAG.ps1
   ```

## Production / Building the Installer

The backend is frozen using PyInstaller, and the frontend is packaged into an NSIS installer using Electron Builder.
The Electron shell orchestrates the lifecycle of both the UI and the local Python server.

1. Build the Python backend executable:
   ```bash
   cd backend
   venv\Scripts\python -m PyInstaller packaging\strongrag-backend.spec
   ```
2. Build the Electron installer:
   ```bash
   cd frontend
   npm run dist
   ```
The installer will be available in `frontend/dist/`.

## First-Run Experience

When a user runs AetherRAG for the first time, they will be greeted with a welcome screen prompting them to input any required API keys (e.g. OpenRouter). This prevents hard-coding secrets into the application bundle. The keys are saved locally in the app's secure config directory.
