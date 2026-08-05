import { NextResponse } from 'next/server'
import { mockDb } from '@/lib/mock-db'

import { env } from '@/lib/env'
const BACKEND_URL = env.BACKEND_URL

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const conversationId = resolvedParams.id

  if (!conversationId) {
    return NextResponse.json({ message: 'ConversationId is required' }, { status: 400 })
  }

  // Clear from local mock DB so the frontend doesn't show old messages
  mockDb.messages = mockDb.messages.filter((m) => m.conversationId !== conversationId)

  // Try to get auth token from request headers
  const authHeader = request.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')

  // Clear from real backend memory service
  try {
    const backendResponse = await fetch(`${BACKEND_URL}/api/chat/${conversationId}/history`, {
      method: 'DELETE',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    })
    
    if (backendResponse.ok) {
      return NextResponse.json({ status: 'success', message: 'Chat history cleared' })
    }
  } catch (error) {
    console.error('Failed to clear backend chat history:', error)
  }

  return NextResponse.json({ status: 'success', message: 'Chat history cleared locally' })
}
