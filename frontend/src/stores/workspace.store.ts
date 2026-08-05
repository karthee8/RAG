import { create } from 'zustand'
import { Workspace } from '@/types'
import { apiClient } from '@/lib/api-client'

interface WorkspaceState {
  workspaces: Workspace[]
  selectedWorkspaceId: string | null
  streamingSpeed: 'slow' | 'normal' | 'fast'
  selectedModel: string
  isLoadingWorkspaces: boolean
  fetchWorkspaces: () => Promise<void>
  setSelectedWorkspaceId: (id: string | null) => void
  setStreamingSpeed: (speed: 'slow' | 'normal' | 'fast') => void
  setSelectedModel: (model: string) => void
  addWorkspace: (name: string, description?: string) => Promise<Workspace>
  deleteWorkspace: (id: string) => Promise<void>
  chatInputPrefill: string
  setChatInputPrefill: (text: string) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  selectedWorkspaceId: null,
  streamingSpeed: 'normal',
  selectedModel: 'google/gemini-2.5-flash:free',
  isLoadingWorkspaces: false,
  chatInputPrefill: '',

  setChatInputPrefill: (text) => set({ chatInputPrefill: text }),

  fetchWorkspaces: async () => {
    set({ isLoadingWorkspaces: true })
    try {
      const workspaces = await apiClient.get<Workspace[]>('/workspaces')
      set({ workspaces })
      
      // Auto-select first workspace if none selected
      const current = get().selectedWorkspaceId
      if (!current && workspaces.length > 0) {
        set({ selectedWorkspaceId: workspaces[0].id })
      }
    } catch (err) {
      console.warn('Failed to fetch workspaces (backend might be down):', err)
    } finally {
      set({ isLoadingWorkspaces: false })
    }
  },

  setSelectedWorkspaceId: (id) => {
    set({ selectedWorkspaceId: id })
  },

  setStreamingSpeed: (speed) => {
    set({ streamingSpeed: speed })
  },

  setSelectedModel: (model) => {
    set({ selectedModel: model })
  },

  addWorkspace: async (name, description) => {
    const ws = await apiClient.post<Workspace>('/workspaces', { name, description })
    set((state) => {
      const updated = [...state.workspaces, ws]
      return {
        workspaces: updated,
        selectedWorkspaceId: state.selectedWorkspaceId || ws.id,
      }
    })
    return ws
  },

  deleteWorkspace: async (id) => {
    await apiClient.delete(`/workspaces/${id}`)
    set((state) => {
      const updated = state.workspaces.filter((w) => w.id !== id)
      let nextSelected = state.selectedWorkspaceId
      if (state.selectedWorkspaceId === id) {
        nextSelected = updated.length > 0 ? updated[0].id : null
      }
      return {
        workspaces: updated,
        selectedWorkspaceId: nextSelected,
      }
    })
  },
}))
