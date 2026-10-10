// 스토리보드 생성 한 판의 진행 표시는 판이 끝날 때까지 전체 수를 그대로 두고 완료 수를 이어 센다 (오너 요청 2026-10-10)
import { describe, expect, it } from 'vitest'
import { summarizeGenerationBatches, withStoryboardBacklog, type GenerationBatchRow } from '@/lib/generation-batches'
import { batchWorks } from '@/lib/pipeline-progress'

const T0 = Date.parse('2026-10-10T12:00:00Z')
const at = (sec: number) => new Date(T0 + sec * 1000).toISOString()

/** 판 run 의 실사 시트 작업 — units 샷, 낸 뒤 이 판에서 아직 낼 샷 remaining. doneSec 가 있으면 그때 끝났다. */
function sheet(id: string, o: { run?: string; units?: number; remaining?: number; createdSec: number; doneSec?: number; failed?: boolean }): GenerationBatchRow {
  const finished = o.doneSec !== undefined
  return {
    id,
    kind: 'storyboard_real_grid',
    status: finished ? (o.failed ? 'failed' : 'completed') : 'queued',
    target: {
      writerShotIds: Array.from({ length: o.units ?? 4 }, (_, i) => `${id}-${i}`),
      ...(o.run ? { batchRunId: o.run, batchRunRemaining: o.remaining ?? 0 } : {}),
    },
    created_at: at(o.createdSec),
    updated_at: at(o.doneSec ?? o.createdSec),
    completed_at: finished && !o.failed ? at(o.doneSec!) : null,
  }
}

/** 채팅 진행 표시 · Director 버튼이 보이는 "완료/전체" — 둘 다 같은 함수를 지난다. 표시가 없으면 null. */
function pin(rows: GenerationBatchRow[], nowSec: number, screenBacklog = 0): string | null {
  const lane = withStoryboardBacklog(summarizeGenerationBatches(rows, T0 + nowSec * 1000), screenBacklog)
    .find((b) => b.lane === 'director-storyboard')
  return lane ? `${lane.done}/${lane.total}` : null
}

// 806e2cc2 의 남은 66샷처럼: 요청마다 시트 2장(4샷씩), 시트 한 장은 100초 안팎.
const A = sheet('A', { run: 'R', remaining: 62, createdSec: 0, doneSec: 100 })
const B = sheet('B', { run: 'R', remaining: 58, createdSec: 6, doneSec: 110 })
const C = sheet('C', { run: 'R', remaining: 54, createdSec: 135 })
const D = sheet('D', { run: 'R', remaining: 50, createdSec: 141 })

describe('스토리보드 생성 한 판의 진행 표시', () => {
  it('한 판의 진행 표시는 2분이 지난 앞 시트까지 완료 수에 쌓는다', () => {
    // 왜: 도는 작업 기준 2분 안의 작업만 세서, 시트 2장씩 몇 분 간격으로 나가는 판은 다음 시트가 나갈 때마다 완료 수가 0으로 돌아갔다.
    expect(pin([A, B, C], 150)).toBe('8/66')
  })

  it('새 시트가 접수돼도 전체 수가 흔들리지 않는다', () => {
    // 왜: 화면이 남은 샷 수를 요청의 답을 받은 뒤에야 알아, 새 시트가 먼저 보이는 몇 초 동안 전체 수가 66 → 74 → 66 으로 튀었다.
    expect(pin([A, B, C], 138)).toBe('8/66')
    expect(pin([A, B, C, D], 144)).toBe('8/66')
  })

  it('시트와 시트 사이에 도는 작업이 잠깐 없어도, 아직 낼 샷이 남은 판은 진행 표시를 유지한다', () => {
    // 왜: 앞 시트가 끝나고 다음 시트가 접수되기까지 15~30초 동안 진행 표시가 사라졌다가 다시 나타났다.
    expect(pin([A, B], 125)).toBe('8/66')
  })

  it('실패한 시트는 완료 수에 넣지 않고 따로 세며, 전체 수에는 그대로 남는다', () => {
    // 왜: 한 판 안에서도 실패는 "실패 n"으로 따로 보이고, 전체 수는 실패한 시트까지 판 전체를 센다.
    const failedA = sheet('A', { run: 'R', remaining: 62, createdSec: 0, doneSec: 100, failed: true })
    const lane = withStoryboardBacklog(summarizeGenerationBatches([failedA, B, C], T0 + 150_000), 0).find((b) => b.lane === 'director-storyboard')
    expect(lane).toMatchObject({ done: 4, failed: 4, total: 66 })
    expect(batchWorks(lane ? [lane] : [], 'ko')[0]).toMatchObject({ done: 4, total: 66, failed: 4 })
  })

  it('판이 다 끝나면(낼 샷도 도는 작업도 없으면) 진행 표시가 사라진다', () => {
    // 정상 경로 고정 — 마지막 시트는 남은 샷 0을 적어 둔다.
    const last1 = sheet('Y', { run: 'R', remaining: 4, createdSec: 0, doneSec: 100 })
    const last2 = sheet('Z', { run: 'R', remaining: 0, createdSec: 6, doneSec: 110 })
    expect(pin([last1, last2], 115)).toBeNull()
  })

  it('판이 멈추고 2분 넘게 아무 작업이 없으면 남은 샷이 있어도 진행 표시를 내린다', () => {
    // 왜: 탭을 닫거나 판이 실패로 멈추면 남은 샷은 나가지 않는다 — 진행 표시가 그대로 남아 있으면 안 된다.
    expect(pin([A, B], 110 + 121)).toBeNull()
  })

  it('앞서 누른 다른 판의 시트는 이번 판의 숫자에 섞이지 않는다', () => {
    // 왜: 판이 끝나자마자 다시 누르면(실패한 샷 다시 그리기) 앞 판의 시트가 2분 창에 들어와 숫자가 섞였다.
    const earlier = sheet('X', { run: 'R0', remaining: 0, createdSec: 0, doneSec: 90 })
    const now = sheet('Y', { run: 'R1', remaining: 20, createdSec: 100 })
    expect(pin([earlier, now], 110)).toBe('0/24')
  })

  it('진행 표시는 서버가 센 판의 남은 샷 수를 쓰고, 화면이 아는 남은 수를 한 번 더 더하지 않는다', () => {
    // 왜: 채팅 진행 표시와 Director 버튼은 화면이 아는 남은 수를 더해 왔다 — 서버가 이미 세면 두 번 더해진다.
    expect(pin([A, B, C], 150, 58)).toBe('8/66')
  })
})
