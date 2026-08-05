import { NextResponse } from 'next/server'
import { mockDb } from '@/lib/mock-db'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const workspaceId = url.searchParams.get('workspaceId')

  let convs = mockDb.conversations
  if (workspaceId) {
    convs = convs.filter((c) => c.workspaceId === workspaceId)
  }
  return NextResponse.json(convs)
}

export async function POST(request: Request) {
  try {
    const { title, workspaceId } = await request.json()
    if (!title) {
      return NextResponse.json({ message: 'Title is required' }, { status: 400 })
    }
    const conv = mockDb.addConversation(title, workspaceId || null)
    return NextResponse.json(conv, { status: 201 })
  } catch {
    return NextResponse.json({ message: 'Bad request' }, { status: 400 })
  }
}
