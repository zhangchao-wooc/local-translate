import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import Pages from 'vite-plugin-pages'
import * as path from 'path'

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
    Pages({
      importMode: 'async',
      dirs: 'src/views',
      extensions: ['tsx'],
      exclude: ['**/components/**/*.tsx'],
      moduleId: '@@react-pages' // 因 less ～ 引入方式解决影响路由系统的默认文件 ～react-pages，故更改别名
    }),
  ],
})
