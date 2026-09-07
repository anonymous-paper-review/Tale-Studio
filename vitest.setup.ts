// localStorage shim for Zustand persist middleware in node environment.

const memory = new Map<string, string>()

const localStorageShim = {
  getItem(key: string) {
    return memory.get(key) ?? null
  },
  setItem(key: string, value: string) {
    memory.set(key, value)
  },
  removeItem(key: string) {
    memory.delete(key)
  },
  clear() {
    memory.clear()
  },
  key(index: number) {
    return Array.from(memory.keys())[index] ?? null
  },
  get length() {
    return memory.size
  },
}

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageShim,
  writable: true,
  configurable: true,
})

// supabaseAdmin(모듈 스코프 createClient)이 import 시점에 URL/키를 요구한다 — 실제 호출은
// 각 테스트가 목으로 대체하므로 더미 값이면 충분. .env 없는 환경에서 스위트 수집 실패 방지.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://supabase.invalid'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'

// 제품 동작 스위치는 셔·.env.local 에서 물려받지 않는다 — 테스트는 코드 기본값에서 시작하고,
// 스위치를 검증하는 파일은 vi.stubEnv 로 직접 켠다(tests/take-hold.test.ts 가 그 패턴).
// 2026-09-02 실측: 셔에 TAKE_BILLING_MODE=shadow 가 있으면 director-video-generation-api 9건이
// 로컬에서만 빨개 떴다(CI 는 초록). 같은 스위트가 사람마다 다르게 나오면 믿을 수 없다.
for (const key of ['TAKE_BILLING_MODE']) delete process.env[key]
