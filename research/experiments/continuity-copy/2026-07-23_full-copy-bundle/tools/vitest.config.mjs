// BASE 팔 전용 vitest 설정 — 루트 vitest.config.ts의 include(tests/**/*.test.ts)가
// 이 실험 폴더 밖 파일만 잡으므로, 같은 alias(@ → src)·setupFiles(vitest.setup.ts)를 재사용하는
// 로컬 config을 둔다. 루트 config/실험 폴더 밖 파일은 건드리지 않는다.
import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../../../../../')

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(REPO_ROOT, 'src') },
  },
  test: {
    environment: 'node',
    setupFiles: [path.resolve(REPO_ROOT, 'vitest.setup.ts')],
    include: ['**/*.test.ts'],
    testTimeout: 40 * 60 * 1000, // 실 writer 파이프라인 풀런 — S/V/C 축 LLM 콜 다수 + 안전필터 재시도(최대 8회)
    hookTimeout: 40 * 60 * 1000,
  },
})
