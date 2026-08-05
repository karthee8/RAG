export const APP_CONFIG = {
  NAME: 'AetherRAG',
  API_BASE: '/api',
  AUTH: {
    ACCESS_TOKEN_KEY: 'aether_access_token',
    REFRESH_TOKEN_KEY: 'aether_refresh_token',
  },
  UPLOADS: {
    MAX_SIZE_BYTES: 50 * 1024 * 1024, // 50MB
    ACCEPTED_TYPES: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'text/csv': ['.csv'],
      'text/markdown': ['.md'],
    },
    MAX_FILES: 10,
  },
  STREAM: {
    SPEEDS: {
      slow: 80,   // ms per token
      normal: 30, // ms per token
      fast: 10,   // ms per token
    },
  },
} as const;
