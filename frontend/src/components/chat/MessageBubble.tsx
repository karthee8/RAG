'use client';

import * as React from 'react'
import { cn } from '@/lib/utils'
import dynamic from 'next/dynamic'
import { markdownRehypePlugins, markdownTypographyClass } from '@/lib/markdown'
import { BookOpen, Loader2, Volume2, SquareSquare, Network } from 'lucide-react'
import { Citation } from '@/types'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false })

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  contextMeter?: { tokensUsed: number, contextLimit: number }
  isStreaming?: boolean
  userName?: string
  modelName: string
  onCitationClick: (citations: Citation[], text: string) => void
  onSourceClick: (citation: Citation) => void
  onOpenArtifact?: (content: string, language: string) => void
}

// Memoized: during streaming a new token re-renders the chat list; memoization
// keeps already-rendered messages from re-rendering on every token.
export const MessageBubble = React.memo(function MessageBubble({
  role,
  content,
  citations = [],
  contextMeter,
  isStreaming = false,
  userName = 'User',
  modelName,
  onCitationClick,
  onSourceClick,
  onOpenArtifact,
}: MessageBubbleProps) {
  const [isPlaying, setIsPlaying] = React.useState(false)

  const handleSpeak = () => {
    if (!('speechSynthesis' in window)) return

    if (isPlaying) {
      window.speechSynthesis.cancel()
      setIsPlaying(false)
      return
    }

    const utterance = new SpeechSynthesisUtterance(content)
    utterance.onend = () => setIsPlaying(false)
    window.speechSynthesis.speak(utterance)
    setIsPlaying(true)
  }

  // Ensure speech stops if unmounted
  React.useEffect(() => {
    return () => {
      if (isPlaying) window.speechSynthesis.cancel()
    }
  }, [isPlaying])

  const handleContextMap = () => {
    if (!onOpenArtifact || !citations || citations.length === 0) return
    
    let mermaid = 'graph TD\n'
    mermaid += '  A((Answer)):::answer\n'
    
    // Get unique documents
    const uniqueDocs = new Set(citations.map(c => c.documentName))
    
    let i = 1
    uniqueDocs.forEach(docName => {
      const docId = `Doc${i}`
      mermaid += `  ${docId}[${docName}]:::document\n`
      mermaid += `  A --> ${docId}\n`
      
      // Find citations for this doc
      const docCites = citations.filter(c => c.documentName === docName)
      docCites.forEach((cite, idx) => {
        const citeId = `Cite${i}_${idx}`
        mermaid += `  ${citeId}([Citation ${cite.index}]):::citation\n`
        mermaid += `  ${docId} --> ${citeId}\n`
      })
      i++
    })
    
    mermaid += '\n  classDef answer fill:#6d28d9,stroke:#4c1d95,color:#fff,stroke-width:2px\n'
    mermaid += '  classDef document fill:#1e293b,stroke:#334155,color:#f8fafc\n'
    mermaid += '  classDef citation fill:#0f172a,stroke:#3b82f6,color:#bfdbfe,stroke-width:1px\n'
    
    onOpenArtifact(mermaid, 'mermaid')
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn('flex flex-col space-y-1.5', role === 'user' ? 'items-end' : 'items-start')}
    >
      {/* Speaker Label & Controls */}
      <div className="flex items-center justify-between w-full max-w-[85%] px-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
          {isStreaming && role === 'assistant' && (
            <Loader2 className="h-3 w-3 animate-spin text-brand-primary shrink-0" />
          )}
          {role === 'user' ? userName : isStreaming ? `${modelName.toUpperCase()} is writing...` : modelName.toUpperCase()}
        </span>
        <div className="flex items-center gap-2">
          {role === 'assistant' && contextMeter && (
            <div className="flex items-center gap-1 text-[9px] font-bold text-text-muted bg-muted/40 px-1.5 py-0.5 rounded-md border border-border/40" title="Context Meter (Tokens used / Context limit)">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500/80" />
              {contextMeter.tokensUsed.toLocaleString()} / {contextMeter.contextLimit.toLocaleString()}
            </div>
          )}
          {role === 'assistant' && !isStreaming && (
            <button
              onClick={handleSpeak}
              className="text-text-muted hover:text-brand-primary transition-colors p-1 rounded-md"
              title={isPlaying ? "Stop Speaking" : "Read Aloud"}
            >
              {isPlaying ? <SquareSquare className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Chat Message Bubble */}
      <div
        className={cn(
          'p-4 rounded-2xl max-w-[85%] text-xs shadow-xs leading-relaxed border',
          role === 'user'
            ? 'bg-blue-600/30 backdrop-blur-md text-white border-blue-500/50 rounded-tr-none'
            : 'bg-black/40 backdrop-blur-xl border-white/10 text-white rounded-tl-none font-serif text-[14px] tracking-wide shadow-[0_0_15px_rgba(0,0,0,0.5)]'
        )}
      >
        {role === 'user' ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : isStreaming && !content ? (
          <div className="flex items-center gap-1 py-1.5">
            <span className="h-1.5 w-1.5 bg-brand-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 bg-brand-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 bg-brand-primary rounded-full animate-bounce" />
          </div>
        ) : (
          <div className={markdownTypographyClass}>
            <ReactMarkdown
              rehypePlugins={markdownRehypePlugins}
              components={{
                a: ({ ...props }) => {
                  const text = props.children?.toString() || ''
                  if (/^\[\d+\]$/.test(text)) {
                    return (
                      <button
                        onClick={() => onCitationClick(citations, text)}
                        className="px-1 text-[11px] font-bold text-brand-primary hover:underline bg-brand-primary/10 rounded cursor-pointer mx-0.5 select-none align-baseline inline-block"
                        type="button"
                      >
                        {text}
                      </button>
                    )
                  }
                  return <a {...props} />
                },
                code: ({ node, inline, className, children, ...props }: any) => {
                  const match = /language-(\w+)/.exec(className || '')
                  const language = match ? match[1] : ''
                  const content = String(children).replace(/\n$/, '')
                  
                  if (!inline && content.length > 50 && onOpenArtifact) {
                    return (
                      <div className="my-4 p-4 border border-border/50 rounded-xl bg-surface-secondary/50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-brand-primary/10 rounded-lg flex items-center justify-center text-brand-primary">
                            <BookOpen className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-text-primary capitalize">{language || 'Code'} Artifact</p>
                            <p className="text-[10px] text-text-muted">Click to view or run in panel</p>
                          </div>
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => onOpenArtifact(content, language || 'text')}
                          className="h-8 text-xs font-bold border-brand-primary/30 hover:bg-brand-primary hover:text-white"
                        >
                          Open Artifact
                        </Button>
                      </div>
                    )
                  }
                  
                  return (
                    <code className={cn(className, "bg-muted/50 rounded px-1.5 py-0.5 text-xs text-brand-primary")} {...props}>
                      {children}
                    </code>
                  )
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {/* Grounded Citations Bar (AI responses only) */}
      {role === 'assistant' && citations.length > 0 && (
        <div className="flex flex-col gap-2 pt-1.5 px-1 max-w-[85%]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[9px] font-bold text-text-muted flex items-center gap-1 mr-1 w-full mb-1">
              <BookOpen className="h-3 w-3 shrink-0" />
              Grounded Sources:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
              {citations.map((c) => (
                <button
                  key={c.index}
                  onClick={() => onSourceClick(c)}
                  className="flex flex-col text-left p-3 rounded-xl bg-surface-secondary/50 border border-border/55 hover:bg-surface-secondary hover:border-brand-primary/40 transition-colors cursor-pointer w-full"
                >
                  <div className="flex items-center justify-between mb-1.5 w-full">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-bold text-brand-primary shrink-0 text-xs bg-brand-primary/10 px-1.5 py-0.5 rounded">[{c.index}]</span>
                      <span className="truncate text-xs font-semibold text-text-primary">{c.documentName}</span>
                    </div>
                    {c.score !== undefined && (
                      <span className="text-[9px] font-mono text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full shrink-0">
                        {(c.score * 100).toFixed(1)}% match
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-text-muted line-clamp-2 leading-relaxed">
                    {c.excerpt}
                  </p>
                </button>
              ))}
            </div>
          </div>
          
          {onOpenArtifact && (
            <div>
              <button
                onClick={handleContextMap}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-primary/30 bg-brand-primary/5 hover:bg-brand-primary/15 text-[10px] font-bold text-brand-primary transition-colors"
              >
                <Network className="h-3 w-3" />
                View Context Map
              </button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
})
