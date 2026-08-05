import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, FileText, Loader2, Image as ImageIcon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { Button } from '@/components/ui/button'

interface DocumentViewerModalProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  documentId: string | null
  documentName: string | null
}

export function DocumentViewerModal({
  isOpen,
  setIsOpen,
  documentId,
  documentName,
}: DocumentViewerModalProps) {
  const { data, isLoading, error } = useQuery<{ content: string }>({
    queryKey: ['document-content', documentId],
    queryFn: () => apiClient.get<{ content: string }>(`/documents/${documentId}/content`),
    enabled: isOpen && !!documentId,
  })

  // Detect if the file is an image based on the extension of the documentName
  const isImage = documentName ? /\.(png|jpe?g|gif|webp)$/i.test(documentName) : false

  return (
    <AnimatePresence>
      {isOpen && documentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative flex flex-col w-full max-w-4xl h-[85vh] bg-surface-primary dark:bg-card rounded-2xl shadow-2xl overflow-hidden border border-border/60 z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border/60 bg-muted/20 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                {isImage ? (
                  <ImageIcon className="h-5 w-5 text-brand-primary shrink-0" />
                ) : (
                  <FileText className="h-5 w-5 text-brand-primary shrink-0" />
                )}
                <h3 className="font-bold text-sm text-text-primary truncate">
                  {documentName || 'Document Preview'}
                </h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 text-text-muted hover:text-text-primary rounded-lg hover:bg-muted/50 transition-colors shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 bg-surface-primary/30">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-full text-text-muted">
                  <Loader2 className="h-8 w-8 animate-spin text-brand-primary mb-4" />
                  <p className="text-sm">Loading content snapshot...</p>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center h-full text-danger">
                  <p className="text-sm font-semibold">Failed to load content.</p>
                  <p className="text-xs text-text-muted mt-2">
                    {error instanceof Error ? error.message : 'Unknown error'}
                  </p>
                </div>
              ) : isImage ? (
                <div className="flex flex-col items-center space-y-6">
                  <div className="p-4 border border-border/40 bg-muted/20 rounded-xl text-center w-full max-w-2xl">
                    <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-2">OCR Extracted Text</h4>
                    <p className="text-sm text-text-secondary whitespace-pre-wrap text-left bg-surface-primary p-4 rounded-lg border border-border/20">
                      {data?.content || 'No text extracted from this image.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-text-secondary leading-relaxed p-6 bg-muted/10 rounded-xl border border-border/30">
                    {data?.content || 'Document is empty.'}
                  </pre>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border/60 bg-muted/20 flex justify-end shrink-0">
              <Button onClick={() => setIsOpen(false)} variant="outline" size="sm" className="rounded-lg">
                Close
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
