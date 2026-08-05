import * as React from 'react'
import { cn } from '@/lib/utils'
import { Layers, Loader2, Sparkles, Send, Mic, MicOff, Download, Wand2, Link as LinkIcon, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MessageBubble } from './MessageBubble'
import { ArtifactPanel } from './ArtifactPanel'
import { SlashCommandMenu, SlashCommand, AVAILABLE_COMMANDS } from './SlashCommandMenu'
import { Message, Citation, Workspace, User, Document } from '@/types'
import { DynamicBackground } from '@/components/ui/DynamicBackground'
import { motion, AnimatePresence } from 'framer-motion'
import { useDropzone } from 'react-dropzone'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { toast } from 'sonner'
import { useAntigravity } from '@/hooks/useAntigravity'

interface ChatAreaProps {
  activeWorkspace: Workspace | null
  conversationTitle: string
  models: { id: string; name: string; provider: string }[]
  selectedModel: string
  setSelectedModel: (model: string) => void
  isLoadingMessages: boolean
  messages: Message[]
  isStreaming: boolean
  streamText: string
  streamCitations: Citation[]
  streamContextMeter?: { tokensUsed: number, contextLimit: number }
  inputText: string
  setInputText: (text: string) => void
  handleSendMessage: (e?: React.FormEvent) => void
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  messageEndRef: React.RefObject<HTMLDivElement | null>
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  user: User | null
  handleCitationClick: (citations: Citation[], text: string) => void
  onSourceClick: (citation: Citation) => void
  onClearChat?: () => void
}

export function ChatArea({
  activeWorkspace,
  conversationTitle,
  models,
  selectedModel,
  setSelectedModel,
  isLoadingMessages,
  messages,
  isStreaming,
  streamText,
  streamCitations,
  streamContextMeter,
  inputText,
  setInputText,
  handleSendMessage,
  handleKeyDown,
  messageEndRef,
  textareaRef,
  user,
  handleCitationClick,
  onSourceClick,
  onClearChat,
}: ChatAreaProps) {
  useAntigravity()
  const queryClient = useQueryClient()
  const [isListening, setIsListening] = React.useState(false)
  const [isUploading, setIsUploading] = React.useState(false)
  const [activeArtifact, setActiveArtifact] = React.useState<{content: string, language: string} | null>(null)
  const [showUrlIngest, setShowUrlIngest] = React.useState(false)
  const [urlInput, setUrlInput] = React.useState('')
  const [showSlashMenu, setShowSlashMenu] = React.useState(false)
  const [slashQuery, setSlashQuery] = React.useState('')
  const [slashMenuIndex, setSlashMenuIndex] = React.useState(0)
  const [slashMenuPos, setSlashMenuPos] = React.useState({ bottom: 60, left: 20 })
  const recognitionRef = React.useRef<any>(null)
  
  // File upload logic
  const uploadFileMutation = useMutation({
    mutationFn: async (file: File): Promise<Document> => {
      const formData = new FormData()
      formData.append('file', file)
      if (activeWorkspace) {
        formData.append('workspaceId', activeWorkspace.id)
      }
      return apiClient.post<Document>('/documents', formData)
    },
    onSuccess: () => {
      if (activeWorkspace) {
        queryClient.invalidateQueries({ queryKey: ['documents', activeWorkspace.id] })
      }
      useWorkspaceStore.getState().fetchWorkspaces()
    },
  })

  const ingestUrlMutation = useMutation({
    mutationFn: async (url: string): Promise<Document> => {
      return apiClient.post<Document>('/documents/ingest-url', {
        url,
        workspaceId: activeWorkspace?.id,
      })
    },
    onSuccess: () => {
      if (activeWorkspace) {
        queryClient.invalidateQueries({ queryKey: ['documents', activeWorkspace.id] })
      }
      useWorkspaceStore.getState().fetchWorkspaces()
      toast.success('Ingested URL successfully')
      setUrlInput('')
      setShowUrlIngest(false)
    },
    onError: (err: any) => {
      toast.error(`Failed to ingest URL: ${err.message || 'Unknown error'}`)
    }
  })

  const handleUrlIngest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!urlInput.trim() || !activeWorkspace) {
      toast.warning('Please select a workspace first')
      return
    }
    await ingestUrlMutation.mutateAsync(urlInput.trim())
  }

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

      if (!activeWorkspace) {
        toast.warning('Please select or create a workspace to upload files.')
        return
      }
      setIsUploading(true)
      const uploadPromises = acceptedFiles.map(async (file) => {
        try {
          await uploadFileMutation.mutateAsync(file)
          toast.success(`Uploaded ${file.name} successfully`)
        } catch (err: any) {
          toast.error(`Failed to upload ${file.name}: ${err.message || 'Unknown error'}`)
        }
      })
      await Promise.all(uploadPromises)
      setIsUploading(false)
    },
    [activeWorkspace, uploadFileMutation]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
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

  React.useEffect(() => {
    // Initialize speech recognition
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition()
        recognitionRef.current.continuous = false
        recognitionRef.current.interimResults = false
        recognitionRef.current.lang = 'en-US'

        recognitionRef.current.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript
          setInputText(inputText + (inputText ? ' ' : '') + transcript)
          setIsListening(false)
        }

        recognitionRef.current.onerror = () => {
          setIsListening(false)
        }

        recognitionRef.current.onend = () => {
          setIsListening(false)
        }
      }
    }
  }, [inputText, setInputText])

  const toggleListening = () => {
    if (!recognitionRef.current) return
    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    } else {
      recognitionRef.current.start()
      setIsListening(true)
    }
  }

  const handleSlashCommandSelect = (cmd: SlashCommand) => {
    const words = inputText.split(/\s+/)
    words.pop()
    const newText = (words.join(' ') + ' ' + cmd.id + ' ').trimStart()
    setInputText(newText)
    setShowSlashMenu(false)
    textareaRef.current?.focus()
  }

  const localHandleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSlashMenu) {
      const filteredCommands = AVAILABLE_COMMANDS.filter(c => c.id.startsWith(slashQuery))
      if (filteredCommands.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSlashMenuIndex((prev) => (prev + 1) % filteredCommands.length)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSlashMenuIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length)
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          if (filteredCommands[slashMenuIndex]) {
            handleSlashCommandSelect(filteredCommands[slashMenuIndex])
          }
          return
        }
      }
      if (e.key === 'Escape' || e.key === ' ') {
        setShowSlashMenu(false)
        if (e.key === 'Escape') return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      if (inputText.trim() === '/antigravity') {
        e.preventDefault()
        window.dispatchEvent(new Event('toggle-antigravity'))
        setInputText('')
        return
      }
    }
    handleKeyDown(e)
  }

  const exportChat = () => {
    let mdContent = `# Chat Export: ${conversationTitle}\n\n`
    messages.forEach((msg) => {
      const role = msg.role === 'user' ? (user?.name || 'User') : 'Assistant'
      mdContent += `### ${role}\n${msg.content}\n\n`
      if (msg.citations && msg.citations.length > 0) {
        mdContent += `**Sources:**\n`
        msg.citations.forEach(c => {
          mdContent += `- [${c.index}] ${c.documentName}\n`
        })
        mdContent += `\n`
      }
      mdContent += `---\n\n`
    })

    const blob = new Blob([mdContent], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chat-export-${Date.now()}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex-1 flex h-full overflow-hidden">
    <div 
      {...getRootProps()} 
      className="flex-1 flex flex-col h-full bg-transparent overflow-hidden relative outline-none pointer-events-none"
    >
      <input {...getInputProps()} />
      <AnimatePresence>
        {isDragActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-brand-primary/10 backdrop-blur-sm border-2 border-brand-primary border-dashed rounded-xl m-4"
          >
            <div className="flex flex-col items-center p-8 bg-surface-primary/90 dark:bg-card/90 rounded-2xl shadow-xl">
              <Download className="h-12 w-12 text-brand-primary mb-4 animate-bounce" />
              <p className="text-sm font-bold text-text-primary">Drop files to index in {activeWorkspace?.name}</p>
              <p className="text-xs text-text-muted mt-2">Files will be processed and embedded for RAG.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Chat Pane Header */}
      <div className="h-16 border-b border-white/10 bg-black/20 backdrop-blur-xl px-6 flex items-center justify-between shrink-0 z-10 pointer-events-auto">
        <div className="flex items-center gap-2.5 min-w-0">
          <Layers className="h-4.5 w-4.5 text-brand-primary hidden sm:block shrink-0" />
          <div className="truncate leading-tight">
            <h2 className="text-xs font-bold text-text-primary truncate">
              {activeWorkspace ? activeWorkspace.name : 'Workspace Chat'}
            </h2>
            <p className="text-[10px] text-text-muted truncate">{conversationTitle}</p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={exportChat}
            disabled={messages.length === 0}
            className="hidden sm:flex h-8 px-3 text-xs gap-1.5 border-border/80 bg-surface-primary dark:bg-card"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>

          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="text-xs font-medium bg-surface-primary dark:bg-card border border-border/80 rounded-lg h-8 px-2.5 outline-none focus-visible:ring-1 focus-visible:ring-brand-primary"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Message scroll list */}
      <div className="flex-1 overflow-y-auto px-6 py-8 space-y-6 relative z-10 pointer-events-auto">
        {isLoadingMessages ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto space-y-6 w-full">
            {[...Array(3)].map((_, i) => (
              <div key={i} className={`flex gap-4 ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                {i % 2 !== 0 && <div className="h-8 w-8 rounded-lg bg-muted/50 animate-pulse shrink-0" />}
                <div className={`space-y-2 max-w-[80%] ${i % 2 === 0 ? 'items-end flex flex-col' : ''}`}>
                  <div className="h-10 w-48 bg-muted/50 rounded-2xl animate-pulse" />
                  <div className="h-4 w-32 bg-muted/50 rounded animate-pulse" />
                </div>
                {i % 2 === 0 && <div className="h-8 w-8 rounded-lg bg-brand-primary/20 animate-pulse shrink-0" />}
              </div>
            ))}
          </motion.div>
        ) : messages.length === 0 && !isStreaming ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-xl mx-auto text-center py-12 space-y-4">
            <div className="h-12 w-12 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center mx-auto">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-text-primary">
              Chat grounded in {activeWorkspace?.name}
            </h3>
            <p className="text-xs text-text-muted leading-relaxed max-w-sm mx-auto">
              Ask anything about the documents in this workspace. All query responses are grounded in
              source files.
            </p>

            {/* Quick suggestions */}
            {activeWorkspace?.id === 'ws_engineering' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md mx-auto pt-4">
                {[
                  'How do I run the dev server?',
                  'What is the rate limit for API v2.0?',
                  'What container engine does our architecture use?',
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => setInputText(q)}
                    className="text-left p-3 rounded-xl border border-border/60 hover:border-brand-primary/45 bg-surface-primary hover:bg-muted/30 text-xs font-medium text-text-secondary transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {activeWorkspace?.id === 'ws_marketing' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md mx-auto pt-4">
                {[
                  'When is the Q3 Product launch scheduled?',
                  'What social hashtags are recommended?',
                  'What campaigns kick off on August 15?',
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => setInputText(q)}
                    className="text-left p-3 rounded-xl border border-border/60 hover:border-brand-primary/45 bg-surface-primary hover:bg-muted/30 text-xs font-medium text-text-secondary transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-6">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                role={msg.role}
                content={msg.content}
                citations={msg.citations}
                contextMeter={msg.contextMeter}
                userName={user?.name}
                modelName={selectedModel}
                onCitationClick={handleCitationClick}
                onSourceClick={onSourceClick}
                onOpenArtifact={(content, language) => setActiveArtifact({ content, language })}
              />
            ))}

            {/* Streaming AI response */}
            {isStreaming && (
              <MessageBubble
                role="assistant"
                content={streamText}
                citations={streamCitations}
                contextMeter={streamContextMeter}
                isStreaming={true}
                modelName={selectedModel}
                onCitationClick={handleCitationClick}
                onSourceClick={onSourceClick}
                onOpenArtifact={(content, language) => setActiveArtifact({ content, language })}
              />
            )}
          </div>
        )}
        <div ref={messageEndRef} />
      </div>

      {/* Input Bar Section */}
      <div className="p-4 sm:p-6 border-t border-white/10 bg-black/20 backdrop-blur-xl shrink-0 z-10 relative pointer-events-auto">
        <AnimatePresence>
          {showUrlIngest && (
            <motion.form 
              initial={{ opacity: 0, y: 10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: 10, height: 0 }}
              onSubmit={handleUrlIngest} 
              className="max-w-2xl mx-auto mb-3 flex gap-2 overflow-hidden"
            >
              <div className="relative flex-1">
                <LinkIcon className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
                <Input
                  type="url"
                  placeholder="Paste URL or YouTube link to ingest..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="pl-9 h-9 text-xs bg-surface-primary/90 dark:bg-card/90 backdrop-blur-sm border border-border/80 rounded-xl"
                  required
                />
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={ingestUrlMutation.isPending || !urlInput.trim()}
                className="bg-brand-primary text-white hover:bg-brand-primary/90 h-9 px-4 rounded-xl shadow-sm"
              >
                {ingestUrlMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ingest'}
              </Button>
            </motion.form>
          )}
        </AnimatePresence>
        <form onSubmit={(e) => {
          e.preventDefault()
          if (inputText.trim() === '/antigravity') {
            window.dispatchEvent(new Event('toggle-antigravity'))
            setInputText('')
            return
          }
          handleSendMessage(e)
        }} className="max-w-2xl mx-auto relative flex items-end gap-2.5 bg-surface-primary/90 dark:bg-card/90 backdrop-blur-sm border border-border/80 focus-within:border-brand-primary/65 rounded-2xl p-2.5 shadow-sm transition-all">
          <SlashCommandMenu
            isVisible={showSlashMenu}
            selectedIndex={slashMenuIndex}
            onSelect={handleSlashCommandSelect}
            onHover={setSlashMenuIndex}
            position={{ bottom: 70, left: 10 }}
          />
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={(e) => {
              const val = e.target.value
              setInputText(val)
              const lastWord = val.split(/\s+/).pop() || ''
              if (lastWord.startsWith('/')) {
                setShowSlashMenu(true)
                setSlashQuery(lastWord)
                setSlashMenuIndex(0)
              } else {
                setShowSlashMenu(false)
              }
            }}
            onKeyDown={localHandleKeyDown}
            disabled={isStreaming}
            placeholder={
              isUploading ? 'Uploading files...' : (conversationTitle !== 'New Conversation' ? 'Ask anything about workspace documents... (Type / for commands)' : 'Send a message... (Type / for commands)')
            }
            className="flex-1 max-h-40 min-h-9 resize-none bg-transparent border-0 px-2.5 py-2 text-xs outline-none text-text-primary placeholder-text-muted self-center leading-normal"
          />
          {recognitionRef.current && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={toggleListening}
              className={cn(
                "h-9 w-9 shrink-0 flex items-center justify-center rounded-xl",
                isListening ? "text-danger bg-danger/10 hover:bg-danger/20" : "text-text-muted hover:text-text-primary hover:bg-muted/50"
              )}
              title={isListening ? "Stop listening" : "Start speaking"}
            >
              {isListening ? <MicOff className="h-4.5 w-4.5 animate-pulse" /> : <Mic className="h-4.5 w-4.5" />}
            </Button>
          )}
          
          {/* Removed Smart Rewrite button per agentic design */}

          {onClearChat && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={onClearChat}
              className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
              title="Clear Chat"
            >
              <Trash2 className="h-4.5 w-4.5" />
            </Button>
          )}

          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => setShowUrlIngest(!showUrlIngest)}
            className={cn(
              "h-9 w-9 shrink-0 flex items-center justify-center rounded-xl transition-colors",
              showUrlIngest ? "bg-brand-primary/20 text-brand-primary" : "text-text-muted hover:text-text-primary hover:bg-muted/50"
            )}
            title="Ingest URL"
          >
            <LinkIcon className="h-4.5 w-4.5" />
          </Button>

          <Button
            type="submit"
            size="icon"
            disabled={isStreaming || !inputText.trim()}
            className="h-9 w-9 bg-brand-primary text-white hover:bg-brand-primary/95 rounded-xl shrink-0 flex items-center justify-center shadow-sm disabled:opacity-45"
          >
            {isStreaming ? (
              <Loader2 className="h-4.5 w-4.5 animate-spin" />
            ) : (
              <Send className="h-4.5 w-4.5" />
            )}
          </Button>
        </form>
        <p className="text-[10px] text-text-muted text-center mt-2.5">
          AetherRAG matches query parameters against your vector indices. Answers might contain bracketed grounding citations.
        </p>
      </div>
    </div>
    
    <ArtifactPanel 
      isOpen={activeArtifact !== null} 
      onClose={() => setActiveArtifact(null)} 
      content={activeArtifact?.content || ''} 
      language={activeArtifact?.language || 'text'} 
    />
    </div>
  )
}
