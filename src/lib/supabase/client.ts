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

// 전역 공개 카탈로그(예: style_anchors) 읽기 전용 클라이언트 — 데모 세션에서도 실 anon DB 로
//   읽는다. 이런 테이블은 프로젝트/유저 데이터가 아니라 모두에게 동일한 참조 카탈로그(RLS off,
//   공개)라 스냅샷에 얼릴 대상이 아니다: 얼리면 공유 시점 값에 고정돼 카탈로그 갱신(새 프리뷰 등)이
//   기존 공유에 반영되지 않는다. 오직 공개 카탈로그 읽기에만 사용 — 프로젝트/유저 데이터엔 쓰지 말 것.
export function createCatalogClient(): ReturnType<typeof realClient> {
  return realClient()
}
