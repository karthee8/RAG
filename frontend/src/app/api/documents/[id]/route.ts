import { NextResponse } from 'next/server'
import { mockDb } from '@/lib/mock-db'

import { env } from '@/lib/env'
const BACKEND_URL = env.BACKEND_URL

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const authHeader = request.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')

  try {
    const doc = mockDb.documents.find(d => d.id === id)
    const targetId = doc?.backendDocumentId || id

    const backendResponse = await fetch(`${BACKEND_URL}/api/documents/${targetId}`, {
      method: 'DELETE',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    })

    if (!backendResponse.ok) {
      console.warn('Backend document delete failed')
    }
  } catch (backendError) {
    console.warn('Backend not available for delete:', backendError)
  }

  const success = mockDb.deleteDocument(id)
  if (success) {
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ message: 'Document not found' }, { status: 404 })
}
