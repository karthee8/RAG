import { NextResponse } from 'next/server'
import { mockDb } from '@/lib/mock-db'

import { env } from '@/lib/env'
const BACKEND_URL = env.BACKEND_URL

export async function POST(request: Request) {
  try {
    const { url, workspaceId } = await request.json()
    if (!url) {
      return NextResponse.json({ message: 'Missing url field' }, { status: 400 })
    }

    const authHeader = request.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')

    try {
      const backendResponse = await fetch(`${BACKEND_URL}/api/documents/ingest-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ url }),
      })

      if (backendResponse.ok) {
        const backendResult = await backendResponse.json()
        
        // Register in local mock DB for the workspace view
        // We'll mark the type as 'md' or 'txt' for URLs.
        const docType = url.includes('youtube.com') || url.includes('youtu.be') ? 'mp3' : 'md'
        const docName = url
        
        const doc = mockDb.addDocument(
          docName,
          0, // Size unknown
          docType,
          workspaceId || null,
          backendResult.document_id
        )

        return NextResponse.json({
          ...doc,
          backendDocumentId: backendResult.document_id,
          backendStatus: backendResult.status,
          backendMessage: backendResult.message
        }, { status: 201 })
      } else {
        const errorData = await backendResponse.json().catch(() => ({}))
        console.warn('Backend URL ingest failed:', errorData)
        return NextResponse.json(
          { message: errorData.detail || 'Backend URL ingest failed' },
          { status: backendResponse.status }
        )
      }
    } catch (backendError) {
      console.warn('Backend not available for URL ingest, using mock:', backendError)
      // Fallback to mock
      const docType = url.includes('youtube.com') || url.includes('youtu.be') ? 'mp3' : 'md'
      const doc = mockDb.addDocument(
        url,
        0,
        docType,
        workspaceId || null
      )
      return NextResponse.json(doc, { status: 201 })
    }
  } catch (err) {
    console.error('Error in URL ingest route:', err)
    return NextResponse.json({ message: 'Bad request' }, { status: 400 })
  }
}

