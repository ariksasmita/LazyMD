import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'LazyMD',
        short_name: 'LazyMD',
        description: 'Local-first Markdown editor with Vim motions and Google Drive sync',
        theme_color: '#1a1b26',
        background_color: '#1a1b26',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  optimizeDeps: {
    exclude: ['wa-sqlite'],
    // Force all @codemirror/* into a single pre-bundle pass so
    // @codemirror/state is shared across all packages.
    include: [
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/language',
      '@codemirror/commands',
      '@codemirror/autocomplete',
      '@codemirror/search',
      '@codemirror/lint',
      '@codemirror/lang-markdown',
      '@codemirror/language-data',
      '@codemirror/theme-one-dark',
      '@replit/codemirror-vim',
      // '@codemirror/legacy-modes',  // has no '.' export, discovered transitively
      '@lezer/common',
      '@lezer/highlight',
      '@lezer/lr',
      '@lezer/markdown',
      'crelt',
      'style-mod',
      'w3c-keyname',
    ],
  },
})
