/// <reference types="vite/client" />

declare namespace google {
  namespace accounts {
    namespace oauth2 {
      interface TokenClient {
        requestAccessToken(configOverride?: { hint?: string }): void
      }
      interface TokenClientConfig {
        client_id: string
        scope: string
        callback: (response: TokenResponse) => void
        hint?: string
        prompt?: string
        error_callback?: (response: TokenResponse) => void
      }
      interface TokenResponse {
        access_token: string
        expires_in: string
        error?: string
        scope?: string
        token_type?: string
      }
      function initTokenClient(config: TokenClientConfig): TokenClient
      function revoke(accessToken: string): void
    }
  }
}

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string
  readonly VITE_GOOGLE_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
