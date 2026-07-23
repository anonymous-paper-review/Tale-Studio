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
