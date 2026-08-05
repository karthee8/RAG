import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useWorkspaceStore } from './workspace.store'
import { apiClient } from '@/lib/api-client'

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  }
}))

describe('workspaceStore', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    useWorkspaceStore.setState({ workspaces: [], isLoadingWorkspaces: false, selectedWorkspaceId: null })
  })

  it('fetches workspaces and updates state', async () => {
    const mockWorkspaces = [
      { id: '1', name: 'WS 1', documentCount: 0, memberCount: 1, createdAt: '' }
    ]
    ;(apiClient.get as any).mockResolvedValue(mockWorkspaces)

    await useWorkspaceStore.getState().fetchWorkspaces()

    const state = useWorkspaceStore.getState()
    expect(state.workspaces).toEqual(mockWorkspaces)
    expect(state.selectedWorkspaceId).toEqual('1')
    expect(state.isLoadingWorkspaces).toBe(false)
  })
})
