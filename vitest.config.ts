import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.ts'],
    // scripts/ 는 .gitignore 대상이라 다른 체크아웃에 없다 → 이 테스트는 저자 머신 밖에서 항상 실패한다.
    //   제품 코드가 아니므로 제외 (tsconfig.json exclude 와 짝, 2026-08-12 오너 지시).
    exclude: ['**/node_modules/**', 'tests/seed-test-accounts.test.ts'],
  },
})
