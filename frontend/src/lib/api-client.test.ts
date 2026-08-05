import { describe, it, expect, vi, beforeEach } from 'vitest'
import apiClient from './api-client'
import { z } from 'zod'

// Mock global fetch
global.fetch = vi.fn()

describe('apiClient', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
  })

  it('adds authorization header if token exists in localStorage', async () => {
    localStorage.setItem('auth-storage', JSON.stringify({ state: { accessToken: 'test-token' } }))
    
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    })

    await apiClient.get('/test')
    
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/test'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token'
        })
      })
    )
  })

  it('validates response with Zod schema if provided', async () => {
    const schema = z.object({ id: z.number() })
    
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 123, extra: 'ignored' }),
    })

    const data = await apiClient.get('/test', {}, schema)
    
    expect(data).toEqual({ id: 123 })
  })

  it('throws ApiError on failed response', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Not Found' }),
    })

    await expect(apiClient.get('/test')).rejects.toThrow('Not Found')
  })
})
