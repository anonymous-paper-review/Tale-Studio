import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // server-only 는 react-server 조건에서만 빈 모듈이고 그 외엔 throw 한다(#server-only-key-boundary 2026-09-08).
      //   Next.js 빌드는 서버 번들에 그 조건을 붙이지만 vitest 는 안 붙인다 — 그대로 두면
      //   서버 모듈을 임포트하는 테스트가 전부 "Client Component 에서 임포트했다"로 죽는다.
      //   조건을 전역으로 켜면 React 가 클라이언트 훅을 안 내줌서 UI 테스트가 깨진다 —
      //   그래서 이 패키지 하나만 빈 모듈로 치환한다. 진짜 방어는 next build 가 한다.
      'server-only': path.resolve(__dirname, 'node_modules/server-only/empty.js'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.ts'],
  },
})
