export interface User {
  id: string
  name: string
  email: string
  avatar?: string
  plan: 'free' | 'pro' | 'enterprise'
  createdAt: string
}

export interface Conversation {
  id: string
  title: string
  workspaceId: string | null
  messageCount: number
  createdAt: string
  updatedAt: string
}

export interface RetrievedChunk {
  id: string
  documentId: string
  documentName: string
  content: string
  score: number          // 0-1 cosine similarity
  pageNumber?: number
  highlight?: string     // substring to highlight
}

export interface Citation {
  index: number          // [1], [2] in rendered text
  documentId: string
  documentName: string
  excerpt: string
  pageNumber?: number
  score?: number
}

export interface Message {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  citations: Citation[]
  chunks: RetrievedChunk[]
  tokensUsed?: number
  contextMeter?: { tokensUsed: number, contextLimit: number }
  createdAt: string
}

export interface Document {
  id: string
  name: string
  type: 'pdf' | 'docx' | 'txt' | 'csv' | 'md' | 'mp3'
  size: number           // bytes
  status: 'queued' | 'extracting' | 'chunking' | 'embedding' | 'ready' | 'failed'
  pageCount?: number
  chunkCount?: number
  workspaceId: string | null
  uploadedAt: string
  backendDocumentId?: string
}

export interface Workspace {
  id: string
  name: string
  description?: string
  documentCount: number
  memberCount: number
  createdAt: string
}

export interface AnalyticsData {
  totalTokens: number
  totalQueries: number
  totalDocuments: number
  avgResponseTime: number   // ms
  dailyUsage: { date: string; tokens: number; queries: number }[]
  topDocuments: { documentId: string; name: string; queryCount: number }[]
}

// SSE streaming event definitions
export type SSEEvent =
  | { type: 'token'; data: { text: string } }
  | { type: 'retrieval'; data: { chunks: RetrievedChunk[] } }
  | { type: 'citation'; data: { citations: Citation[] } }
  | { type: 'done'; data: { messageId: string; tokensUsed: number } }
  | { type: 'error'; data: { code: string; message: string } }
