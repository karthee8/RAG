import { NextResponse } from 'next/server'
import { mockDb } from '@/lib/mock-db'

import { env } from '@/lib/env'
const BACKEND_URL = env.BACKEND_URL

export async function GET(request: Request) {
  const url = new URL(request.url)
  const workspaceId = url.searchParams.get('workspaceId')

  let docs = mockDb.documents
  if (workspaceId) {
    docs = docs.filter((d) => d.workspaceId === workspaceId)
  }
  return NextResponse.json(docs)
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('Content-Type') || ''

    // Handle multipart file upload — proxy to backend
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      const workspaceId = formData.get('workspaceId') as string | null

      if (!file) {
        return NextResponse.json({ message: 'No file provided' }, { status: 400 })
      }

      // Get auth token
      const authHeader = request.headers.get('Authorization') || ''
      const token = authHeader.replace('Bearer ', '')

      try {
        // Forward file to backend
        const backendFormData = new FormData()
        backendFormData.append('file', file)

        const backendResponse = await fetch(`${BACKEND_URL}/api/documents/upload`, {
          method: 'POST',
          headers: {
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: backendFormData,
        })

        if (backendResponse.ok) {
          const backendResult = await backendResponse.json()

          // Also register in local mock DB for the workspace view
          const fileExt = file.name.split('.').pop()?.toLowerCase() || 'txt'
          const allowedExts = ['pdf', 'docx', 'txt', 'csv', 'md', 'mp3', 'mp4', 'webm', 'png', 'jpg', 'jpeg', 'wav']
          const doc = mockDb.addDocument(
            file.name,
            file.size,
            allowedExts.includes(fileExt) ? (fileExt as any) : 'txt',
            workspaceId || null,
            backendResult.document_id
          )

          // Return combined info
          return NextResponse.json({
            ...doc,
            document_id: backendResult.document_id,
            backendDocumentId: backendResult.document_id,
            backendStatus: backendResult.status,
          }, { status: 201 })
        } else {
          const errorData = await backendResponse.json().catch(() => ({}))
          console.warn('Backend document upload failed:', errorData)
          return NextResponse.json(
            { message: errorData.detail || 'Backend upload failed' },
            { status: backendResponse.status }
          )
        }
      } catch (backendError) {
        console.warn('Backend not available for upload:', backendError)
        return NextResponse.json(
          { message: 'Backend service is offline. Please ensure the python backend is running.' },
          { status: 503 }
        )
      }
    }

    // Handle JSON body (original mock behavior for backward compat)
    const { name, size, type, workspaceId } = await request.json()
    if (!name || !size || !type) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 })
    }
    const doc = mockDb.addDocument(name, size, type, workspaceId || null)
    return NextResponse.json(doc, { status: 201 })
  } catch {
    return NextResponse.json({ message: 'Bad request' }, { status: 400 })
  }
}

