<p align="center">
  <h1 align="center">AetherRAG: A Resilient, Local-First Retrieval-Augmented Generation System with Hybrid Search and Anti-Hallucination Guardrails</h1>
</p>

<p align="center">
  <strong>Karthikeyan R</strong>
</p>

<p align="center">
  <a href="https://github.com/karthee8/RAG">
    <img src="https://img.shields.io/badge/Code-GitHub-181717?style=flat-square&logo=github" alt="GitHub">
  </a>
  <img src="https://img.shields.io/badge/Python-3.12+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-005571?style=flat-square&logo=fastapi" alt="FastAPI">
  <img src="https://img.shields.io/badge/Next.js-15+-000000?style=flat-square&logo=next.js" alt="Next.js">
  <img src="https://img.shields.io/badge/Electron-Desktop-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License">
</p>

---

## Abstract

Large Language Models (LLMs) have demonstrated remarkable capabilities in natural language understanding and generation. However, their tendency to hallucinate—producing plausible but factually incorrect responses—remains a critical barrier to deployment in knowledge-intensive applications. Retrieval-Augmented Generation (RAG) addresses this by grounding LLM responses in retrieved evidence, yet existing RAG systems often suffer from fragile infrastructure dependencies, weak retrieval filtering, and poor degradation under service failures.

We present **AetherRAG**, a full-stack, local-first RAG desktop application that combines hybrid retrieval (dense semantic search + sparse BM25), cross-encoder reranking, strict anti-hallucination prompt engineering, and a graceful degradation architecture that ensures continuous operation even when optional services (PostgreSQL, Redis, cloud-based LLMs) become unavailable. Our system supports multi-modal document ingestion (PDF, DOCX, images via OCR, and audio/video via Whisper), semantic chunking, and real-time streaming responses. AetherRAG is packaged as a single-click desktop installer via Electron and PyInstaller, requiring no external infrastructure to operate.

**Keywords:** Retrieval-Augmented Generation, Hybrid Search, Cross-Encoder Reranking, Anti-Hallucination, Graceful Degradation, Local-First Architecture, LangGraph

---

## Table of Contents

- [1. Introduction](#1-introduction)
- [2. Related Work](#2-related-work)
- [3. System Architecture](#3-system-architecture)
- [4. Methodology](#4-methodology)
  - [4.1 Document Ingestion & Semantic Chunking](#41-document-ingestion--semantic-chunking)
  - [4.2 Hybrid Retrieval](#42-hybrid-retrieval)
  - [4.3 Cross-Encoder Reranking & Filtering](#43-cross-encoder-reranking--filtering)
  - [4.4 LangGraph Pipeline Orchestration](#44-langgraph-pipeline-orchestration)
  - [4.5 Anti-Hallucination Guardrails](#45-anti-hallucination-guardrails)
  - [4.6 Graceful Degradation](#46-graceful-degradation)
- [5. Implementation](#5-implementation)
- [6. Evaluation](#6-evaluation)
- [7. Reproducibility](#7-reproducibility)
- [8. Limitations & Future Work](#8-limitations--future-work)
- [9. Conclusion](#9-conclusion)
- [References](#references)

---

## 1. Introduction

The rise of large language models such as GPT-4 (OpenAI, 2023), Llama 3 (Meta, 2024), and Qwen (Alibaba, 2024) has transformed natural language processing. However, deploying these models in knowledge-intensive settings—legal analysis, medical records, enterprise documentation—exposes a fundamental weakness: **hallucination**. Models confidently generate plausible-sounding but unsupported claims when they lack sufficient grounding in source material.

Retrieval-Augmented Generation (RAG), introduced by Lewis et al. (2020), mitigates this problem by coupling a retriever module with a generator module. The retriever fetches relevant passages from a document corpus, and the generator conditions its response on the retrieved evidence. While effective in principle, many production RAG systems remain brittle: they depend on always-available cloud services, use simplistic retrieval strategies (e.g., pure vector similarity), and lack explicit mechanisms to detect and suppress hallucination when retrieval quality is poor.

**AetherRAG** addresses these shortcomings with three core contributions:

1. **Hybrid Retrieval with Aggressive Reranking.** We combine dense semantic search (BAAI/bge-small-en-v1.5, 384-d) with sparse lexical search (BM25) using a tunable alpha weighting, followed by cross-encoder reranking (ms-marco-MiniLM-L-6-v2) with strict score-based filtering.

2. **Anti-Hallucination by Design.** Chunks below the reranker threshold are actively dropped. When no evidence survives filtering, the system deterministically outputs a refusal rather than fabricating an answer.

3. **Graceful Degradation Architecture.** The system automatically falls back across every dependency layer—PostgreSQL → SQLite, Redis → in-memory dict, OpenRouter → local Ollama—ensuring zero-downtime operation without user intervention.

---

## 2. Related Work

| System | Hybrid Search | Reranking | Anti-Hallucination | Offline Capable | Desktop App |
|--------|:---:|:---:|:---:|:---:|:---:|
| LangChain RAG (Chase, 2022) | ✗ | ✗ | ✗ | ✗ | ✗ |
| LlamaIndex (Liu, 2022) | ✓ | ✓ | Partial | ✗ | ✗ |
| PrivateGPT (Martinez, 2023) | ✗ | ✗ | ✗ | ✓ | ✗ |
| Danswer (Phan et al., 2023) | ✓ | ✓ | Partial | ✗ | ✗ |
| **AetherRAG (Ours)** | **✓** | **✓** | **✓** | **✓** | **✓** |

AetherRAG differentiates itself by being the only system in this comparison that simultaneously provides hybrid search, cross-encoder reranking, explicit anti-hallucination guardrails, full offline capability, and a single-click desktop installer.

---

## 3. System Architecture

AetherRAG follows a three-tier decoupled architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                     ELECTRON DESKTOP SHELL                      │
│  ┌───────────────────────┐    ┌───────────────────────────────┐ │
│  │   Frontend (Next.js)  │    │   Backend (FastAPI/Python)    │ │
│  │                       │    │                               │ │
│  │  • App Router (React) │    │  • LangGraph RAG Pipeline     │ │
│  │  • Zustand State      │◄──►│  • Hybrid Retrieval (Dense    │ │
│  │  • SSE Streaming      │HTTP│    + BM25)                    │ │
│  │  • API Proxy Layer    │SSE │  • Cross-Encoder Reranker     │ │
│  │  • Sources Drawer     │    │  • ChromaDB / LanceDB         │ │
│  │  • Observability      │    │  • Multi-modal Extraction     │ │
│  │    Dashboard          │    │  • Graceful Degradation       │ │
│  └───────────────────────┘    └───────────────────────────────┘ │
│                                        │                        │
│                          ┌─────────────┼─────────────┐          │
│                          ▼             ▼             ▼          │
│                    ┌──────────┐ ┌───────────┐ ┌────────────┐    │
│                    │PostgreSQL│ │   Redis    │ │  Ollama /  │    │
│                    │(or SQLite│ │(or memory) │ │ OpenRouter │    │
│                    │ fallback)│ │            │ │            │    │
│                    └──────────┘ └───────────┘ └────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Figure 1.** High-level system architecture of AetherRAG. The Electron shell orchestrates both the Next.js frontend and the PyInstaller-frozen FastAPI backend. All external dependencies (PostgreSQL, Redis, cloud LLMs) are optional with automatic local fallbacks.

---

## 4. Methodology

### 4.1 Document Ingestion & Semantic Chunking

AetherRAG supports ingestion of heterogeneous document types through specialized extractors:

| Format | Extraction Method | Library |
|--------|------------------|---------|
| PDF | Direct text extraction | `pypdf` |
| Scanned PDF / Images | Optical Character Recognition | `EasyOCR` |
| DOCX | Structured text parsing | `python-docx` |
| Video / Audio (.mp4) | Speech-to-text transcription | `openai-whisper` |
| YouTube URLs | Transcript API + audio fallback | `youtube-transcript-api`, `yt-dlp` |

Unlike naive fixed-length chunking, AetherRAG employs **semantic chunking** via `langchain-experimental`, which identifies natural semantic boundaries in text. This produces chunks that are conceptually coherent, improving downstream retrieval precision.

### 4.2 Hybrid Retrieval

We implement a hybrid retrieval strategy that fuses two complementary signals:

$$S_{\text{hybrid}}(q, d) = \alpha \cdot S_{\text{dense}}(q, d) + (1 - \alpha) \cdot S_{\text{BM25}}(q, d)$$

where:
- $S_{\text{dense}}(q, d)$ is the cosine similarity between the query embedding $\mathbf{e}_q$ and document chunk embedding $\mathbf{e}_d$, computed using **BAAI/bge-small-en-v1.5** (384-dimensional, ONNX-optimized via `fastembed`).
- $S_{\text{BM25}}(q, d)$ is the Okapi BM25 score (Robertson et al., 1995), computed using `rank-bm25`.
- $\alpha \in [0, 1]$ is a tunable interpolation weight.

Dense retrieval captures semantic similarity (e.g., "automobile" ↔ "car"), while BM25 captures exact lexical matches critical for named entities, part numbers, and domain-specific terminology.

### 4.3 Cross-Encoder Reranking & Filtering

Initial retrieval returns the top-$K$ candidates. These are then re-scored using a **cross-encoder reranker** (`ms-marco-MiniLM-L-6-v2`), which jointly encodes the query-document pair for more accurate relevance estimation:

$$r_i = \text{CrossEncoder}(q, d_i) \quad \forall \, d_i \in \text{Top-}K$$

We apply **strict score-based filtering**:

$$\mathcal{D}_{\text{filtered}} = \{ d_i \mid r_i \geq \tau \}$$

where $\tau$ (default = 0.5) is the minimum reranker score threshold. Chunks that fail to meet this threshold are **actively discarded**, even if they were the top-ranked results. This aggressive filtering is a key mechanism in our anti-hallucination strategy.

### 4.4 LangGraph Pipeline Orchestration

The RAG pipeline is modeled as a directed acyclic state machine using **LangGraph** (`StateGraph`):

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ RETRIEVE │───►│ RERANK   │───►│ MEMORY   │───►│ GENERATE │
│          │    │ & FILTER │    │ INJECT   │    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
     │                │                              │
     │          ┌─────┴─────┐                   ┌────┴────┐
     │          │ All chunks│                   │ Refusal │
     │          │ filtered  │                   │ if empty│
     │          │ out (∅)   │                   │ context │
     │          └───────────┘                   └─────────┘
```

**Figure 2.** LangGraph state machine for the RAG pipeline. Each node represents a processing stage with explicit state transitions.

| Node | Responsibility |
|------|---------------|
| **Retrieve** | Executes hybrid search (dense + BM25) against the vector store |
| **Rerank & Filter** | Applies cross-encoder scoring and drops sub-threshold chunks |
| **Memory Inject** | Appends prior conversation turns from session history |
| **Generate** | Synthesizes the answer using the LLM, conditioned on surviving context |

### 4.5 Anti-Hallucination Guardrails

AetherRAG implements a multi-layered defense against hallucination:

1. **Retrieval-Level Filtering.** Weak semantic candidates are pruned at the initial retrieval stage.
2. **Reranker-Level Filtering.** Cross-encoder scores below $\tau$ eliminate marginally relevant chunks.
3. **Prompt-Level Enforcement.** The system prompt explicitly instructs the LLM:

   > *"You are a strict, grounded assistant. You MUST answer ONLY from the provided context. If the context does not contain sufficient information to answer the question, you MUST respond exactly: 'I cannot find this in the provided documents.' Do NOT speculate, infer, or use external knowledge."*

4. **Deterministic Refusal.** If $|\mathcal{D}_{\text{filtered}}| = 0$ (no chunks survive filtering), the system bypasses the LLM entirely and returns a deterministic refusal response.

### 4.6 Graceful Degradation

A core design principle of AetherRAG is **zero single points of failure**. Every external dependency has an automatic local fallback:

| Dependency | Primary | Fallback | Detection |
|-----------|---------|----------|-----------|
| Relational DB | PostgreSQL (SQLAlchemy + Alembic) | SQLite (`sql_app.db`) | Connection refused on startup |
| Cache & Memory | Redis (semantic caching) | In-memory Python `dict` | `ConnectionError` exception |
| LLM Provider | OpenRouter (cloud, Llama 3) | Ollama (local, Qwen) | HTTP timeout / 5xx / network failure |
| Web Search | DuckDuckGo API | Disabled (local-only mode) | Network unreachable |

Fallback transitions are logged via `structlog` and surfaced in the frontend observability dashboard. No user intervention is required.

---

## 5. Implementation

### 5.1 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend Framework | FastAPI + Uvicorn | 0.115.0 |
| Pipeline Orchestration | LangGraph (StateGraph) | ≥ 0.2.20 |
| LLM Integration | LangChain + LangChain-Community | ≥ 0.3.0 |
| Embedding Model | BAAI/bge-small-en-v1.5 (ONNX) | via `fastembed` 0.8.0 |
| Reranker | ms-marco-MiniLM-L-6-v2 | via `sentence-transformers` ≥ 3.0 |
| Vector Store | ChromaDB / LanceDB | ≥ 0.8.2 |
| Sparse Retrieval | Okapi BM25 | `rank-bm25` ≥ 0.2.2 |
| Frontend Framework | Next.js (App Router, React 19) | 15+ |
| State Management | Zustand | Latest |
| Desktop Shell | Electron + electron-builder | Latest |
| Packaging | PyInstaller (backend) + NSIS (installer) | Latest |

### 5.2 Backend Module Structure

```
backend/app/
├── api/               # REST endpoint controllers (auth, chat, documents)
├── core/              # Configuration management (Pydantic Settings)
├── db/                # SQLAlchemy engine, session, and migrations
├── middleware/         # CORS, authentication, rate limiting
├── models/            # ORM models (User, Document, Chunk)
├── rag/               # Core RAG pipeline
│   ├── pipeline.py    # LangGraph StateGraph definition
│   ├── retriever.py   # Hybrid retrieval (dense + BM25)
│   ├── reranker.py    # Cross-encoder reranking & filtering
│   ├── embedder.py    # FastEmbed wrapper
│   ├── chunker.py     # Semantic chunking logic
│   ├── extractor.py   # Multi-modal text extraction
│   ├── generator.py   # LLM interface (OpenRouter / Ollama)
│   ├── vector_store.py# ChromaDB / LanceDB interface
│   ├── graph_store.py # Knowledge graph storage
│   └── tools.py       # Web search & auxiliary tools
├── schemas/           # Pydantic request/response schemas
├── services/          # Business logic & orchestration
├── utils/             # Logging, helpers
└── worker/            # Background task processing
```

### 5.3 Frontend Architecture

The Next.js frontend operates as both a user interface and a secure API proxy:

- **API Proxy Layer** (`src/app/api/`): Intercepts browser requests, manages local workspace/conversation state via a JSON-backed mock database, and forwards computation-heavy operations (file uploads, LLM queries) to the Python backend.
- **Real-Time Streaming**: Chat responses are delivered via Server-Sent Events (SSE), enabling token-by-token rendering in the UI.
- **Sources Drawer**: Each response includes citation metadata—chunk scores, source document references, and reranker confidence—enabling users to verify the grounding of every answer.

---

## 6. Evaluation

### 6.1 Test Suite

AetherRAG includes a comprehensive automated test suite covering:

| Test Module | Scope | Test Count |
|------------|-------|-----------|
| `test_qa_full_suite.py` | End-to-end QA accuracy | ~30+ |
| `test_qa_sections_5_6_7.py` | Domain-specific retrieval | ~25+ |
| `test_qa_sections_8_11.py` | Edge cases & adversarial queries | ~40+ |
| `test_authentication.py` | Auth flow & JWT validation | ~10+ |
| `test_security_hardening.py` | Input sanitization & injection defense | ~10+ |
| `test_upload.py` | Document ingestion pipeline | ~5+ |
| `test_chat_stream.py` | SSE streaming correctness | ~5+ |
| `eval_retrieval.py` | Retrieval precision/recall evaluation | Configurable |

### 6.2 Load Testing

The system includes a **Locust** load testing configuration (`locustfile.py`) for benchmarking API throughput and latency under concurrent user load.

---

## 7. Reproducibility

### 7.1 Prerequisites

- **Python** 3.12+
- **Node.js** 18+
- (Optional) **Ollama** for local LLM inference
- (Optional) **PostgreSQL** and **Redis**

### 7.2 Development Setup

```bash
# Clone the repository
git clone https://github.com/karthee8/RAG.git
cd RAG

# Launch both frontend and backend
.\scripts\StartRAG.ps1
```

The startup script automatically provisions the Python virtual environment, installs all dependencies, and starts the development servers.

### 7.3 Building the Production Installer

```bash
# 1. Freeze the Python backend into a standalone binary
cd backend
venv\Scripts\python -m PyInstaller packaging\strongrag-backend.spec

# 2. Build the Electron desktop installer
cd ../frontend
npm install && npm run dist
```

The resulting `.exe` installer in `frontend/dist/` bundles the entire stack into a single-click installation.

### 7.4 Configuration

On first launch, AetherRAG presents a secure setup dialog for entering API keys (e.g., OpenRouter). Keys are stored locally in the user's config directory and are **never** bundled in the application binary. See `.env.example` for all configurable parameters.

---

## 8. Limitations & Future Work

1. **Embedding Model Scale.** The current embedding model (bge-small-en-v1.5, 384-d) prioritizes inference speed over maximum retrieval accuracy. Future work will explore larger models (e.g., bge-large-en-v1.5, 1024-d) with quantization.

2. **Evaluation Benchmarks.** While AetherRAG includes a comprehensive test suite, formal evaluation on standard RAG benchmarks (e.g., Natural Questions, TriviaQA, KILT) is planned for future releases.

3. **Multi-Language Support.** The current system is optimized for English. Extending support to multilingual embeddings (e.g., `multilingual-e5-large`) is a natural extension.

4. **Knowledge Graph Integration.** The `graph_store.py` module provides preliminary support for knowledge graph construction (via `networkx`). Deeper integration of graph-based reasoning with vector retrieval is an active area of development.

5. **Fine-Tuned Rerankers.** Domain-specific fine-tuning of the cross-encoder reranker on user-uploaded corpora could further improve retrieval precision.

---

## 9. Conclusion

AetherRAG demonstrates that a production-grade, local-first RAG system can simultaneously achieve high retrieval quality, robust anti-hallucination behavior, and resilient operation without mandatory cloud dependencies. By combining hybrid retrieval, cross-encoder reranking with strict filtering, deterministic refusal on empty context, and a comprehensive graceful degradation architecture, AetherRAG provides a practical and deployable solution for knowledge-grounded question answering over private document collections.

---

## References

1. Lewis, P., Perez, E., Piktus, A., Petroni, F., Karpukhin, V., Goyal, N., ... & Kiela, D. (2020). Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks. *Advances in Neural Information Processing Systems (NeurIPS)*, 33, 9459–9474.

2. Robertson, S. E., & Zaragoza, H. (2009). The Probabilistic Relevance Framework: BM25 and Beyond. *Foundations and Trends in Information Retrieval*, 3(4), 333–389.

3. Nogueira, R., & Cho, K. (2019). Passage Re-ranking with BERT. *arXiv preprint arXiv:1901.04085*.

4. Xiao, S., Liu, Z., Zhang, P., & Muennighoff, N. (2023). C-Pack: Packaged Resources to Advance General Chinese Embedding. *arXiv preprint arXiv:2309.07597*. (BAAI/bge model family)

5. Chase, H. (2022). LangChain. [Software]. https://github.com/langchain-ai/langchain

6. LangGraph Documentation. https://langchain-ai.github.io/langgraph/

7. Radford, A., Kim, J. W., Xu, T., Brockman, G., McLeavey, C., & Sutskever, I. (2023). Robust Speech Recognition via Large-Scale Weak Supervision. *International Conference on Machine Learning (ICML)*.

8. Liu, J. (2022). LlamaIndex. [Software]. https://github.com/run-llama/llama_index

---

<p align="center">
  <sub>© 2025 Karthikeyan R. Released under the MIT License.</sub>
</p>
