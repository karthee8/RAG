'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/common/UserAvatar'
import {
  MessageSquare,
  LayoutDashboard,
  FileText,
  BrainCircuit,
  Files,
  Settings,
  Hexagon,
  CircleDot
} from 'lucide-react'
import { ROUTES } from '@/constants/routes'

interface SidebarProps {
  className?: string
  onCloseMobile?: () => void
}

export function Sidebar({ className, onCloseMobile }: SidebarProps) {
  const pathname = usePathname()
  const { user } = useAuth()
  
  const [reducedMotion, setReducedMotion] = React.useState(false)

  const navItems = [
    { label: 'Chat', href: ROUTES.MAIN.CHAT, icon: MessageSquare },
    { label: 'Dashboard', href: ROUTES.MAIN.DASHBOARD, icon: LayoutDashboard },
    { label: 'Sources', href: '/sources', icon: FileText },
    { label: 'Memory', href: '/memory', icon: BrainCircuit },
    { label: 'Files', href: '/files', icon: Files },
    { label: 'Settings', href: ROUTES.MAIN.SETTINGS, icon: Settings },
  ]

  const systemStatus = [
    { label: 'API Server', status: 'Running', color: 'text-emerald-400' },
    { label: 'Vector DB', status: 'Connected', color: 'text-emerald-400' },
    { label: 'Database', status: 'Connected', color: 'text-emerald-400' },
    { label: 'Ollama', status: 'Ready', color: 'text-emerald-400' },
    { label: 'Embedding', status: 'Ready', color: 'text-emerald-400' },
  ]

  return (
    <div
      className={cn(
        'flex h-full w-64 flex-col border-r border-white/10 bg-black/40 backdrop-blur-xl px-4 py-6 text-white font-sans overflow-y-auto hidden-scrollbar',
        className
      )}
      style={{ scrollbarWidth: 'none' }}
    >
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-2 mb-8">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]">
          <Hexagon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-bold text-sm tracking-widest text-white">AETHERRAG</h2>
          <span className="text-[9px] text-white/50 tracking-wider">Local-First. Private. Powerful.</span>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="space-y-1.5 mb-8">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.label === 'Dashboard' && pathname === '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onCloseMobile}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-300 relative overflow-hidden',
                isActive
                  ? 'bg-black/60 text-white'
                  : 'text-white/60 hover:bg-white/5 hover:text-white/90'
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-2 bottom-2 w-1 bg-blue-500 rounded-r-md shadow-[0_0_8px_rgba(37,99,235,0.8)]" />
              )}
              <item.icon
                className={cn(
                  'h-4.5 w-4.5',
                  isActive ? 'text-blue-400' : 'text-white/40 group-hover:text-white/70'
                )}
              />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* System Status */}
      <div className="px-3 mb-8">
        <h3 className="text-[10px] font-bold text-white/40 mb-3">System Status</h3>
        <div className="space-y-2.5">
          {systemStatus.map((sys) => (
            <div key={sys.label} className="flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-2 text-white/70">
                <div className={cn("w-1.5 h-1.5 rounded-full", sys.status === 'Running' || sys.status === 'Connected' || sys.status === 'Ready' ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)]' : 'bg-red-500')} />
                {sys.label}
              </div>
              <span className={cn("font-medium", sys.color)}>{sys.status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Performance */}
      <div className="px-3 mb-6">
        <h3 className="text-[10px] font-bold text-white/40 mb-2">Performance</h3>
        <div className="text-emerald-400 font-bold text-sm mb-2">60 FPS</div>
        {/* SVG squiggly line chart */}
        <div className="h-6 w-full flex items-end opacity-80">
          <svg viewBox="0 0 100 24" className="w-full h-full" preserveAspectRatio="none">
            <path d="M0,20 Q5,15 10,20 T20,20 T30,15 T40,22 T50,18 T60,20 T70,10 T80,18 T90,15 T100,20 L100,24 L0,24 Z" fill="rgba(37,99,235,0.1)" />
            <path d="M0,20 Q5,15 10,20 T20,20 T30,15 T40,22 T50,18 T60,20 T70,10 T80,18 T90,15 T100,20" fill="none" stroke="#2563EB" strokeWidth="1.5" className="drop-shadow-[0_0_3px_rgba(37,99,235,0.8)]" />
          </svg>
        </div>
      </div>
      
      {/* Reduced Motion Toggle */}
      <div className="px-3 flex items-center justify-between mb-auto py-4 border-t border-white/5">
        <span className="text-[10px] font-bold text-white/60">Reduced Motion</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/40">Off</span>
          <div 
            className={cn("w-8 h-4 rounded-full flex items-center px-0.5 cursor-pointer", reducedMotion ? "bg-blue-600" : "bg-white/10")}
            onClick={() => setReducedMotion(!reducedMotion)}
          >
            <div className={cn("w-3 h-3 rounded-full bg-white transition-transform duration-200", reducedMotion ? "translate-x-4" : "translate-x-0")} />
          </div>
        </div>
      </div>

      {/* User profile */}
      <div className="border-t border-white/10 pt-4 mt-4 flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <UserAvatar name={user?.name || 'AetherRAG User'} size="sm" />
          <div className="truncate leading-tight">
            <p className="text-xs font-bold text-white/90 truncate">{user?.name || 'AetherRAG User'}</p>
            <div className="flex items-center gap-1 mt-0.5">
               <CircleDot className="w-2 h-2 text-emerald-500" />
               <span className="text-[9px] font-medium text-emerald-500">Local Mode</span>
            </div>
          </div>
        </div>
        <div className="text-white/40 hover:text-white/80 cursor-pointer">
           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </div>
      </div>
    </div>
  )
}
