import type { ServerResponse } from 'node:http'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

function buildProxyDebugCode(url: string) {
  if (url.includes('/auth/login')) return 'AUTH_LOGIN_PROXY_502'
  if (url.includes('/auth/me')) return 'AUTH_SESSION_PROXY_502'
  if (url.includes('/auth/logout')) return 'AUTH_LOGOUT_PROXY_502'
  return 'API_PROXY_502'
}

function isWritableProxyResponse(response: unknown): response is ServerResponse {
  return Boolean(
    response
    && typeof response === 'object'
    && 'headersSent' in response
    && 'writeHead' in response
    && typeof (response as ServerResponse).writeHead === 'function'
    && 'end' in response
    && typeof (response as ServerResponse).end === 'function',
  )
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('error', (error, request, response) => {
            const requestUrl = String(request.url ?? '')
            const debugCode = buildProxyDebugCode(requestUrl)
            const payload = JSON.stringify({
              debugCode,
              error: 'Upstream API is unavailable',
              message: error.message,
              details: `Proxy error while calling ${requestUrl}`,
            })

            if (isWritableProxyResponse(response) && !response.headersSent) {
              response.writeHead(502, {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              })
              response.end(payload)
            }
          })
        },
      },
      '/ws': {
        target: process.env.VITE_WS_PROXY_TARGET ?? process.env.VITE_API_PROXY_TARGET?.replace(/^http/, 'ws') ?? 'ws://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
  },
})
