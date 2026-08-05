import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Code2, Play, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ArtifactPanelProps {
  isOpen: boolean
  onClose: () => void
  content: string
  language: string
}

export function ArtifactPanel({ isOpen, onClose, content, language }: ArtifactPanelProps) {
  const [activeTab, setActiveTab] = React.useState<'code' | 'preview'>('preview')
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Determine if it's previewable
  const isPreviewable = ['html', 'svg', 'xml', 'mermaid'].includes(language.toLowerCase())

  React.useEffect(() => {
    if (isPreviewable) {
      setActiveTab('preview')
    } else {
      setActiveTab('code')
    }
  }, [content, language, isPreviewable])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: '50%', opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="border-l border-border/50 bg-surface-primary dark:bg-card flex flex-col h-full shrink-0 shadow-2xl relative z-20"
        >
          {/* Header */}
          <div className="h-16 border-b border-border/50 px-4 flex items-center justify-between shrink-0 glass-panel">
            <div className="flex bg-muted/50 p-1 rounded-lg">
              {isPreviewable && (
                <button
                  onClick={() => setActiveTab('preview')}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                    activeTab === 'preview' ? 'bg-surface-primary dark:bg-background shadow-sm text-text-primary' : 'text-text-muted hover:text-text-primary'
                  )}
                >
                  <Play className="h-3.5 w-3.5" />
                  Preview
                </button>
              )}
              <button
                onClick={() => setActiveTab('code')}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  activeTab === 'code' ? 'bg-surface-primary dark:bg-background shadow-sm text-text-primary' : 'text-text-muted hover:text-text-primary'
                )}
              >
                <Code2 className="h-3.5 w-3.5" />
                Code
              </button>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={handleCopy} className="h-8 w-8 text-text-muted hover:text-text-primary" title="Copy code">
                {copied ? <Check className="h-4 w-4 text-brand-primary" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-text-muted hover:text-text-primary">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-hidden bg-background/50 relative">
            {activeTab === 'preview' && isPreviewable ? (
              <iframe
                title="Artifact Preview"
                srcDoc={
                  language.toLowerCase() === 'mermaid' 
                  ? `<!DOCTYPE html>
                    <html>
                      <head>
                        <script type="module">
                          import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
                          mermaid.initialize({ startOnLoad: true, theme: 'default' });
                        </script>
                      </head>
                      <body style="margin:0; padding:20px; display:flex; justify-content:center; align-items:center; min-height:100vh; background:white;">
                        <div class="mermaid">
                          ${content}
                        </div>
                      </body>
                    </html>`
                  : content
                }
                className="w-full h-full border-0 bg-white"
                sandbox="allow-scripts allow-same-origin"
              />
            ) : (
              <div className="w-full h-full overflow-auto p-4 text-xs font-mono text-text-secondary">
                <pre className="whitespace-pre-wrap break-all">{content}</pre>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
