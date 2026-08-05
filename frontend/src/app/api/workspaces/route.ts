import { NextResponse } from 'next/server'
import { mockDb } from '@/lib/mock-db'

export async function GET() {
  return NextResponse.json(mockDb.workspaces)
}

export async function POST(request: Request) {
  try {
    const { name, description } = await request.json()
    if (!name) {
      return NextResponse.json({ message: 'Name is required' }, { status: 400 })
    }
    const ws = mockDb.addWorkspace(name, description)
    return NextResponse.json(ws, { status: 201 })
  } catch {
    return NextResponse.json({ message: 'Bad request' }, { status: 400 })
  }
}
