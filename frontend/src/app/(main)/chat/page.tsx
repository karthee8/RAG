'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { apiClient } from '@/lib/api-client'
import { Conversation, Message, RetrievedChunk, Citation } from '@/types'
import { toast } from 'sonner'
import { MessageSquare } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useAuthStore } from '@/stores/auth.store'

// Subcomponents
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { ChatArea } from '@/components/chat/ChatArea'
import { GroundingDrawer } from '@/components/chat/GroundingDrawer'

export default function ChatPage() {
  const queryClient = useQueryClient()
  const { selectedWorkspaceId, selectedModel, setSelectedModel, streamingSpeed, workspaces, addWorkspace, setSelectedWorkspaceId } = useWorkspaceStore()
  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)

  const [activeConvId, setActiveConvId] = React.useState<string | null>(null)
  const [inputText, setInputText] = React.useState('')
  const { chatInputPrefill, setChatInputPrefill } = useWorkspaceStore()
  const [keyConfigured, setKeyConfigured] = React.useState<boolean | null>(null)
  
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.strongRAG) {
      window.strongRAG.getApiKeyStatus().then((s: { configured: boolean }) => setKeyConfigured(s.configured)).catch(() => {})
    } else {
      setKeyConfigured(true) // assume true if not on desktop
    }
  }, [])
  
  const [autoSendQuery, setAutoSendQuery] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (chatInputPrefill) {
      setInputText(chatInputPrefill)
      setAutoSendQuery(chatInputPrefill)
      setChatInputPrefill('')
    }
  }, [chatInputPrefill, setChatInputPrefill])

  // Fire auto-send after state settles to avoid closure issues
  React.useEffect(() => {
    if (autoSendQuery) {
      handleSendMessage(undefined, autoSendQuery)
      setAutoSendQuery(null)
    }
  }, [autoSendQuery])

  const [isStreaming, setIsStreaming] = React.useState(false)

  // Streaming states
  const [streamText, setStreamText] = React.useState('')
  const [streamChunks, setStreamChunks] = React.useState<RetrievedChunk[]>([])
  const [streamCitations, setStreamCitations] = React.useState<Citation[]>([])
  const [streamContextMeter, setStreamContextMeter] = React.useState<{tokensUsed: number, contextLimit: number} | undefined>(undefined)

  // Grounding detail sidebar state
  const [selectedCitation, setSelectedCitation] = React.useState<Citation | null>(null)
  const [isGroundingOpen, setIsGroundingOpen] = React.useState(false)

  const activeWorkspace = React.useMemo(() => {
    return workspaces.find((w) => w.id === selectedWorkspaceId) || null
  }, [workspaces, selectedWorkspaceId])

  // 1. Fetch conversations for active workspace
  const { data: conversations = [], isLoading: isLoadingConvs } = useQuery<Conversation[]>({
    queryKey: ['conversations', selectedWorkspaceId],
    queryFn: () =>
      apiClient.get<Conversation[]>(`/conversations?workspaceId=${selectedWorkspaceId}`),
    enabled: !!selectedWorkspaceId,
  })

  // Auto-select first conversation if exists and none active
  React.useEffect(() => {
    if (conversations.length > 0 && !activeConvId) {
      setActiveConvId(conversations[0].id)
    } else if (conversations.length === 0) {
      setActiveConvId(null)
    }
  }, [conversations, activeConvId])

  // 2. Fetch messages for active conversation
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<Message[]>({
    queryKey: ['messages', activeConvId],
    queryFn: () => apiClient.get<Message[]>(`/messages?conversationId=${activeConvId}`),
    enabled: !!activeConvId,
  })

  // 3. Create conversation mutation
  const createConvMutation = useMutation({
    mutationFn: ({ title, wsId }: { title: string, wsId: string }) =>
      apiClient.post<Conversation>('/conversations', {
        title,
        workspaceId: wsId,
      }),
    onSuccess: (newConv) => {
      queryClient.invalidateQueries({ queryKey: ['conversations', selectedWorkspaceId] })
      setActiveConvId(newConv.id)
    },
  })

  const deleteConvMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/conversations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', selectedWorkspaceId] })
      if (activeConvId) {
        setActiveConvId(null)
      }
      toast.success('Conversation deleted')
    },
  })

  // 5. Clear chat history mutation
  const clearChatMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/chat/${id}/history`),
    onSuccess: () => {
      queryClient.setQueryData(['messages', activeConvId], [])
      queryClient.invalidateQueries({ queryKey: ['messages', activeConvId] })
      toast.success('Chat history cleared')
    }
  })

  const handleClearChat = () => {
    if (activeConvId) {
      if (confirm('Are you sure you want to clear this chat history?')) {
        clearChatMutation.mutate(activeConvId)
      }
    }
  }

  // Scroll messages viewport to bottom
  const messageEndRef = React.useRef<HTMLDivElement>(null)
  const scrollToBottom = () => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  React.useEffect(() => {
    scrollToBottom()
  }, [messages, streamText, isStreaming])

  // Auto-grow textarea height
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(160, textareaRef.current.scrollHeight)}px`
    }
  }, [inputText])

  const handleCreateNewChat = () => {
    if (!selectedWorkspaceId) return
    const chatNumber = conversations.length + 1
    createConvMutation.mutate({ title: `Chat Room #${chatNumber}`, wsId: selectedWorkspaceId })
  }

  // Handle SSE message submission
  const handleSendMessage = async (e?: React.FormEvent, overrideText?: string) => {
    if (e) e.preventDefault()
    
    const queryText = (overrideText || inputText).trim()
    if (!queryText || isStreaming) return

    let currentWsId = selectedWorkspaceId
    if (!currentWsId) {
      try {
        const newWs = await addWorkspace('Default Workspace', 'Auto-created workspace for chatting')
        currentWsId = newWs.id
        setSelectedWorkspaceId(currentWsId)
      } catch (err) {
        toast.error('Failed to create default workspace')
        return
      }
    }

    let currentConvId = activeConvId
    // Auto-create a conversation if none exists
    if (!currentConvId) {
      try {
        const newConv = await createConvMutation.mutateAsync({ 
          title: `Chat Room #${conversations.length + 1}`, 
          wsId: currentWsId 
        })
        currentConvId = newConv.id
      } catch (err) {
        toast.error('Failed to start chat')
        return
      }
    }

    setInputText('')
    setIsStreaming(true)
    setStreamText('')
    setStreamChunks([])
    setStreamCitations([])
    setStreamContextMeter(undefined)

    //Optimistic UI addition
    queryClient.setQueryData<Message[]>(['messages', currentConvId], (prev = []) => [
      ...prev,
      {
        id: `optimistic_${Date.now()}`,
        conversationId: currentConvId!,
        role: 'user',
        content: queryText,
        citations: [],
        chunks: [],
        createdAt: new Date().toISOString(),
      },
    ])

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          conversationId: currentConvId,
          content: queryText,
          model: selectedModel,
          speed: streamingSpeed,
        }),
      })

      if (!response.ok) {
        if (response.status === 401) {
          useAuthStore.getState().logout()
        }
        throw new Error('Failed to send message')
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No reader')

      const decoder = new TextDecoder()
      let buffer = ''
      let currentEvent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const cleanLine = line.trim()
          if (!cleanLine) continue

          if (cleanLine.startsWith('event: ')) {
            currentEvent = cleanLine.replace('event: ', '')
          } else if (cleanLine.startsWith('data: ')) {
            const dataStr = cleanLine.replace('data: ', '')
            try {
              const parsedData = JSON.parse(dataStr)
              if (currentEvent === 'token') {
                setStreamText((prev) => prev + parsedData.token)
              } else if (currentEvent === 'sources') {
                setStreamCitations(parsedData.sources)
              } else if (currentEvent === 'context_meter') {
                setStreamContextMeter({
                  tokensUsed: parsedData.tokens_used,
                  contextLimit: parsedData.context_limit
                })
              }
            } catch (err) {
              // Ignore line-level JSON parses
            }
          }
        }
      }

      // Finish streaming and sync with DB
      queryClient.invalidateQueries({ queryKey: ['messages', currentConvId] })
      queryClient.invalidateQueries({ queryKey: ['conversations', selectedWorkspaceId] })
    } catch (err) {
      toast.error('Failed to get response')
      // Remove user optimistic message on failure
      queryClient.invalidateQueries({ queryKey: ['messages', currentConvId] })
    } finally {
      setIsStreaming(false)
      setStreamText('')
      setStreamChunks([])
      setStreamCitations([])
      setStreamContextMeter(undefined)
    }
  }

  // Textarea key triggers
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // Handle citation bracket clicks e.g., [1]
  // Stable identities so the memoized MessageBubble doesn't re-render every
  // message on each streamed token.
  const handleCitationClick = React.useCallback((citationsList: Citation[], text: string) => {
    const match = text.match(/\[(\d+)\]/)
    if (match) {
      const idx = parseInt(match[1])
      const cit = citationsList.find((c) => c.index === idx)
      if (cit) {
        setSelectedCitation(cit)
        setIsGroundingOpen(true)
      }
    }
  }, [])

  const handleSourceClick = React.useCallback((citation: Citation) => {
    setSelectedCitation(citation)
    setIsGroundingOpen(true)
  }, [])

  const models = [
    { id: 'openai/gpt-4o', name: 'ChatGPT (GPT-4o)', provider: 'OpenRouter' },
  ]

  if (!selectedWorkspaceId) {
    return (
      <div className="flex h-[calc(100vh-4rem)] md:h-screen w-full items-center justify-center p-6 bg-transparent pointer-events-none z-10 relative">
        <Card className="max-w-md w-full border border-white/10 bg-black/40 backdrop-blur-xl rounded-2xl py-10 shadow-2xl text-center pointer-events-auto">
          <CardContent className="flex flex-col items-center">
            <div className="h-16 w-16 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mb-4">
              <MessageSquare className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-text-primary mb-2">Workspace Chat</h3>
            <p className="text-xs text-text-muted max-w-xs mb-6 leading-relaxed">
              Create a workspace or select one from the sidebar dropdown to start querying your custom groundings.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (keyConfigured === false) {
    return (
      <div className="flex h-[calc(100vh-4rem)] md:h-screen w-full items-center justify-center p-6 bg-transparent pointer-events-none z-10 relative">
        <Card className="max-w-md w-full border border-white/10 bg-black/40 backdrop-blur-xl rounded-2xl py-10 shadow-2xl text-center pointer-events-auto">
          <CardContent className="flex flex-col items-center">
            <div className="h-16 w-16 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mb-4">
              <MessageSquare className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-text-primary mb-2">Setup Required</h3>
            <p className="text-xs text-text-muted max-w-xs mb-6 leading-relaxed">
              You must configure your OpenRouter API key before using the chat.
            </p>
            <a 
              href="/settings"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-primary px-4 text-xs font-semibold text-primary-foreground shadow transition-colors hover:bg-brand-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            >
              Go to Settings
            </a>
          </CardContent>
        </Card>
      </div>
    )
  }

  const conversationTitle = conversations.find((c) => c.id === activeConvId)?.title || 'New Conversation'

  return (
    <div className="flex h-[calc(100vh-4rem)] md:h-screen w-full overflow-hidden relative bg-transparent pointer-events-none">
      <ChatSidebar
        conversations={conversations}
        isLoadingConvs={isLoadingConvs}
        activeConvId={activeConvId}
        setActiveConvId={setActiveConvId}
        handleCreateNewChat={handleCreateNewChat}
        deleteConv={(id) => deleteConvMutation.mutate(id)}
      />

      <ChatArea
        activeWorkspace={activeWorkspace}
        conversationTitle={conversationTitle}
        models={models}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        isLoadingMessages={isLoadingMessages}
        messages={messages}
        isStreaming={isStreaming}
        streamText={streamText}
        streamCitations={streamCitations}
        streamContextMeter={streamContextMeter}
        inputText={inputText}
        setInputText={setInputText}
        handleSendMessage={handleSendMessage}
        handleKeyDown={handleKeyDown}
        messageEndRef={messageEndRef}
        textareaRef={textareaRef}
        user={user}
        handleCitationClick={handleCitationClick}
        onSourceClick={handleSourceClick}
        onClearChat={handleClearChat}
      />

      <GroundingDrawer
        isOpen={isGroundingOpen}
        setIsOpen={setIsGroundingOpen}
        selectedCitation={selectedCitation}
      />
    </div>
  )
}
