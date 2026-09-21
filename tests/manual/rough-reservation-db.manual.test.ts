// 로컬 PostgreSQL에서 러프 예약의 동시성과 소유권을 실제 실행으로 검증한다
import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'

it.skipIf(!process.env.ROUGH_RESERVATION_DB_URL)('동시에 요청한 러프는 같은 작업을 공유하고 다른 사람은 예약하지 못한다', () => {
  const output = execFileSync(process.execPath, ['scripts/test-rough-reservation-db.mjs'], { encoding: 'utf8', timeout: 60_000, env: process.env })
  expect(JSON.parse(output).passed).toBe(7)
}, 65_000)
