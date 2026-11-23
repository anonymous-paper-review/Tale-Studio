// _video-submit.ts — 영상 제출 준비(video-submit) 테스트 공용 부품: 요청 · DB 조회 흉내 · 그림 주소.
//   `_` 접두라 vitest 가 테스트로 집어가지 않는다. vi.mock 은 각 테스트 파일에 둔다(파일마다 끌어올려야 한다).
import { vi } from 'vitest'
import { mediaPublicUrl } from '@/lib/storage/media-url'

export const IDEMPOTENCY_KEY = '123e4567-e89b-12d3-a456-426614174000'
export const WORKSPACE = 'workspace-1'
export const PROJECT = 'project-1'

/** 우리 보관함 주소(테스트 환경 접두사) — 서버가 "우리 그림"으로 인정하는 꼴. */
export const media = (path: string) => mediaPublicUrl(path)

export const START = media(`${WORKSPACE}/${PROJECT}/storyboard/shot-2_start.png`)
export const REAL_DIRECTION = media(`${WORKSPACE}/${PROJECT}/storyboard/shot-2_direction.png`)
export const END = media(`${WORKSPACE}/${PROJECT}/storyboard/shot-2_end.png`)
export const ROUGH_DIRECTION = media(`${WORKSPACE}/${PROJECT}/rough/shot-2_direction.png`)
export const ROUGH_GENERATED_AT = 1763800000000

export const STORYBOARD = {
  url: START,
  frames: { start: START, direction: REAL_DIRECTION, end: END },
  status: 'completed',
  errorMessage: null,
  generatedAt: 1763700000000,
}

export const ROUGH = {
  status: 'completed',
  generatedAt: ROUGH_GENERATED_AT,
  frames: {
    start: media(`${WORKSPACE}/${PROJECT}/rough/shot-2_start.png`),
    direction: ROUGH_DIRECTION,
    end: media(`${WORKSPACE}/${PROJECT}/rough/shot-2_end.png`),
  },
}

/** 화면이 보내는 영상 요청 몸 — 샷 shot-2, Director 화면처럼 프레임 출처를 늘 보낸다. */
export function videoRequest(extra: Record<string, unknown> = {}) {
  return new Request('http://test/api/director/generate-video', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId: PROJECT,
      shotId: 'shot-2',
      prompt: 'A quiet harbor at dawn',
      idempotencyKey: IDEMPOTENCY_KEY,
      frameSource: 'auto',
      ...extra,
    }),
  })
}

/**
 * supabase 조회 흉내 — 어떤 걸러내기를 이어 불러도 같은 사슬을 돌려주고, 끝(maybeSingle · single · await)에서 data 를 준다.
 *   calls 에 부른 이름과 인자가 쌓인다(무엇으로 걸렀는지 확인할 때).
 */
export function chain(data: unknown) {
  const result = { data, error: null }
  const calls: Array<[string, unknown[]]> = []
  const target: Record<string, unknown> = {
    calls,
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
    then: (resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  }
  const proxy: Record<string, unknown> = new Proxy(target, {
    get(obj, prop: string) {
      if (prop in obj) return obj[prop]
      return (...args: unknown[]) => {
        calls.push([prop, args])
        return proxy
      }
    },
  })
  return proxy
}

/** 표 이름별로 돌려줄 행 — 같은 표를 여러 번 부르면 배열 순서대로, 다 쓰면 마지막 것을 계속 준다. */
export function tablesFrom(tables: Record<string, unknown[]>) {
  const used = new Map<string, number>()
  return (table: string) => {
    const rows = tables[table]
    if (!rows || rows.length === 0) return chain(null)
    const index = used.get(table) ?? 0
    used.set(table, index + 1)
    return chain(rows[Math.min(index, rows.length - 1)])
  }
}
