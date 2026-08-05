# AetherRAG Frontend Architecture

## Stack Overview
- **Framework**: Next.js 15 (App Router)
- **UI Library**: React 19
- **Styling**: Tailwind CSS + Lucide React
- **State Management**: Zustand (Global), TanStack Query (Server State)
- **Data Fetching & API**: Fetch API, proxy through Next.js API Routes (`/api/*`)
- **Forms & Validation**: `react-hook-form` + Zod
- **Build & Environment**: `@t3-oss/env-nextjs`

## Core Concepts

### Next.js API Proxy
The frontend communicates directly with Next.js API routes (`src/app/api/`), which then securely proxies the requests to the Python FastAPI backend (`http://127.0.0.1:8000`). This hides backend URL configurations and mitigates CORS issues, while abstracting OAuth flow implementation.

### Global State vs. Server State
- **Zustand** is used for strictly local/global client state (e.g., active workspace selection, sidebar toggles, selected models).
- **TanStack Query** is used for server data synchronization (e.g., fetching documents, messaging history). This provides intelligent caching, retry mechanisms, and background polling capabilities (e.g., polling document ingestion progress).

### Server-Sent Events (SSE)
Streaming LLM responses in chat and document ingestion progress updates are handled via HTTP Server-Sent Events. These provide a low-latency mechanism for real-time client UI updates.

## Component Structure
- `src/components/chat`: Encapsulates the entire Chat UI, including `MessageBubble` rendering Markdown via `react-markdown` and `rehype-sanitize`.
- `src/components/upload`: Manages the drag-and-drop document ingestion interface using `react-dropzone`.
- `src/components/retrieval`: Renders the index of currently processed documents.

## Security & Validation
- Zod is utilized for runtime type-checking of data flowing through forms and external sources.
- User input via file uploads is validated client-side for MIME type and file size limits before transmission.
- Environment variables are validated at build-time using `env-nextjs`.
