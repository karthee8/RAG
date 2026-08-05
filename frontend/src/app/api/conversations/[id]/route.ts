import { NextResponse } from 'next/server'
import { mockDb } from '@/lib/mock-db'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const success = mockDb.deleteConversation(id)
  if (success) {
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ message: 'Conversation not found' }, { status: 404 })
}
