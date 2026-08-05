'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, LoginInput, signupSchema, SignupInput } from '@/lib/schemas/auth'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Eye, EyeOff, Lock, Mail, User, Loader2, Sparkles, ArrowRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { ThemeToggle } from '@/components/common/ThemeToggle'

type AuthMode = 'login' | 'signup'

interface AnimatedAuthProps {
  initialMode?: AuthMode
}

export function AnimatedAuth({ initialMode = 'login' }: AnimatedAuthProps) {
  const [mode, setMode] = React.useState<AuthMode>(initialMode)
  
  // Slide animation variants
  const variants = {
    enter: (direction: number) => {
      return {
        x: direction > 0 ? 400 : -400,
        opacity: 0,
        scale: 0.95
      };
    },
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 30
      }
    },
    exit: (direction: number) => {
      return {
        zIndex: 0,
        x: direction < 0 ? 400 : -400,
        opacity: 0,
        scale: 0.95,
        transition: {
          type: 'spring',
          stiffness: 300,
          damping: 30
        }
      };
    }
  };

  const direction = mode === 'login' ? -1 : 1;

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden px-4 py-8 bg-black">
      {/* Full Black Background */}
      <div className="absolute inset-0 z-0 bg-black"></div>

      <div className="absolute top-6 right-6 z-50">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md z-10 relative">
        <motion.div 
          layoutId="brand-header"
          className="flex flex-col items-center mb-6 text-center"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-primary text-white shadow-md shadow-brand-primary/20 mb-3">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow-md">AetherRAG</h1>
          <p className="text-sm text-white/90 font-medium drop-shadow-sm mt-1">Enterprise-grade AI Knowledge Base</p>
        </motion.div>

        <div className="relative overflow-hidden rounded-2xl shadow-2xl bg-surface-primary/90 dark:bg-card/90 backdrop-blur-xl border border-border/50 min-h-[550px] flex flex-col justify-center">
          <AnimatePresence initial={false} custom={direction} mode="wait">
            {mode === 'login' ? (
              <motion.div
                key="login"
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                className="w-full h-full flex flex-col justify-center"
              >
                <LoginForm onSwitch={() => setMode('signup')} />
              </motion.div>
            ) : (
              <motion.div
                key="signup"
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                className="w-full h-full flex flex-col justify-center"
              >
                <SignupForm onSwitch={() => setMode('login')} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

function LoginForm({ onSwitch }: { onSwitch: () => void }) {
  const { login, isLoggingIn } = useAuth()
  const [showPassword, setShowPassword] = React.useState(false)
  const [apiError, setApiError] = React.useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (data: LoginInput) => {
    setApiError(null)
    try {
      await login(data)
    } catch (err: any) {
      setApiError(err.message || 'Invalid email or password.')
    }
  }

  return (
    <div className="p-6">
      <div className="space-y-1 mb-6 text-center">
        <h2 className="text-xl font-bold tracking-tight">Welcome back</h2>
        <p className="text-xs text-text-muted">Enter your credentials to access your workspace.</p>
      </div>
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {apiError && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg bg-danger/10 border border-danger/25 p-3 text-xs text-danger font-medium">
            {apiError}
          </motion.div>
        )}
        
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-secondary">Email Address</label>
          <div className="relative">
            <Mail className="absolute left-3 top-2.5 h-4.5 w-4.5 text-text-muted" />
            <Input
              type="email"
              disabled={isLoggingIn}
              className="pl-10 bg-surface-secondary/50 border-border focus-visible:ring-brand-primary transition-all duration-200"
              {...register('email')}
            />
          </div>
          {errors.email && <p className="text-xs font-medium text-danger">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-text-secondary">Password</label>
            <button type="button" className="text-xs font-medium text-brand-primary hover:underline">Forgot?</button>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 h-4.5 w-4.5 text-text-muted" />
            <Input
              type={showPassword ? 'text' : 'password'}
              disabled={isLoggingIn}
              className="pl-10 pr-10 bg-surface-secondary/50 border-border focus-visible:ring-brand-primary transition-all duration-200"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-2.5 text-text-muted hover:text-text-secondary"
            >
              {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
            </button>
          </div>
          {errors.password && <p className="text-xs font-medium text-danger">{errors.password.message}</p>}
        </div>

        <Button type="submit" disabled={isLoggingIn} className="w-full h-10 mt-2 group">
          {isLoggingIn ? (
            <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Signing in...</span>
          ) : (
            <span className="flex items-center gap-2">Sign In <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" /></span>
          )}
        </Button>
      </form>
      
      <div className="mt-6 text-center text-xs text-text-muted">
        Don&apos;t have an account?{' '}
        <button onClick={onSwitch} className="font-semibold text-brand-primary hover:underline">
          Create an account
        </button>
      </div>
    </div>
  )
}

function SignupForm({ onSwitch }: { onSwitch: () => void }) {
  const { signup, isSigningUp } = useAuth()
  const [showPassword, setShowPassword] = React.useState(false)
  const [apiError, setApiError] = React.useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  })

  const onSubmit = async (data: SignupInput) => {
    setApiError(null)
    try {
      await signup({ name: data.name, email: data.email, password: data.password })
    } catch (err: any) {
      setApiError(err.message || 'Something went wrong during signup.')
    }
  }

  return (
    <div className="p-6">
      <div className="space-y-1 mb-6 text-center">
        <h2 className="text-xl font-bold tracking-tight">Create an account</h2>
        <p className="text-xs text-text-muted">Sign up today and start querying your datasets.</p>
      </div>
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
        {apiError && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg bg-danger/10 border border-danger/25 p-3 text-xs text-danger font-medium">
            {apiError}
          </motion.div>
        )}
        
        <div className="space-y-1">
          <label className="text-xs font-semibold text-text-secondary">Full Name</label>
          <div className="relative">
            <User className="absolute left-3 top-2.5 h-4.5 w-4.5 text-text-muted" />
            <Input type="text" disabled={isSigningUp} className="pl-10 bg-surface-secondary/50 border-border focus-visible:ring-brand-primary transition-all" {...register('name')} />
          </div>
          {errors.name && <p className="text-xs font-medium text-danger">{errors.name.message}</p>}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-text-secondary">Email Address</label>
          <div className="relative">
            <Mail className="absolute left-3 top-2.5 h-4.5 w-4.5 text-text-muted" />
            <Input type="email" disabled={isSigningUp} className="pl-10 bg-surface-secondary/50 border-border focus-visible:ring-brand-primary transition-all" {...register('email')} />
          </div>
          {errors.email && <p className="text-xs font-medium text-danger">{errors.email.message}</p>}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-text-secondary">Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 h-4.5 w-4.5 text-text-muted" />
            <Input type={showPassword ? 'text' : 'password'} disabled={isSigningUp} className="pl-10 pr-10 bg-surface-secondary/50 border-border focus-visible:ring-brand-primary transition-all" {...register('password')} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-text-muted hover:text-text-secondary">
              {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
            </button>
          </div>
          {errors.password && <p className="text-xs font-medium text-danger">{errors.password.message}</p>}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-text-secondary">Confirm Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 h-4.5 w-4.5 text-text-muted" />
            <Input type={showPassword ? 'text' : 'password'} disabled={isSigningUp} className="pl-10 bg-surface-secondary/50 border-border focus-visible:ring-brand-primary transition-all" {...register('confirmPassword')} />
          </div>
          {errors.confirmPassword && <p className="text-xs font-medium text-danger">{errors.confirmPassword.message}</p>}
        </div>

        <Button type="submit" disabled={isSigningUp} className="w-full h-10 mt-2 group">
          {isSigningUp ? (
            <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Creating account...</span>
          ) : (
            <span className="flex items-center gap-2">Create Account <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" /></span>
          )}
        </Button>
      </form>

      <div className="mt-6 text-center text-xs text-text-muted">
        Already have an account?{' '}
        <button onClick={onSwitch} className="font-semibold text-brand-primary hover:underline">
          Sign in
        </button>
      </div>
    </div>
  )
}
