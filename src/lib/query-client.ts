import { isServer, QueryCache, QueryClient } from '@tanstack/react-query'

/**
 * 서버 데이터 캐시(TanStack Query)의 단일 인스턴스.
 *
 * 왜 모듈 싱글턴인가: 드래그·드롭 핸들러처럼 훅을 못 쓰는 자리(BaseNode 드롭,
 * 팝업의 저장 버튼)가 캐시를 직접 읽고 써야 한다. Provider 를 통해서만 접근하게
 * 하면 그 자리들이 캐시 밖에 남고, 결국 zustand 시절처럼 사본이 갈린다.
 *
 * 서버에서는 요청마다 새로 만든다(공식 패턴) — 모듈 싱글턴을 서버에서 공유하면
 * 사용자 A 의 데이터가 B 의 렌더에 새어 들어갈 수 있다. 브라우저에서는 하나를
 * 재사용해야 화면 전환에도 캐시가 살아남는다.
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      // v5 는 useQuery 단위 onError 가 없다 — 실패 로그는 여기서 한 곳으로.
      onError: (error, query) => {
        console.warn('[query]', query.queryKey, error instanceof Error ? error.message : error)
      },
    }),
    defaultOptions: {
      queries: {
        // 기본 0초(마운트마다 재조회)는 캐시를 켠 의미가 없다 — 30초를 바닥으로.
        // 데이터 성격별 상향(프리셋 5분 등)은 각 질의가 정한다.
        staleTime: 30_000,
        // 옛 store 들은 실패를 warn 하고 빈 목록으로 뒀다(재시도 없음). 기본 3회
        // 재시도는 그 대비 새 동작이라, 파이 단위 전환 동안은 끈다.
        retry: false,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient()
  browserQueryClient ??= makeQueryClient()
  return browserQueryClient
}
