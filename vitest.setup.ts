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
// 2026-09-07 재발: Paddle 샌드박스 상품 등록 뒤 .env.local 의 NEXT_PUBLIC_PADDLE_PRICE_* 13개가 올라와
// paddle-checkout "상품 ID 없으면 결제창 안 열림" 1건이 로컬에서만 빨개 떴다. 가격 ID 를 검증하는 파일은 자기가 직접 켠다.
// 2026-10-11: 셸의 DISCORD_ALERT_WEBHOOK_URL 이 올라와 테스트가 실제 디스코드 #webhook 채널에 알림을 보냈다
// ('[tale · local] 즉시 재조회로 결제를 복구했다'). 알림 전송을 검증하는 파일은 vi.stubEnv 로 가짜 주소를 직접 켠다.
// 2026-10-11: Creem 프롬프트 검사 키·스위치도 같은 이유로 지운다 — 셸에 키가 있으면 생성 라우트 테스트가
// 실제 Creem 검사 API 를 부른다(유료 호출 + 외부 의존). 검사를 검증하는 파일은 vi.stubEnv 로 가짜 키를 직접 켠다.
// 2026-11-19: PortOne(국내 카드) 키도 지운다 — 셸에 키가 있으면 결제창 판정 테스트가 사람마다 달라지고, 실제 PortOne API 를 부른다.
for (const key of Object.keys(process.env)) {
  if (key.startsWith('PORTONE_') || key.startsWith('NEXT_PUBLIC_PORTONE_')) delete process.env[key]
  if (key === 'TAKE_BILLING_MODE' || key === 'DISCORD_ALERT_WEBHOOK_URL' || key === 'CREEM_API_KEY' || key === 'CREEM_MODERATION_MODE' || key.startsWith('NEXT_PUBLIC_PADDLE_PRICE_')) delete process.env[key]
}

// 2026-10-11(#creem-moderation): 검사는 기본 '끄기'로 시작한다 — 켜져 있으면 키가 없어 모든 생성 라우트
// 테스트가 fail closed(503)로 떨어진다. 검사 동작을 검증하는 파일은 vi.stubEnv 로 켜거나
// vi.mock('@/lib/moderation/creem') 으로 판정을 직접 정한다(tests/moderation/*).
// 운영(VERCEL_ENV=production)에서는 이 스위치가 무시되므로 심사 약속은 그대로다.
process.env.CREEM_MODERATION_MODE = 'off'

// 2026-11-24(1층 폴링): 화면은 한 틱에 도는 잡 여러 개를 /api/generation-jobs?ids= 한 번으로 묻는다. 기존 테스트 20여 파일은
//   fetch 를 잡 하나씩 /api/generation-jobs/<id> 로 가로채 가짜 응답을 돌려주므로, 테스트에서는 묶는 최대 개수를 1로 두어
//   잡 하나씩 묻는 예전 주소를 그대로 쓴다. 묶어 묻는 동작을 검증하는 파일은 vi.stubEnv('NEXT_PUBLIC_POLL_BATCH_MAX', '50') 로 직접 켠다.
process.env.NEXT_PUBLIC_POLL_BATCH_MAX = '1'
