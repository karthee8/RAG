'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { AnalyticsData } from '@/types'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import {
  Activity, FileText, Link as LinkIcon, Video, Image as ImageIcon,
  MessageSquare, RefreshCw, Trash2, Database, Download, Upload,
  Settings2, WifiOff, ExternalLink, ChevronRight, LayoutGrid,
  Plus, Mic, AudioLines, Loader2
} from 'lucide-react'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'
import { Document } from '@/types'
import KnowledgeUniverseBackground from '@/components/knowledge-universe-background'

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (custom: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: custom * 0.1, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }
  })
}

const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: (custom: number) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: custom * 0.1, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }
  })
}

// Donut Chart Data
const GRAPH_DATA = [
  { name: 'Document', value: 132, color: '#3b82f6' },
  { name: 'Link', value: 87, color: '#10b981' },
  { name: 'Video', value: 45, color: '#ef4444' },
  { name: 'Image', value: 38, color: '#f59e0b' },
]

export default function DashboardPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const setChatInputPrefill = useWorkspaceStore((state) => state.setChatInputPrefill)
  const { selectedWorkspaceId, addWorkspace, setSelectedWorkspaceId } = useWorkspaceStore()
  
  const [isMounted, setIsMounted] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [isUploading, setIsUploading] = React.useState(false)

  // Ensure workspace exists before uploading/ingesting
  const ensureWorkspace = async () => {
    if (selectedWorkspaceId) return selectedWorkspaceId
    try {
      const newWs = await addWorkspace('Default Workspace', 'Auto-created workspace for ingestion')
      setSelectedWorkspaceId(newWs.id)
      return newWs.id
    } catch (err) {
      toast.error('Failed to create default workspace')
      return null
    }
  }

  // File upload logic
  const uploadFileMutation = useMutation({
    mutationFn: async ({ file, wsId }: { file: File, wsId: string }): Promise<Document> => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('workspaceId', wsId)
      return apiClient.post<Document>('/documents', formData)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['documents', variables.wsId] })
      useWorkspaceStore.getState().fetchWorkspaces()
    },
  })

  const onDrop = React.useCallback(async (acceptedFiles: File[]) => {
    const wsId = await ensureWorkspace()
    if (!wsId) return
    
    setIsUploading(true)
    const uploadPromises = acceptedFiles.map(async (file) => {
      try {
        await uploadFileMutation.mutateAsync({ file, wsId })
        toast.success(`Uploaded ${file.name} successfully`)
      } catch (err: any) {
        toast.error(`Failed to upload ${file.name}: ${err.message || 'Unknown error'}`)
      }
    })
    await Promise.all(uploadPromises)
    setIsUploading(false)
  }, [ensureWorkspace]) // Removed uploadFileMutation from deps since it's stable via react-query, but we can safely leave it out.

  const { getRootProps, getInputProps, open } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    maxSize: 50 * 1024 * 1024,
  })

  // URL Ingest logic
  const ingestUrlMutation = useMutation({
    mutationFn: async ({ url, wsId }: { url: string, wsId: string }): Promise<Document> => {
      return apiClient.post<Document>('/documents/ingest-url', {
        url,
        workspaceId: wsId,
      })
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['documents', variables.wsId] })
      useWorkspaceStore.getState().fetchWorkspaces()
      toast.success('Ingested URL successfully')
    },
    onError: (err: any) => {
      toast.error(`Failed to ingest URL: ${err.message || 'Unknown error'}`)
    }
  })

  const handlePromptUrl = async (type: 'Website' | 'Video') => {
    const url = window.prompt(`Enter ${type} URL to ingest:`)
    if (!url?.trim()) return
    const wsId = await ensureWorkspace()
    if (!wsId) return
    
    toast.info(`Ingesting ${type}...`, { id: 'ingest-toast' })
    try {
      await ingestUrlMutation.mutateAsync({ url: url.trim(), wsId })
      toast.dismiss('ingest-toast')
    } catch {
      toast.dismiss('ingest-toast')
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setChatInputPrefill(query)
    router.push('/chat')
  }

  React.useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) return null

  return (
    <div {...getRootProps()} className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden text-white font-sans outline-none">
      <input {...getInputProps()} />
      
      <KnowledgeUniverseBackground />
      
      {/* 1. TOP LEFT: Knowledge Graph Status */}
      <motion.div 
        custom={0} initial="hidden" animate="visible" variants={fadeUp}
        className="absolute top-6 left-6 pointer-events-auto"
      >
        <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 w-64 shadow-2xl">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold tracking-wide text-white/90">Knowledge Graph</h2>
            <div className="flex items-center gap-1.5 bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full text-[10px] font-medium border border-green-500/20">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              Live
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/70 mb-1">
            <Database className="w-3.5 h-3.5 text-blue-400" />
            <span>302 nodes • 40 connections</span>
          </div>
          <div className="text-[10px] text-white/40">Last updated: 2s ago</div>
        </div>
      </motion.div>

      {/* RIGHT SIDEBAR */}
      <div className="absolute top-6 right-6 bottom-6 w-72 flex flex-col gap-4 pointer-events-auto overflow-y-auto hidden-scrollbar pb-24" style={{ scrollbarWidth: 'none' }}>
        
        {/* 2. GRAPH OVERVIEW */}
        <motion.div custom={1} initial="hidden" animate="visible" variants={scaleIn} className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl shrink-0">
          <h2 className="text-sm font-semibold text-white/90 mb-4">Graph Overview</h2>
          <div className="flex items-center gap-4">
            <div className="h-24 w-24 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={GRAPH_DATA}
                    innerRadius={30}
                    outerRadius={42}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {GRAPH_DATA.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#000', borderColor: '#333', fontSize: '12px' }} itemStyle={{ color: '#fff' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-2">
              {GRAPH_DATA.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-white/70">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                    {item.name}
                  </div>
                  <span className="text-white font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
          
          <div className="mt-5 pt-4 border-t border-white/10 space-y-2">
            <div className="flex justify-between text-xs text-white/60">
              <span>Total Nodes</span><span className="text-white">302</span>
            </div>
            <div className="flex justify-between text-xs text-white/60">
              <span>Visible Connections</span><span className="text-white">40</span>
            </div>
            <div className="flex justify-between text-xs text-white/60">
              <span>Active Pulses</span><span className="text-white">2</span>
            </div>
          </div>
        </motion.div>

        {/* 3. RECENT ACTIVITY */}
        <motion.div custom={2} initial="hidden" animate="visible" variants={scaleIn} className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl flex-1 shrink-0">
          <h2 className="text-sm font-semibold text-white/90 mb-4">Recent Activity</h2>
          <div className="space-y-4">
            {/* Activity 1 */}
            <div className="flex gap-3">
              <div className="mt-0.5 shrink-0 bg-blue-500/20 p-1.5 rounded-lg border border-blue-500/30">
                <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-0.5">
                  <span className="text-xs font-medium text-white/90">You asked</span>
                  <span className="text-[10px] text-white/40">2m ago</span>
                </div>
                <p className="text-[10px] text-white/70 truncate">"What is machine learning?"</p>
                <p className="text-[9px] text-white/40 mt-0.5">8 relevant chunks found</p>
              </div>
            </div>
            {/* Activity 2 */}
            <div className="flex gap-3">
              <div className="mt-0.5 shrink-0 bg-red-500/20 p-1.5 rounded-lg border border-red-500/30">
                <Video className="w-3.5 h-3.5 text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-0.5">
                  <span className="text-xs font-medium text-white/90 truncate">Ingested: YouTube Video</span>
                  <span className="text-[10px] text-white/40">6m ago</span>
                </div>
                <p className="text-[10px] text-white/70 truncate">Machine Learning Full Course</p>
                <p className="text-[9px] text-white/40 mt-0.5">45 chunks added</p>
              </div>
            </div>
            {/* Activity 3 */}
            <div className="flex gap-3">
              <div className="mt-0.5 shrink-0 bg-blue-500/20 p-1.5 rounded-lg border border-blue-500/30">
                <FileText className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-0.5">
                  <span className="text-xs font-medium text-white/90 truncate">Ingested: arxiv.pdf</span>
                  <span className="text-[10px] text-white/40">10m ago</span>
                </div>
                <p className="text-[9px] text-white/40 mt-0.5">56 chunks added</p>
              </div>
            </div>
            {/* Activity 4 */}
            <div className="flex gap-3">
              <div className="mt-0.5 shrink-0 bg-green-500/20 p-1.5 rounded-lg border border-green-500/30">
                <LinkIcon className="w-3.5 h-3.5 text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-0.5">
                  <span className="text-xs font-medium text-white/90 truncate">Ingested: OpenAI.com</span>
                  <span className="text-[10px] text-white/40">12m ago</span>
                </div>
                <p className="text-[9px] text-white/40 mt-0.5">87 chunks added</p>
              </div>
            </div>
            {/* Activity 5 */}
            <div className="flex gap-3">
              <div className="mt-0.5 shrink-0 bg-orange-500/20 p-1.5 rounded-lg border border-orange-500/30">
                <ImageIcon className="w-3.5 h-3.5 text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-0.5">
                  <span className="text-xs font-medium text-white/90 truncate">Ingested: diagram.png</span>
                  <span className="text-[10px] text-white/40">15m ago</span>
                </div>
                <p className="text-[9px] text-white/40 mt-0.5">38 chunks added</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* FLOATING CHAT INPUT */}
      <motion.div 
        custom={5} initial="hidden" animate="visible" variants={fadeUp}
        className="absolute top-10 left-1/2 -translate-x-1/2 pointer-events-auto z-50 w-full max-w-2xl px-4"
      >
        <form onSubmit={handleSearch} className="relative flex items-center bg-[#212121] rounded-full px-2 py-2 shadow-2xl border border-white/10">
          <button type="button" className="p-2 ml-1 text-white/50 hover:text-white transition-colors">
            <Plus className="w-6 h-6" />
          </button>
          <input 
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask anything"
            className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/40 px-3 text-[15px] h-10"
          />
          <div className="flex items-center gap-2 pr-1">
            <button type="button" className="p-2 text-white/50 hover:text-white transition-colors">
              <Mic className="w-5 h-5" />
            </button>
            <button type="submit" className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:bg-white/90 transition-colors">
              <AudioLines className="w-5 h-5" />
            </button>
          </div>
        </form>
      </motion.div>

      {/* BOTTOM AREA */}
      <div className="absolute bottom-6 left-6 right-[336px] flex flex-col gap-4 pointer-events-none">
        
        {/* 4. ADD SOURCE COMMANDS */}
        <motion.div custom={3} initial="hidden" animate="visible" variants={fadeUp} className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl pointer-events-auto max-w-4xl">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-sm font-semibold text-white/90">Add New Source</h2>
            <span className="text-xs text-white/40">Ingest and connect knowledge to your graph</span>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {/* Card 1 */}
            <button 
              onClick={open}
              disabled={isUploading}
              className="group bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-left transition-all duration-300 relative overflow-hidden shadow-[0_0_15px_rgba(59,130,246,0.15)] disabled:opacity-50"
            >
              <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity translate-x-2 group-hover:translate-x-0">
                <ChevronRight className="w-4 h-4 text-blue-400" />
              </div>
              <FileText className="w-6 h-6 text-blue-400 mb-2 group-hover:scale-110 transition-transform drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
              <div className="text-sm font-medium text-blue-400 mb-0.5 drop-shadow-[0_0_2px_rgba(59,130,246,0.5)]">Add Document</div>
              <div className="text-[10px] text-blue-400/50">PDF, TXT, DOCX...</div>
            </button>
            {/* Card 2 */}
            <button 
              onClick={() => handlePromptUrl('Website')}
              disabled={ingestUrlMutation.isPending}
              className="group bg-green-500/5 hover:bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-left transition-all duration-300 relative overflow-hidden shadow-[0_0_15px_rgba(16,185,129,0.15)] disabled:opacity-50"
            >
               <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity translate-x-2 group-hover:translate-x-0">
                <ChevronRight className="w-4 h-4 text-green-400" />
              </div>
              <LinkIcon className="w-6 h-6 text-green-400 mb-2 group-hover:scale-110 transition-transform drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
              <div className="text-sm font-medium text-green-400 mb-0.5 drop-shadow-[0_0_2px_rgba(16,185,129,0.5)]">Add Website</div>
              <div className="text-[10px] text-green-400/50">Enter URL to ingest</div>
            </button>
            {/* Card 3 */}
            <button 
              onClick={() => handlePromptUrl('Video')}
              disabled={ingestUrlMutation.isPending}
              className="group bg-red-500/5 hover:bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-left transition-all duration-300 relative overflow-hidden shadow-[0_0_15px_rgba(239,68,68,0.15)] disabled:opacity-50"
            >
               <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity translate-x-2 group-hover:translate-x-0">
                <ChevronRight className="w-4 h-4 text-red-400" />
              </div>
              <Video className="w-6 h-6 text-red-400 mb-2 group-hover:scale-110 transition-transform drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
              <div className="text-sm font-medium text-red-400 mb-0.5 drop-shadow-[0_0_2px_rgba(239,68,68,0.5)]">Add Video</div>
              <div className="text-[10px] text-red-400/50">YouTube transcripts</div>
            </button>
            {/* Card 4 */}
            <button 
              onClick={open}
              disabled={isUploading}
              className="group bg-orange-500/5 hover:bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 text-left transition-all duration-300 relative overflow-hidden shadow-[0_0_15px_rgba(249,115,22,0.15)] disabled:opacity-50"
            >
               <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity translate-x-2 group-hover:translate-x-0">
                <ChevronRight className="w-4 h-4 text-orange-400" />
              </div>
              <ImageIcon className="w-6 h-6 text-orange-400 mb-2 group-hover:scale-110 transition-transform drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]" />
              <div className="text-sm font-medium text-orange-400 mb-0.5 drop-shadow-[0_0_2px_rgba(249,115,22,0.5)]">Add Image</div>
              <div className="text-[10px] text-orange-400/50">Upload or OCR</div>
            </button>
            {/* Card 5 - More */}
            <button 
              onClick={() => router.push('/workspace')}
              className="group bg-white/5 hover:bg-white/10 border border-white/20 rounded-xl p-3 text-left transition-all duration-300 relative overflow-hidden flex flex-col justify-center items-center shadow-lg"
            >
              <LayoutGrid className="w-6 h-6 text-white/60 mb-2 group-hover:scale-110 transition-transform" />
              <div className="text-sm font-medium text-white/80 mb-0.5">More Commands</div>
              <div className="text-[10px] text-white/40 text-center">View all commands</div>
            </button>
          </div>
        </motion.div>

        {/* 5. SYSTEM COMMANDS */}
        <motion.div custom={4} initial="hidden" animate="visible" variants={fadeUp} className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl pointer-events-auto max-w-4xl">
          <h2 className="text-sm font-semibold text-white/90 mb-3">System Commands</h2>
          <div className="flex gap-1.5 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
            
            <button className="shrink-0 flex items-center gap-2 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg transition-colors">
              <RefreshCw className="w-4 h-4 text-indigo-400" />
              <div className="text-left">
                <div className="text-xs font-medium text-indigo-100">Reindex</div>
                <div className="text-[9px] text-white/40">Knowledge Base</div>
              </div>
            </button>

            <button className="shrink-0 flex items-center gap-2 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg transition-colors">
              <Trash2 className="w-4 h-4 text-purple-400" />
              <div className="text-left">
                <div className="text-xs font-medium text-purple-100">Clear Cache</div>
                <div className="text-[9px] text-white/40">Free memory</div>
              </div>
            </button>

            <button className="shrink-0 flex items-center gap-2 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg transition-colors">
              <Database className="w-4 h-4 text-blue-400" />
              <div className="text-left">
                <div className="text-xs font-medium text-blue-100">Rebuild Embeddings</div>
                <div className="text-[9px] text-white/40">Generate new vectors</div>
              </div>
            </button>

            <button className="shrink-0 flex items-center gap-2 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg transition-colors">
              <Activity className="w-4 h-4 text-emerald-400" />
              <div className="text-left">
                <div className="text-xs font-medium text-emerald-100">Optimize Store</div>
                <div className="text-[9px] text-white/40">Optimize vector DB</div>
              </div>
            </button>

            <button className="shrink-0 flex items-center gap-2 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg transition-colors">
              <Download className="w-4 h-4 text-orange-400" />
              <div className="text-left">
                <div className="text-xs font-medium text-orange-100">Export Database</div>
                <div className="text-[9px] text-white/40">Backup your data</div>
              </div>
            </button>

             <button className="shrink-0 flex items-center gap-2 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg transition-colors">
              <Upload className="w-4 h-4 text-cyan-400" />
              <div className="text-left">
                <div className="text-xs font-medium text-cyan-100">Import Database</div>
                <div className="text-[9px] text-white/40">Restore from backup</div>
              </div>
            </button>

            <button className="shrink-0 flex items-center gap-2 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg transition-colors">
              <Settings2 className="w-4 h-4 text-slate-400" />
              <div className="text-left">
                <div className="text-xs font-medium text-slate-100">Switch Model</div>
                <div className="text-[9px] text-white/40">Change LLM/Embedder</div>
              </div>
            </button>

            <button className="shrink-0 flex items-center gap-2 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-emerald-500/30 rounded-lg transition-colors">
              <WifiOff className="w-4 h-4 text-emerald-400" />
              <div className="text-left">
                <div className="text-xs font-medium text-emerald-100">Offline Mode</div>
                <div className="text-[9px] text-emerald-400/60">100% local mode</div>
              </div>
            </button>

          </div>
        </motion.div>
      </div>
    </div>
  )
}
