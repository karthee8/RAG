# AetherRAG Frontend Architecture Overview

This document provides a comprehensive breakdown of the frontend architecture for the AetherRAG project.

## 1. High-Level Overview

The frontend is located in `d:\RAG\frontend` and uses the **Next.js App Router** (`src/app`). It emphasizes a rich, interactive UI combined with a proxy layer for security and ease of local development. It is built as a single-page application (SPA) style interface rendered mostly on the client side, while leveraging Next.js server-side capabilities for routing and API requests.

## 2. Core Technologies
*   **Framework**: Next.js 15+ (React 19)
*   **Styling**: Tailwind CSS, integrated with `lucide-react` for iconography.
*   **State Management**: [Zustand](https://github.com/pmndrs/zustand) (found in `src/stores`), used for managing global app state such as authentication (`auth.store.ts`) and user workspaces (`workspace.store.ts`).
*   **Mock Database**: For rapid frontend development and local persistence of conversations and workspace configurations, the frontend uses a local JSON-backed mock database (`src/lib/mock-db.ts`).

## 3. Directory Structure & Responsibilities
*   **`src/app/`**: Contains the page layouts, UI components, and the Next.js App Router structure.
*   **`src/app/api/`**: **The Proxy Layer**. Next.js API routes (like `/api/documents`, `/api/messages`, `/api/workspaces`) intercept calls from the browser. 
    *   *Why?* This allows the frontend to manage a local database of workspaces and chat history (`mock-db.ts`) while securely forwarding computationally heavy tasks (like file uploads and LLM queries) to the Python backend.
*   **`src/components/`**: Modular React components. Key folders include `/chat` for the chat interface (streaming text processing) and `/upload` for the drag-and-drop document upload zones.
*   **`src/lib/api-client.ts`**: A centralized `fetch` wrapper that handles attaching authorization headers and standardizing error handling for all outbound requests.

## 4. Data Flow Example (Chat Interaction)
1. User types a message in `ChatArea.tsx`.
2. The component calls `fetch('/api/messages')` (Next.js API route).
3. The Next.js API route opens a stream to the FastAPI backend (`/api/chat/query/stream`).
4. As tokens (words) stream in from the backend LLM, the Next.js API route relays them back to `ChatArea.tsx` in real-time using Server-Sent Events (SSE).
