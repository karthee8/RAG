import * as React from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { UploadCloud, CheckCircle, Loader2, Info, Link as LinkIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkspaceStore } from '@/stores/workspace.store'
import apiClient from '@/lib/api-client'
import { Document } from '@/types'

interface UploadProgress {
  fileName: string
  progress: number
  status: 'uploading' | 'processing' | 'embedding' | 'completed' | 'failed'
  stage?: string
  error?: string
}

interface UploadDropzoneProps {
  selectedWorkspaceId: string | null
}

export function UploadDropzone({ selectedWorkspaceId }: UploadDropzoneProps) {
  const queryClient = useQueryClient()
  const [uploads, setUploads] = React.useState<UploadProgress[]>([])
  const [urlInput, setUrlInput] = React.useState('')

  // Upload file mutation — sends the file to the backend via our Next.js API
  // route, going through apiClient so an expired session is silently refreshed
  // (or redirected to login) instead of surfacing a raw 401.
  const uploadFileMutation = useMutation({
    mutationFn: async (file: File): Promise<Document> => {
      const formData = new FormData()
      formData.append('file', file)
      if (selectedWorkspaceId) {
        formData.append('workspaceId', selectedWorkspaceId)
      }

      return apiClient.post<Document>('/documents', formData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', selectedWorkspaceId] })
      useWorkspaceStore.getState().fetchWorkspaces()
    },
  })

  const ingestUrlMutation = useMutation({
    mutationFn: async (url: string): Promise<Document> => {
      return apiClient.post<Document>('/documents/ingest-url', {
        url,
        workspaceId: selectedWorkspaceId,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', selectedWorkspaceId] })
      useWorkspaceStore.getState().fetchWorkspaces()
    },
  })

  const onDrop = React.useCallback(
    async (acceptedFiles: File[], fileRejections: any[]) => {
      if (fileRejections.length > 0) {
        fileRejections.forEach((rejection) => {
          const { file, errors } = rejection
          errors.forEach((err: any) => {
            if (err.code === 'file-too-large') {
              toast.error(`File ${file.name} is too large (max 50MB)`)
            } else if (err.code === 'file-invalid-type') {
              toast.error(`File ${file.name} has an unsupported format`)
            } else {
              toast.error(`Error with ${file.name}: ${err.message}`)
            }
          })
        })
      }

      if (acceptedFiles.length === 0) return

      if (!selectedWorkspaceId) {
        toast.warning('Please select or create a workspace first')
        return
      }

      const uploadPromises = acceptedFiles.map(async (file) => {
        const uploadState: UploadProgress = {
          fileName: file.name,
          progress: 5,
          status: 'uploading',
        }
        setUploads((prev) => [...prev, uploadState])

        try {
          // Step 1: Uploading to backend
          setUploads((prev) =>
            prev.map((u) =>
              u.fileName === file.name ? { ...u, progress: 20, status: 'uploading' } : u
            )
          )

          // Actually upload the file
          const doc: any = await uploadFileMutation.mutateAsync(file)

          // Step 2: Use SSE to track progress
          const actualDocId = doc.backendDocumentId || doc.document_id
          if (actualDocId) {
            const eventSource = new EventSource(`http://127.0.0.1:8000/api/documents/${actualDocId}/progress`)
            eventSource.onmessage = (event) => {
              const data = JSON.parse(event.data)
              if (data.error) {
                setUploads(prev => prev.map(u => u.fileName === file.name ? { ...u, status: 'failed', error: data.error, progress: 100 } : u))
                toast.error(`Error processing ${file.name}: ${data.error}`)
                eventSource.close()
                return
              }
              
              let progressVal = 30
              if (data.stage === 'Extracting Text') progressVal = 40
              if (data.stage === 'Chunking Document') progressVal = 60
              if (data.stage === 'Generating Embeddings') progressVal = 80
              if (data.stage === 'Indexing in LanceDB') progressVal = 90
              if (data.status === 'completed') progressVal = 100
              
              setUploads((prev) =>
                prev.map((u) =>
                  u.fileName === file.name ? { ...u, progress: progressVal, status: data.status === 'completed' ? 'completed' : 'processing', stage: data.stage } : u
                )
              )

              if (data.status === 'completed' || data.status === 'failed') {
                eventSource.close()
                if (data.status === 'completed') toast.success(`Indexed ${file.name} successfully`)
                queryClient.invalidateQueries({ queryKey: ['documents', selectedWorkspaceId] })
              }
            }
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          toast.error(`Failed to upload ${file.name}: ${message}`)
          setUploads((prev) => prev.map((u) => u.fileName === file.name ? { ...u, status: 'failed', error: message } : u))
        }

        setTimeout(() => {
          setUploads((prev) => prev.filter((u) => u.fileName !== file.name && u.status === 'completed'))
        }, 5000)
      })

      await Promise.all(uploadPromises)
    },
    [selectedWorkspaceId, uploadFileMutation]
  )

  const handleUrlIngest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!urlInput.trim()) return
    if (!selectedWorkspaceId) {
      toast.warning('Please select or create a workspace first')
      return
    }

    const currentUrl = urlInput.trim()
    setUrlInput('')

    const uploadState: UploadProgress = {
      fileName: currentUrl,
      progress: 5,
      status: 'uploading',
    }
    setUploads((prev) => [...prev, uploadState])

    try {
      setUploads((prev) =>
        prev.map((u) =>
          u.fileName === currentUrl ? { ...u, progress: 20, status: 'processing' } : u
        )
      )

      const doc: any = await ingestUrlMutation.mutateAsync(currentUrl)
      
      const actualDocId = doc?.backendDocumentId || doc?.document_id
      if (actualDocId) {
        const eventSource = new EventSource(`http://127.0.0.1:8000/api/documents/${actualDocId}/progress`)
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data)
          if (data.error) {
            setUploads(prev => prev.map(u => u.fileName === currentUrl ? { ...u, status: 'failed', error: data.error, progress: 100 } : u))
            toast.error(`Error processing URL: ${data.error}`)
            eventSource.close()
            return
          }
          
          let progressVal = 30
          if (data.stage === 'Extracting URL Content') progressVal = 40
          if (data.stage === 'Chunking URL Content') progressVal = 60
          if (data.stage === 'Generating Embeddings') progressVal = 80
          if (data.stage === 'Indexing in LanceDB') progressVal = 90
          if (data.status === 'completed') progressVal = 100
          
          setUploads((prev) =>
            prev.map((u) =>
              u.fileName === currentUrl ? { ...u, progress: progressVal, status: data.status === 'completed' ? 'completed' : 'processing', stage: data.stage } : u
            )
          )

          if (data.status === 'completed' || data.status === 'failed') {
            eventSource.close()
            if (data.status === 'completed') toast.success(`Ingested URL successfully`)
            queryClient.invalidateQueries({ queryKey: ['documents', selectedWorkspaceId] })
          }
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Failed to ingest URL: ${message}`)
      setUploads((prev) => prev.map((u) => u.fileName === currentUrl ? { ...u, status: 'failed', error: message } : u))
    }

    setTimeout(() => {
      setUploads((prev) => prev.filter((u) => u.fileName !== currentUrl && u.status === 'completed'))
    }, 5000)
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'text/csv': ['.csv'],
      'text/markdown': ['.md'],
      'audio/mpeg': ['.mp3'],
      'audio/wav': ['.wav'],
      'video/mp4': ['.mp4'],
      'video/webm': ['.webm'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg']
    },
    maxSize: 50 * 1024 * 1024,
  })

  return (
    <div className="md:col-span-1 space-y-6">
      <Card className="border border-border/60 bg-surface-primary/80 backdrop-blur-md rounded-2xl overflow-hidden shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold">Upload Groundings</CardTitle>
          <CardDescription className="text-[10px]">
            Add references to feed the RAG system.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={cn(
              'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200',
              isDragActive
                ? 'border-brand-primary bg-brand-primary/10'
                : 'border-border/60 hover:border-brand-primary/50 hover:bg-surface-primary'
            )}
          >
            <input {...getInputProps()} />
            <UploadCloud className="mx-auto h-12 w-12 text-brand-primary mb-4" />
            <p className="text-sm font-semibold text-text-primary mb-1">
              {isDragActive ? 'Drop your files here' : 'Drag & drop files here'}
            </p>
            <p className="text-xs text-text-muted">
              Supports PDF, DOCX, TXT, CSV, MD, PNG, JPG/JPEG (up to 20MB)
            </p>
          </div>

          <form onSubmit={handleUrlIngest} className="mt-4 flex gap-2">
            <div className="relative flex-1">
              <LinkIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-text-muted" />
              <Input
                type="url"
                placeholder="Paste URL or YouTube link..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="pl-9 h-9 text-xs"
                required
              />
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={ingestUrlMutation.isPending || !urlInput.trim()}
              className="bg-brand-primary text-white hover:bg-brand-primary/90 h-9 px-4 rounded-lg"
            >
              {ingestUrlMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ingest'}
            </Button>
          </form>

          <AnimatePresence>
            {uploads.length > 0 && (
              <div className="mt-4 space-y-3 border-t border-border/50 pt-4">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                  Vector Indexing Queue
                </p>
                {uploads.map((up) => (
                  <div key={up.fileName} className="space-y-1 text-left">
                    <div className="flex justify-between items-center text-[10px] font-medium text-text-primary">
                      <span className="truncate max-w-[130px] font-semibold">{up.fileName}</span>
                      <span className="capitalize text-brand-primary text-[9px] font-bold flex items-center gap-1.5">
                        {up.status === 'completed' ? (
                          <CheckCircle className="h-3 w-3 text-success" />
                        ) : (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        {up.status === 'uploading' && 'uploading...'}
                        {up.status === 'processing' && 'processing...'}
                        {up.status === 'embedding' && 'indexing...'}
                        {up.status === 'completed' && 'ready'}
                        {up.status === 'failed' && 'failed'}
                      </span>
                    </div>
                    {up.stage && (
                      <div className="text-[9px] text-text-muted mt-0.5">{up.stage}</div>
                    )}
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-brand-primary rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${up.progress}%` }}
                        transition={{ duration: 0.15 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      <div className="rounded-2xl bg-brand-primary/5 border border-brand-primary/10 p-4 space-y-2">
        <h4 className="text-xs font-bold text-brand-primary flex items-center gap-1.5">
          <Info className="h-4 w-4" />
          How Grounding Works
        </h4>
        <p className="text-[10px] text-text-secondary leading-relaxed">
          When you upload files, AetherRAG sends them to the backend which chunks them into logical passages, computes vector
          embeddings, and stores them in ChromaDB. When you query the AI chat, the system performs a hybrid
          similarity search to retrieve relevant context and generates answers using the Ollama LLM.
        </p>
      </div>
    </div>
  )
}
