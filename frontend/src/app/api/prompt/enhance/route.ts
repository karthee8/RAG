import { NextResponse } from 'next/server'

import { env } from '@/lib/env'
const BACKEND_URL = env.BACKEND_URL

export async function POST(request: Request) {
  try {
    const body = await request.json()

    if (!body.prompt || !body.prompt.trim()) {
      return NextResponse.json({ message: 'Prompt is required' }, { status: 400 })
    }

    // Get auth token
    const authHeader = request.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')

    try {
      const backendResponse = await fetch(`${BACKEND_URL}/api/prompt/enhance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ prompt: body.prompt }),
      })

      if (backendResponse.ok) {
        const data = await backendResponse.json()
        return NextResponse.json(data)
      }

      // If backend returned 401, propagate it
      if (backendResponse.status === 401) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
      }

      const errorData = await backendResponse.json().catch(() => ({}))
      console.warn('Backend prompt enhance failed:', errorData)
      return NextResponse.json(
        { message: errorData.detail || 'Backend enhance failed' },
        { status: backendResponse.status }
      )
    } catch (backendError) {
      console.warn('Backend not available for prompt enhance:', backendError)
      // Fallback: return original prompt
      return NextResponse.json({ enhanced_prompt: body.prompt })
    }
  } catch {
    return NextResponse.json({ message: 'Bad request' }, { status: 400 })
  }
}

