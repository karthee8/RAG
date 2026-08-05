import { NextResponse } from 'next/server'
import { mockDb } from '@/lib/mock-db'

import { env } from '@/lib/env'
const BACKEND_URL = env.BACKEND_URL

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/metrics`)
    if (res.ok) {
      const data = await res.json()
      // Merge real backend metrics with mock data for visual charts
      const baseAnalytics = { ...mockDb.analytics }
      
      baseAnalytics.totalQueries = data.http_server?.request_count || baseAnalytics.totalQueries
      baseAnalytics.avgResponseTime = data.http_server?.avg_latency_ms ? Math.round(data.http_server.avg_latency_ms) : baseAnalytics.avgResponseTime
      baseAnalytics.totalDocuments = data.vector_store?.chunk_count || baseAnalytics.totalDocuments
      
      return NextResponse.json(baseAnalytics)
    }
  } catch (err) {
    console.warn("Could not fetch metrics from backend, falling back to mock", err)
  }
  
  return NextResponse.json(mockDb.analytics)
}

