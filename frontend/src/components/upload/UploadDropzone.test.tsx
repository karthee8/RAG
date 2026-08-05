import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { UploadDropzone } from './UploadDropzone'

vi.mock('@/stores/workspace.store', () => ({
  useWorkspaceStore: vi.fn(() => ({
    selectedWorkspaceId: 'workspace-1',
  })),
}))

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
  })),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}))

describe('UploadDropzone', () => {
  it('renders correctly', () => {
    render(<UploadDropzone />)
    expect(screen.getByText(/Drag & drop your files here/i)).toBeTruthy()
  })

  it('handles click to select files', () => {
    render(<UploadDropzone />)
    const button = screen.getByText(/Select Files/i)
    fireEvent.click(button)
    // The dropzone input is hidden, so click triggers the input.
    // We just verify it renders without crashing on interaction.
    expect(button).toBeTruthy()
  })
})
