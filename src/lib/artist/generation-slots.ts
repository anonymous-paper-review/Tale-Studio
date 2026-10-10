// Artist 그림을 동시에 몇 장 만들지 — 러프 스토리보드 우선의 가변 규칙 (2026-10-09 오너).
//
// 7월 15일(#c1)부터 Artist 는 한 장씩만 보냈다: 턴어라운드(장당 1~2분)가 동시에 여럿이면 유저 그림 상한과
//   fal 자리를 오래 잡아 러프 스토리보드 첫 일괄 생성이 밀렸다. 그 이유는 러프가 돌 때만 성립한다 —
//   그래서 그 유저의 러프 스토리보드가 만들어지는 중이면 1장, 없거나 끝났으면 3장까지 연다.
//   gpt-image-2(장당 75~80초)로 바뀐 뒤 한 장씩이면 인물 11명 · 배경 7곳에 25분이 걸렸다(10/9 운영 재시험).
//
// 러프가 도는지는 서버 창구(/api/artist/generation-slots)가 유저 단위로 센다 — 30분 넘게 멈춘 대기 작업은 빼고
//   (쿼터 집계와 같은 기준). 확인이 실패하면 예전 규칙(1장)으로 돌아간다. 서버의 유저당 그림 상한(6)은 그대로다.
//
// 이 파일은 클라이언트와 서버가 함께 쓴다 — 서버 전용 모듈을 들이지 않는다.

/** 러프 스토리보드가 만들어지는 동안 Artist 가 동시에 보내는 장수. */
export const ARTIST_SLOTS_WHILE_ROUGH = 1
/** 러프 스토리보드가 없거나 끝났을 때 Artist 가 동시에 보내는 장수. */
export const ARTIST_SLOTS_IDLE = 3
/** 보내는 도중 자리 수를 다시 확인하는 간격 — 러프가 끝나면 늦어도 이만큼 뒤에 늘린다. */
export const ARTIST_SLOT_RECHECK_MS = 15_000

/** 진행 중인 러프 스토리보드 작업 수 → Artist 동시 장수. 모르면(null) 러프 우선 쪽으로 본다. */
export function artistGenerationLimit(activeRoughJobs: number | null): number {
  if (activeRoughJobs === null || !Number.isFinite(activeRoughJobs)) return ARTIST_SLOTS_WHILE_ROUGH
  return activeRoughJobs > 0 ? ARTIST_SLOTS_WHILE_ROUGH : ARTIST_SLOTS_IDLE
}

/** 화면에서 지금 열 수 있는 Artist 자리 수를 묻는다. 실패 · 이상한 값이면 1. */
export async function fetchArtistGenerationLimit(fetchImpl: typeof fetch = fetch): Promise<number> {
  try {
    const res = await fetchImpl('/api/artist/generation-slots', { cache: 'no-store' })
    if (!res.ok) return ARTIST_SLOTS_WHILE_ROUGH
    const body = (await res.json()) as { limit?: unknown }
    if (typeof body.limit !== 'number' || !Number.isFinite(body.limit) || body.limit < 1) return ARTIST_SLOTS_WHILE_ROUGH
    return Math.min(Math.floor(body.limit), ARTIST_SLOTS_IDLE)
  } catch {
    return ARTIST_SLOTS_WHILE_ROUGH
  }
}

async function safeLimit(getLimit: () => Promise<number>): Promise<number> {
  try {
    const n = await getLimit()
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : ARTIST_SLOTS_WHILE_ROUGH
  } catch {
    return ARTIST_SLOTS_WHILE_ROUGH
  }
}

/**
 * 자리 수가 오르내리는 작업 풀. 새 작업을 보내기 전마다 getLimit 으로 자리 수를 다시 확인하고,
 *   기다리는 동안에도 recheckMs 마다 확인해 자리가 늘면 바로 더 보낸다. 자리가 줄면 이미 보낸 작업은
 *   그대로 두고 새로 보내는 것만 멈춘다. 작업 하나가 실패해도 나머지는 끝까지 보내고, 첫 실패를 마지막에 던진다.
 */
export async function runAdaptivePool(
  tasks: Array<() => Promise<void>>,
  getLimit: () => Promise<number>,
  opts: { recheckMs?: number; wait?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const recheckMs = opts.recheckMs ?? ARTIST_SLOT_RECHECK_MS
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const inflight = new Set<Promise<void>>()
  let cursor = 0
  let failed = false
  let firstError: unknown
  while (cursor < tasks.length) {
    const limit = await safeLimit(getLimit)
    while (cursor < tasks.length && inflight.size < limit) {
      const task = tasks[cursor++]
      const running: Promise<void> = (async () => {
        try {
          await task()
        } catch (error) {
          if (!failed) {
            failed = true
            firstError = error
          }
        }
      })()
      inflight.add(running)
      void running.then(() => inflight.delete(running))
    }
    if (cursor >= tasks.length) break
    await Promise.race([...inflight, wait(recheckMs)])
  }
  await Promise.all(inflight)
  if (failed) throw firstError
}
