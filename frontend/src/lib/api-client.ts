import { APP_CONFIG } from '@/constants/config'
import { useAuthStore } from '@/stores/auth.store'
import { z } from 'zod'

interface FetchOptions<T = unknown> extends RequestInit {
  params?: Record<string, string>
  schema?: z.ZodType<T>
}

class ApiClient {
  private getTokens() {
    if (typeof window === 'undefined') return { accessToken: null, refreshToken: null }
    const accessToken = localStorage.getItem(APP_CONFIG.AUTH.ACCESS_TOKEN_KEY)
    const refreshToken = localStorage.getItem(APP_CONFIG.AUTH.REFRESH_TOKEN_KEY)
    return { accessToken, refreshToken }
  }

  private setAccessToken(token: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(APP_CONFIG.AUTH.ACCESS_TOKEN_KEY, token)
      // Keep the in-memory store in sync so store-driven callers (e.g. the
      // upload dropzone) immediately use the refreshed token.
      useAuthStore.getState().setAccessToken(token)
    }
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const baseUrl = APP_CONFIG.API_BASE
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    const url = new URL(`${baseUrl}${cleanPath}`, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null) {
          url.searchParams.append(key, val)
        }
      })
    }
    return url.pathname + url.search
  }

  public async request<T>(path: string, options: FetchOptions<T> = {}): Promise<T> {
    const { params, headers, schema, ...rest } = options
    const url = this.buildUrl(path, params)
    
    const requestHeaders = new Headers(headers)
    if (!requestHeaders.has('Content-Type') && !(rest.body instanceof FormData)) {
      requestHeaders.set('Content-Type', 'application/json')
    }

    const { accessToken } = this.getTokens()
    if (accessToken) {
      requestHeaders.set('Authorization', `Bearer ${accessToken}`)
    }

    const response = await fetch(url, {
      ...rest,
      headers: requestHeaders,
    })

    if (!response.ok) {
      if (response.status === 401) {
        // Attempt silent refresh
        const refreshed = await this.tryRefresh()
        if (refreshed) {
          // Retry the request with new token
          const { accessToken: newAccessToken } = this.getTokens()
          requestHeaders.set('Authorization', `Bearer ${newAccessToken}`)
          const retryResponse = await fetch(url, {
            ...rest,
            headers: requestHeaders,
          })
          if (retryResponse.ok) {
            const data = await retryResponse.json()
            return schema ? schema.parse(data) : (data as T)
          }
          throw await this.handleError(retryResponse)
        }
      }
      throw await this.handleError(response)
    }

    // Handle empty responses
    if (response.status === 204) {
      return {} as T
    }

    const data = await response.json()
    return schema ? schema.parse(data) : (data as T)
  }

  private async tryRefresh(): Promise<boolean> {
    const { refreshToken } = this.getTokens()
    if (!refreshToken) return false

    try {
      const response = await fetch(`${APP_CONFIG.API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      if (response.ok) {
        const data = await response.json()
        this.setAccessToken(data.accessToken)
        return true
      }
    } catch (e) {
      console.error('Failed to refresh credentials:', e)
    }
    
    // Clear credentials on failure
    if (typeof window !== 'undefined') {
      localStorage.removeItem(APP_CONFIG.AUTH.ACCESS_TOKEN_KEY)
      localStorage.removeItem(APP_CONFIG.AUTH.REFRESH_TOKEN_KEY)
      // Dispatch event instead of hard redirect
      if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/signup')) {
        window.dispatchEvent(new Event('auth:unauthorized'))
      }
    }
    return false
  }

  private async handleError(response: Response): Promise<Error> {
    try {
      const errorData = await response.json()
      return new Error(errorData.message || `Request failed with status ${response.status}`)
    } catch {
      return new Error(`Request failed with status ${response.status}`)
    }
  }

  public get<T>(path: string, options?: FetchOptions<T>) {
    return this.request<T>(path, { ...options, method: 'GET' })
  }

  public post<T>(path: string, body?: unknown, options?: FetchOptions<T>) {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    })
  }

  public put<T>(path: string, body?: unknown, options?: FetchOptions<T>) {
    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
    })
  }

  public delete<T>(path: string, options?: FetchOptions<T>) {
    return this.request<T>(path, { ...options, method: 'DELETE' })
  }
}

export const apiClient = new ApiClient()
export default apiClient
