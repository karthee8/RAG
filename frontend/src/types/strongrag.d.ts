// Ambient type for the Electron preload bridge (window.strongRAG). Present only
// in the packaged desktop app; undefined in a plain browser.
export {}

declare global {
  interface StrongRAGBridge {
    isDesktop: boolean
    setApiKey: (key: string) => Promise<{ ok: boolean; error?: string }>
    getApiKeyStatus: () => Promise<{ configured: boolean }>
  }

  interface Window {
    strongRAG?: StrongRAGBridge
  }
}
