'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/auth.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { PageLoader } from '@/components/common/PageLoader'
import { Menu, X, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AnimatePresence, motion } from 'framer-motion'
import { ROUTES } from '@/constants/routes'
import KnowledgeUniverseBackground from '@/components/knowledge-universe-background'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { isAuthenticated, user } = useAuth()
  const { fetchWorkspaces } = useWorkspaceStore()
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)
  const [isMounted, setIsMounted] = React.useState(false)

  React.useEffect(() => {
    setIsMounted(true)
    if (isAuthenticated) {
      fetchWorkspaces()
    } else {
      router.replace(ROUTES.AUTH.LOGIN)
    }
  }, [isAuthenticated, fetchWorkspaces, router])

  React.useEffect(() => {
    const handleUnauthorized = () => {
      // Clear the stale session so the login screen starts clean, then redirect.
      useAuthStore.getState().logout()
      toast.error('Your session expired. Please sign in again.')
      router.replace(ROUTES.AUTH.LOGIN)
    }
    window.addEventListener('auth:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized)
  }, [router])

  // Hydration protection and redirect verification
  if (!isMounted || !isAuthenticated) {
    return <PageLoader />
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-black relative">
      {/* Global Cinematic 3D Background */}
      <KnowledgeUniverseBackground />
      {/* Subtle scrim for overall contrast */}
      <div className="absolute inset-0 z-0 bg-black/40 dark:bg-black/60 pointer-events-none"></div>

      <div className="flex h-full w-full z-10 relative">
        {/* Desktop Sidebar (visible on md+) */}
      <Sidebar className="hidden md:flex shrink-0" />

      {/* Mobile Sidebar Overlay (Framer Motion Drawer) */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 flex md:hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/45 backdrop-blur-xs"
            />
            {/* Sidebar Sheet */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative flex w-64 max-w-[80vw] h-full flex-col bg-surface-primary dark:bg-card z-50"
            >
              {/* Close Button Inside Sheet */}
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="absolute top-5 right-5 text-text-muted hover:text-text-primary p-1"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
              <Sidebar className="w-full border-r-0" onCloseMobile={() => setMobileMenuOpen(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main content body */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden bg-transparent">
        {/* Mobile Header (visible on mobile only) */}
        <header className="flex h-16 w-full items-center justify-between border-b border-border/50 bg-surface-primary/75 dark:bg-card/30 backdrop-blur-[12px] px-4 md:hidden shrink-0">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(true)}
              className="-ml-2 hover:bg-muted/50 rounded-xl"
              aria-label="Open menu"
            >
              <Menu className="h-6 w-6 text-text-primary" />
            </Button>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary text-white shadow-md shadow-brand-primary/10">
              <Sparkles className="h-4.5 w-4.5" />
            </div>
            <h1 className="text-xs font-bold text-text-primary">AetherRAG</h1>
          </div>
        </header>

        {/* Scrollable Page Body */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden relative bg-transparent">
          {children}
        </main>
      </div>
      </div>
    </div>
  )
}
