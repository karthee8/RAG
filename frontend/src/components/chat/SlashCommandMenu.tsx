import React from 'react'
import { Target, MessageSquareCode, FileSearch, Lightbulb, TerminalSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SlashCommand {
  id: string
  label: string
  icon: React.ReactNode
  description: string
}

export const AVAILABLE_COMMANDS: SlashCommand[] = [
  { id: '/grill-me', label: '/grill-me', icon: <MessageSquareCode className="h-4 w-4" />, description: 'Interactive interview to refine your plan' },
  { id: '/think', label: '/think', icon: <Lightbulb className="h-4 w-4" />, description: 'Trigger multi-step agent reasoning' },
  { id: '/goal', label: '/goal', icon: <Target className="h-4 w-4" />, description: 'Set a persistent long-running task' },
  { id: '/browser', label: '/browser', icon: <FileSearch className="h-4 w-4" />, description: 'Agentic web search and navigation' },
]

interface SlashCommandMenuProps {
  isVisible: boolean
  selectedIndex: number
  onSelect: (command: SlashCommand) => void
  onHover: (index: number) => void
  position: { bottom: number; left: number }
}

export function SlashCommandMenu({ isVisible, selectedIndex, onSelect, onHover, position }: SlashCommandMenuProps) {
  if (!isVisible) return null

  return (
    <div 
      className="absolute z-50 w-72 bg-surface-primary border border-border-light rounded-xl shadow-xl overflow-hidden text-sm"
      style={{ bottom: position.bottom, left: position.left }}
    >
      <div className="p-2 border-b border-border-light/50 text-xs font-semibold text-text-muted">
        Agent Commands
      </div>
      <div className="max-h-60 overflow-y-auto p-1">
        {AVAILABLE_COMMANDS.map((cmd, idx) => (
          <button
            key={cmd.id}
            onClick={() => onSelect(cmd)}
            onMouseEnter={() => onHover(idx)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg transition-colors",
              selectedIndex === idx ? "bg-brand-primary/10 text-brand-primary" : "text-text-primary hover:bg-muted/30"
            )}
          >
            <div className={cn(
              "p-1.5 rounded-md",
              selectedIndex === idx ? "bg-brand-primary/20" : "bg-muted text-text-muted"
            )}>
              {cmd.icon}
            </div>
            <div>
              <div className="font-medium">{cmd.label}</div>
              <div className="text-xs opacity-70 truncate">{cmd.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
