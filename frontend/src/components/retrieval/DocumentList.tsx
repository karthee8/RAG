import * as React from 'react'
import { motion } from 'framer-motion'
import { scaleIn } from '@/lib/animations'
import { formatBytes, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Search, Loader2, FileText, FileSpreadsheet, FileCode, FileJson, Trash2, MessageSquarePlus, Image as ImageIcon, Globe, Video } from 'lucide-react'
import { Document } from '@/types'
import { DocumentViewerModal } from './DocumentViewerModal'
import { useRouter } from 'next/navigation'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { ROUTES } from '@/constants/routes'

interface DocumentListProps {
  documents: Document[]
  isLoadingDocs: boolean
  searchTerm: string
  setSearchTerm: (term: string) => void
  deleteDoc: (id: string) => void
  isDeleting: boolean
}

export function DocumentList({
  documents,
  isLoadingDocs,
  searchTerm,
  setSearchTerm,
  deleteDoc,
  isDeleting,
}: DocumentListProps) {
  const router = useRouter()
  const { setChatInputPrefill } = useWorkspaceStore()
  const [viewerDocId, setViewerDocId] = React.useState<string | null>(null)
  const [viewerDocName, setViewerDocName] = React.useState<string | null>(null)

  // Get file icon based on extension or URL
  const getFileIcon = (fileName: string) => {
    if (fileName.includes('youtube.com') || fileName.includes('youtu.be')) {
      return <Video className="h-5 w-5 text-red-500" />
    }
    if (fileName.startsWith('http://') || fileName.startsWith('https://')) {
      return <Globe className="h-5 w-5 text-blue-500" />
    }

    const ext = fileName.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'csv':
        return <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
      case 'md':
        return <FileCode className="h-5 w-5 text-indigo-500" />
      case 'json':
        return <FileJson className="h-5 w-5 text-amber-500" />
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'webp':
        return <ImageIcon className="h-5 w-5 text-pink-500" />
      default:
        return <FileText className="h-5 w-5 text-brand-primary" />
    }
  }

  const filteredDocs = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="md:col-span-2">
      <Card className="border border-border/60 bg-surface-primary/80 backdrop-blur-md rounded-2xl shadow-sm h-full">
        <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="text-sm font-bold">Grounding Sources</CardTitle>
            <CardDescription className="text-[10px]">
              Manage active files vectorized in this workspace.
            </CardDescription>
          </div>
          {documents.length > 0 && (
            <div className="relative w-full sm:w-48">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-text-muted" />
              <Input
                type="text"
                placeholder="Search files..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 text-xs bg-transparent border-border focus-visible:ring-brand-primary rounded-lg"
              />
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-2">
          {isLoadingDocs ? (
            <div className="space-y-3 pt-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-3.5 rounded-xl border border-border/30 bg-surface-primary/10">
                  <div className="h-9 w-9 bg-muted/50 rounded-lg shrink-0 animate-pulse" />
                  <div className="space-y-2 flex-1">
                    <div className="h-3 w-1/3 bg-muted/50 rounded animate-pulse" />
                    <div className="h-2 w-1/2 bg-muted/50 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-border/40 rounded-xl">
              <FileText className="h-10 w-10 text-text-muted mx-auto mb-3" />
              <p className="text-xs font-semibold text-text-primary">No documents found</p>
              <p className="text-[10px] text-text-muted mt-1 max-w-[200px] mx-auto leading-relaxed">
                {searchTerm
                  ? 'Try modifying your search criteria.'
                  : 'Upload PDF, DOCX, TXT, CSV, or MD files to start grounding your queries.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {filteredDocs.map((doc) => (
                <motion.div
                  variants={scaleIn}
                  initial="initial"
                  animate="animate"
                  key={doc.id}
                  onClick={() => {
                    setViewerDocId(doc.id)
                    setViewerDocName(doc.name)
                  }}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-border/55 bg-surface-primary/30 hover:bg-muted/30 transition-colors gap-4 cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 bg-muted rounded-lg flex items-center justify-center shrink-0 relative">
                      {getFileIcon(doc.name)}
                      {doc.status !== 'ready' && doc.status !== 'failed' && (
                         <div className="absolute -bottom-1 -right-1 bg-surface-primary rounded-full p-[2px]">
                           <Loader2 className="h-3 w-3 animate-spin text-brand-primary" />
                         </div>
                      )}
                    </div>
                    <div className="min-w-0 leading-tight">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-semibold text-text-primary truncate max-w-[200px] sm:max-w-xs">
                          {doc.name}
                        </h4>
                        {doc.status !== 'ready' && (
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                            doc.status === 'failed' ? 'bg-danger/10 text-danger' : 
                            (Date.now() - new Date(doc.uploadedAt).getTime() > 5 * 60 * 1000) ? 'bg-warning/10 text-warning' : 'bg-brand-primary/10 text-brand-primary'
                          }`}>
                            {doc.status === 'failed' ? 'Failed' : 
                             (Date.now() - new Date(doc.uploadedAt).getTime() > 5 * 60 * 1000) ? 'Stuck' : 
                             doc.status}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-text-muted mt-1.5 flex flex-wrap gap-x-2.5">
                        <span>{formatBytes(doc.size)}</span>
                        <span>•</span>
                        <span>{doc.pageCount} pages ({doc.chunkCount} chunks)</span>
                        <span>•</span>
                        <span>Uploaded {formatDate(doc.uploadedAt, 'short')}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        setChatInputPrefill(`Summarize the document ${doc.name}`)
                        router.push(ROUTES.MAIN.CHAT)
                      }}
                      className="hover:bg-brand-primary/10 hover:text-brand-primary rounded-lg h-8 w-8 text-text-muted shrink-0"
                      title="Ask in Chat"
                    >
                      <MessageSquarePlus className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isDeleting}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Delete grounding file "${doc.name}"?`)) {
                          deleteDoc(doc.id)
                        }
                      }}
                      className="hover:bg-danger/10 hover:text-danger rounded-lg h-8 w-8 text-text-muted shrink-0"
                      title="Delete file"
                    >
                      <Trash2 className="h-4.5 w-4.5" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      <DocumentViewerModal 
        isOpen={!!viewerDocId} 
        setIsOpen={(open) => !open && setViewerDocId(null)}
        documentId={viewerDocId}
        documentName={viewerDocName}
      />
    </div>
  )
}
