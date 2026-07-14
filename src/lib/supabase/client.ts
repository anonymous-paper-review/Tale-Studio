import { createBrowserClient } from '@supabase/ssr'
import { isDemoSession } from '@/lib/demo/context'
import { createDemoClient } from '@/lib/demo/supabase-shim'

// 실 브라우저 클라 생성. 데모 분기의 반환 타입을 이 구체 함수의 ReturnType 으로 고정해
// 원본(비제네릭 호출 = SupabaseClient<any>)과 정확히 일치시킨다.
//   주의: `ReturnType<typeof createBrowserClient>` 는 제네릭 함수라 기본값(any)이 아니라
//   제약(GenericSchema)으로 인스턴스화돼 행 타입이 {} 로 degrade → 콜러가 implicit-any 로 깨진다.
//   반드시 "실제 호출"의 타입을 참조해야 한다.
function realClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export function createClient(): ReturnType<typeof realClient> {
  // 데모(공유) 세션이면 실 DB 대신 스냅샷 백엔드 shim — 읽기는 스냅샷, 쓰기는 no-op.
  if (isDemoSession()) {
    return createDemoClient() as unknown as ReturnType<typeof realClient>
  }
  return realClient()
}
