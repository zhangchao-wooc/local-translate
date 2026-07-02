import { defineConfig } from 'vite'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import Pages from 'vite-plugin-pages'
import * as path from 'path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import {
  TENCENT_MAAS_BASE_PATH,
  TENCENT_MAAS_ORIGIN,
  TENCENT_MAAS_PROXY_BASE_PATH,
} from './src/api/constants'

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

const tencentMaasProxy = (): Plugin => {
  const forwardRequest = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const requestUrl = req.url || '/'

    if (!requestUrl.startsWith(TENCENT_MAAS_PROXY_BASE_PATH)) {
      return false
    }

    const upstreamPath = requestUrl.replace(TENCENT_MAAS_PROXY_BASE_PATH, TENCENT_MAAS_BASE_PATH) || TENCENT_MAAS_BASE_PATH
    const upstreamUrl = `${TENCENT_MAAS_ORIGIN}${upstreamPath}`
    const headers = new Headers()

    Object.entries(req.headers || {}).forEach(([key, value]) => {
      if (!value || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return
      if (Array.isArray(value)) {
        value.forEach((item) => headers.append(key, item))
        return
      }
      headers.set(key, value)
    })

    try {
      const response = await fetch(upstreamUrl, {
        method: req.method || 'GET',
        headers,
        body: req.method === 'GET' || req.method === 'HEAD'
          ? undefined
          : Readable.toWeb(req) as NonNullable<RequestInit['body']>,
        duplex: 'half',
      })

      res.statusCode = response.status

      response.headers.forEach((value, key) => {
        if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return
        res.setHeader(key, value)
      })

      if (!response.body) {
        res.end()
        return true
      }

      await new Promise<void>((resolve, reject) => {
        Readable.fromWeb(response.body as never)
          .on('error', reject)
          .pipe(res)
          .on('finish', resolve)
          .on('error', reject)
      })

      return true
    } catch (error) {
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({
        message: 'Tencent Maas proxy request failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      }))
      return true
    }
  }

  return {
    name: 'tencent-maas-proxy',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        void forwardRequest(req, res).then((handled) => {
          if (!handled) next()
        })
      })
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use((req, res, next) => {
        void forwardRequest(req, res).then((handled) => {
          if (!handled) next()
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: [
      { find: /^~/, replacement: '' }, // 解决 vite 不支持 less 文件以 ～ 开头引入的问题
      { find: '@', replacement: path.resolve(__dirname, 'src') }
    ]
  },
  plugins: [

    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    tencentMaasProxy(),
    Pages({
      importMode: 'async',
      dirs: 'src/views',
      extensions: ['tsx'],
      exclude: ['**/components/**/*.tsx'],
      moduleId: '@@react-pages' // 因 less ～ 引入方式解决影响路由系统的默认文件 ～react-pages，故更改别名
    }),
  ],
})
