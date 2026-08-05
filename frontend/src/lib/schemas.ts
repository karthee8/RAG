import { z } from 'zod'

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  avatar: z.string().optional(),
  plan: z.enum(['free', 'pro', 'enterprise']),
  createdAt: z.string(),
})

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  documentCount: z.number(),
  memberCount: z.number(),
  createdAt: z.string(),
})

export const documentSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['pdf', 'docx', 'txt', 'csv', 'md', 'mp3']),
  size: z.number(),
  status: z.enum(['queued', 'extracting', 'chunking', 'embedding', 'ready', 'failed']),
  pageCount: z.number().optional(),
  chunkCount: z.number().optional(),
  workspaceId: z.string().nullable(),
  uploadedAt: z.string(),
  backendDocumentId: z.string().optional(),
})

export const conversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  workspaceId: z.string().nullable(),
  messageCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const retrievedChunkSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  documentName: z.string(),
  content: z.string(),
  score: z.number(),
  pageNumber: z.number().optional(),
  highlight: z.string().optional(),
})

export const citationSchema = z.object({
  index: z.number(),
  documentId: z.string(),
  documentName: z.string(),
  excerpt: z.string(),
  pageNumber: z.number().optional(),
  score: z.number().optional(),
})

export const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  citations: z.array(citationSchema),
  chunks: z.array(retrievedChunkSchema),
  tokensUsed: z.number().optional(),
  contextMeter: z.object({ tokensUsed: z.number(), contextLimit: z.number() }).optional(),
  createdAt: z.string(),
})

export const analyticsDataSchema = z.object({
  totalTokens: z.number(),
  totalQueries: z.number(),
  totalDocuments: z.number(),
  avgResponseTime: z.number(),
  dailyUsage: z.array(
    z.object({
      date: z.string(),
      tokens: z.number(),
      queries: z.number(),
    })
  ),
  topDocuments: z.array(
    z.object({
      documentId: z.string(),
      name: z.string(),
      queryCount: z.number(),
    })
  ),
})
