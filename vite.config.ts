import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Content Security Policy for the production build, injected as a <meta> tag (GitHub Pages cannot send headers).
 * Scripts may only come from this origin (plus WebAssembly, needed by Rapier and the mesh decoders), nothing can be
 * framed, no plugins, no forms, and the page can only talk to its own origin (plus data:/blob: for uploaded models).
 * It is not applied to the dev server, where Vite's hot reload needs inline scripts and a websocket.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

const securityHeaders = (): Plugin => ({
  name: 'security-meta',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="referrer" content="no-referrer" />`),
})

export default defineConfig({
  base: './',
  plugins: [react(), securityHeaders()],
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        // split big vendors so the browser can cache them across game updates
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('rapier')) return 'physics'
          if (id.includes('three') || id.includes('@react-three')) return 'three'
          return 'vendor'
        },
      },
    },
  },
})
