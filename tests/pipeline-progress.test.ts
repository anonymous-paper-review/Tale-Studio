import { beforeEach, describe, it, expect } from 'vitest'
import {
  writerPipelineWork,
  writerRoughWork,
  artistImageWork,
  directorShotImageWork,
  directorVideoWork,
  queueWorks,
  resetPipelineProgressBatches,
} from '@/lib/pipeline-progress'
import type { DirectorNode } from '@/types/director'

beforeEach(() => {
  resetPipelineProgressBatches()
})

// #chat-progress-pin — 채팅 상단 고정 진행도의 파생 규칙.
// 핵심 계약: "생성 중(generating)이 하나라도 있을 때만" 핀이 뜬다 — 완료/실패만 남으면 null
// (핀 해제 → 온보딩/완료 브리핑이 그 자리를 잇는다).

const roughShot = (status: string | null, action = '달린다') => ({
  actionDescription: action,
  roughStoryboard: status ? { status } : null,
})

describe('writerRoughWork', () => {
  it('생성 중 패널이 없으면 null (전부 완료 = 핀 해제)', () => {
    expect(writerRoughWork([])).toBeNull()
    expect(writerRoughWork([roughShot('completed'), roughShot('completed')])).toBeNull()
  })

  it('생성 중이면 완료/전체/실패 개수를 파생한다', () => {
    const work = writerRoughWork([
      roughShot('completed'),
      roughShot('generating'),
      roughShot('failed'),
      roughShot(null),
    ])
    expect(work).toMatchObject({ done: 1, total: 4, failed: 1 })
  })

  it('액션 없는 샷은 생성 자격이 없어 분모에서 빠진다', () => {
    const work = writerRoughWork([
      roughShot('generating'),
      roughShot(null, ''),
      roughShot(null, '  '),
    ])
    expect(work).toMatchObject({ done: 0, total: 1 })
  })
})

// #fix-scene-gate-suggestion-resurface (2026-08-25) — 확정 대기(awaiting_confirmation)는
//   "생성 중"이 아니다. 이 상태에서 진행 핀이 남으면 오너가 생성이 계속되는 줄 오해한다.
describe('writerPipelineWork', () => {
  const base = {
    started: true,
    pipeline_completed: false,
    pipeline_failed: false,
    current_status: 'running',
    current_stage: 'scenes',
    completed_units: 4,
    total_units: 14,
  }

  it('생성 중이면 done/total 을 담은 진행 핀을 세운다', () => {
    const work = writerPipelineWork(base, 'ko')
    expect(work).not.toBeNull()
    expect(work?.key).toBe('writer-pipeline')
    expect(work).toMatchObject({ done: 4, total: 14, stage: 'writer' })
  })

  it('확정 대기(awaiting_confirmation)면 핀을 안 세운다 — 정지 상태라 가짜 진행 문구 금지', () => {
    expect(writerPipelineWork({ ...base, current_status: 'awaiting_confirmation' }, 'ko')).toBeNull()
  })

  it('완료·실패·미시작·null 은 핀이 없다', () => {
    expect(writerPipelineWork({ ...base, pipeline_completed: true }, 'ko')).toBeNull()
    expect(writerPipelineWork({ ...base, pipeline_failed: true }, 'ko')).toBeNull()
    expect(writerPipelineWork({ ...base, started: false }, 'ko')).toBeNull()
    expect(writerPipelineWork(null, 'ko')).toBeNull()
  })

  it('total_units 가 0 이면 분수를 숨긴다(스피너만)', () => {
    const work = writerPipelineWork({ ...base, total_units: 0, completed_units: 0 }, 'ko')
    expect(work).not.toBeNull()
    expect(work?.done).toBeUndefined()
    expect(work?.total).toBeUndefined()
  })
})

describe('재생성 묶음별 진행 수', () => {
  it('writer 러프는 이전 완료 샷을 제외하고 진행 중 묶음에만 합산한다', () => {
    const old = {
      shotId: 'old',
      actionDescription: '이미 끝남',
      roughStoryboard: { status: 'completed' },
    }
    const first = {
      shotId: 'first',
      actionDescription: '첫 작업',
      roughStoryboard: { status: 'generating' },
    }
    const second = {
      shotId: 'second',
      actionDescription: '두 번째 작업',
      roughStoryboard: { status: 'generating' },
    }

    expect(writerRoughWork([old, first])).toMatchObject({ done: 0, total: 1 })
    expect(writerRoughWork([old, first, second])).toMatchObject({ done: 0, total: 2 })
    expect(
      writerRoughWork([
        old,
        { ...first, roughStoryboard: { status: 'completed' } },
        second,
      ]),
    ).toMatchObject({ done: 1, total: 2 })
    expect(
      writerRoughWork([
        old,
        { ...first, roughStoryboard: { status: 'completed' } },
        { ...second, roughStoryboard: { status: 'completed' } },
      ]),
    ).toBeNull()
    expect(
      writerRoughWork([
        old,
        { ...first, roughStoryboard: { status: 'completed' } },
        { ...second, roughStoryboard: { status: 'generating' } },
      ]),
    ).toMatchObject({ done: 0, total: 1 })
  })

  it('director 촬영용 그림도 같은 묶음 규칙을 쓴다', () => {
    const old = node(
      { kind: 'shot', writerShotId: 'old', storyboardImage: { status: 'completed' } },
      'node-old',
    )
    const first = node(
      { kind: 'shot', writerShotId: 'first', storyboardImage: { status: 'generating' } },
      'node-first',
    )
    const second = node(
      { kind: 'shot', writerShotId: 'second', storyboardImage: { status: 'generating' } },
      'node-second',
    )

    expect(directorShotImageWork([old, first])).toMatchObject({ done: 0, total: 1 })
    expect(directorShotImageWork([old, first, second])).toMatchObject({ done: 0, total: 2 })
    expect(
      directorShotImageWork([
        old,
        node(
          { kind: 'shot', writerShotId: 'first', storyboardImage: { status: 'completed' } },
          'node-first',
        ),
        second,
      ]),
    ).toMatchObject({ done: 1, total: 2 })
    expect(
      directorShotImageWork([
        old,
        node(
          { kind: 'shot', writerShotId: 'first', storyboardImage: { status: 'completed' } },
          'node-first',
        ),
        node(
          { kind: 'shot', writerShotId: 'second', storyboardImage: { status: 'completed' } },
          'node-second',
        ),
      ]),
    ).toBeNull()
    expect(
      directorShotImageWork([
        old,
        node(
          { kind: 'shot', writerShotId: 'first', storyboardImage: { status: 'completed' } },
          'node-first',
        ),
        node(
          { kind: 'shot', writerShotId: 'second', storyboardImage: { status: 'generating' } },
          'node-second',
        ),
      ]),
    ).toMatchObject({ done: 0, total: 1 })
  })

  it('director 영상도 기존 완료 take를 새 묶음에 섞지 않는다', () => {
    const old = node(
      { kind: 'video', status: 'completed', lastAttemptStatus: null },
      'video-old',
    )
    const first = node(
      { kind: 'video', status: 'generating', lastAttemptStatus: 'generating' },
      'video-first',
    )
    const second = node(
      { kind: 'video', status: 'generating', lastAttemptStatus: 'generating' },
      'video-second',
    )

    expect(directorVideoWork([old, first])).toMatchObject({ done: 0, total: 1 })
    expect(directorVideoWork([old, first, second])).toMatchObject({ done: 0, total: 2 })
    expect(
      directorVideoWork([
        old,
        node(
          { kind: 'video', status: 'completed', lastAttemptStatus: 'completed' },
          'video-first',
        ),
        second,
      ]),
    ).toMatchObject({ done: 1, total: 2 })
    expect(
      directorVideoWork([
        old,
        node(
          { kind: 'video', status: 'completed', lastAttemptStatus: 'completed' },
          'video-first',
        ),
        node(
          { kind: 'video', status: 'completed', lastAttemptStatus: 'completed' },
          'video-second',
        ),
      ]),
    ).toBeNull()
    expect(
      directorVideoWork([
        old,
        node(
          { kind: 'video', status: 'completed', lastAttemptStatus: 'completed' },
          'video-first',
        ),
        node(
          { kind: 'video', status: 'generating', lastAttemptStatus: 'generating' },
          'video-second',
        ),
      ]),
    ).toMatchObject({ done: 0, total: 1 })
  })
})

describe('artistImageWork', () => {
  const base = {
    imagesReady: false,
    stalled: false,
    failed: false,
    progress: { ready: 2, total: 5 },
    generatingCount: 0,
  }

  it('초기 잠금 구간: 활동 증거(큐 또는 in-flight)가 있을 때 서버 집계 ready/total 노출', () => {
    expect(artistImageWork({ ...base, activeCount: 3 })).toMatchObject({ done: 2, total: 5 })
    expect(artistImageWork({ ...base, generatingCount: 1 })).toMatchObject({ done: 2, total: 5 })
  })

  it('D13: 아무것도 안 돌면 미완성 프로젝트여도 "생성 중" 핀을 세우지 않는다 (0/N 상시 고착 수리)', () => {
    // 2026-08-31 오너 실측: 생성이 끝났거나 시작된 적도 없는 프로젝트에서
    //   "Concept Artist가 생성하고 있습니다 0/N"이 영원히 떠 있었다.
    expect(artistImageWork(base)).toBeNull()
    expect(artistImageWork({ ...base, progress: { ready: 0, total: 8 } })).toBeNull()
  })

  it('stalled/failed 로 큐가 멈추면 "진행 중"이 아니므로 null', () => {
    expect(artistImageWork({ ...base, stalled: true })).toBeNull()
    expect(artistImageWork({ ...base, failed: true })).toBeNull()
  })

  it('잠금 해제 후엔 in-flight 재생성 개수로만 뜬다', () => {
    expect(artistImageWork({ ...base, imagesReady: true })).toBeNull()
    const work = artistImageWork({ ...base, imagesReady: true, generatingCount: 3 })
    // 문구 형식 통일(2026-08-12): "…가 이미지를 생성하고 있습니다 0/N"
    expect(work?.label).toContain('이미지를 생성하고 있습니다')
    expect(work).toMatchObject({ done: 0, total: 3 })
  })
})

// 노드 타입 가드는 data.kind 만 본다 — 테스트는 최소 형태로 구성.
const node = (data: Record<string, unknown>, id?: string) =>
  ({ ...(id ? { id } : {}), data }) as unknown as DirectorNode

describe('directorShotImageWork', () => {
  it('생성 중 샷이 없으면 null', () => {
    expect(directorShotImageWork([])).toBeNull()
    expect(
      directorShotImageWork([
        node({ kind: 'shot', storyboardImage: { status: 'completed' } }),
      ]),
    ).toBeNull()
  })

  it('생성 중이면 샷 노드만 세어 완료/전체를 파생 (다른 노드 무시)', () => {
    const work = directorShotImageWork([
      node({ kind: 'shot', storyboardImage: { status: 'completed' } }),
      node({ kind: 'shot', storyboardImage: { status: 'generating' } }),
      node({ kind: 'shot', storyboardImage: null }),
      node({ kind: 'scene' }),
      node({ kind: 'video', status: 'generating' }),
    ])
    expect(work).toMatchObject({ done: 1, total: 3 })
    expect(work?.failed).toBeUndefined()
  })
})

describe('directorVideoWork', () => {
  it('생성 중 비디오 노드가 있을 때만 완료/전체/실패를 파생', () => {
    expect(directorVideoWork([node({ kind: 'video', status: 'completed' })])).toBeNull()
    const work = directorVideoWork([
      node({ kind: 'video', status: 'generating' }),
      node({ kind: 'video', status: 'completed' }),
      node({ kind: 'video', status: 'failed' }),
      node({ kind: 'shot', storyboardImage: { status: 'generating' } }),
    ])
    expect(work).toMatchObject({ done: 1, total: 3, failed: 1 })
  })
})

// #queue-restore 2026-08-11 — 탭을 떠났다 오면 화면 상태(컴포넌트 로컬 panelJobs, DB 재수화로
//   덮이는 director storyboardImage)는 "생성 중"을 잊는다. 큐(queued 잡)가 판정의 바닥이라는 계약.

describe('큐 기반 진행 복원', () => {
  it('러프: 화면 상태가 전부 미생성이어도 큐에 잡이 있으면 진행 중으로 뜬다', () => {
    const shots = [
      { shotId: 'sh_01', actionDescription: '달린다', roughStoryboard: null },
      { shotId: 'sh_02', actionDescription: '멈춘다', roughStoryboard: null },
    ]
    expect(writerRoughWork(shots)).toBeNull()
    const work = writerRoughWork(shots, new Set(['sh_01']))
    expect(work).toMatchObject({ done: 0, total: 1 })
  })

  it('러프: 큐가 비면 다시 null (완료 후 알림바가 스스로 사라진다)', () => {
    const shots = [
      { shotId: 'sh_01', actionDescription: '달린다', roughStoryboard: { status: 'completed' } },
    ]
    expect(writerRoughWork(shots, new Set())).toBeNull()
  })

  it('director 실사: 큐의 writerShotId 로 생성 중을 복원한다', () => {
    const nodes = [
      node({ kind: 'shot', writerShotId: 'sh_01', storyboardImage: null }),
      node({ kind: 'shot', writerShotId: 'sh_02', storyboardImage: { status: 'completed' } }),
    ]
    expect(directorShotImageWork(nodes)).toBeNull()
    expect(directorShotImageWork(nodes, new Set(['sh_01']))).toMatchObject({ done: 0, total: 1 })
  })

  it('director 영상: 노드가 아직 없어도 큐 개수만으로 알림바를 세운다', () => {
    expect(directorVideoWork([], 0)).toBeNull()
    expect(directorVideoWork([], 2)).toMatchObject({ done: 0, total: 2 })
  })

  it('artist: store in-flight 가 비어도 큐 개수가 있으면 진행 중', () => {
    const base = {
      imagesReady: true,
      stalled: false,
      failed: false,
      progress: null,
      generatingCount: 0,
    }
    expect(artistImageWork(base)).toBeNull()
    expect(artistImageWork({ ...base, activeCount: 2 })).toMatchObject({ done: 0, total: 2 })
  })
})

// #batch-backlog 2026-08-25 — 일괄 실사 생성은 라운드제(서버가 몇 시트씩 fal 에 제출하고
//   remaining 을 반환)라서, fal 에 앉은 잡만 세면 분모가 "현재 라운드"로 쪼그라든다(오너:
//   "전체 갯수가 fal api queue 갯수만 보이는데"). 러너가 흘려주는 잔량(queuedBacklog)을
//   분모에 합산하고, 라운드 사이(제출 잡 0개)에도 알림바가 사라지지 않아야 한다.
describe('directorShotImageWork — 서버 대기 잔량(#batch-backlog)', () => {
  const gen = (id: string) =>
    node({ kind: 'shot', writerShotId: id, storyboardImage: { status: 'generating' } }, `n-${id}`)
  const done = (id: string) =>
    node({ kind: 'shot', writerShotId: id, storyboardImage: { status: 'completed' } }, `n-${id}`)

  it('배치 전 구간에서 분모가 전체 작업량(제출분+잔량)으로 유지된다', () => {
    const abcd = ['a', 'b', 'c', 'd']
    const efgh = ['e', 'f', 'g', 'h']

    // 1라운드: 4샷 제출 + 서버 잔량 10 → 4/14 가 아니라 0/14 에서 시작
    expect(
      directorShotImageWork(abcd.map(gen), new Set(abcd), 'ko', 10),
    ).toMatchObject({ done: 0, total: 14 })

    // 라운드 사이: 제출분 완료·fal 큐 텅 빔 — 잔량이 있으면 핀이 죽지 않는다
    expect(
      directorShotImageWork(abcd.map(done), new Set(), 'ko', 10),
    ).toMatchObject({ done: 4, total: 14 })

    // 2라운드: 다음 4샷 제출, 잔량 6 — 총량 불변
    expect(
      directorShotImageWork([...abcd.map(done), ...efgh.map(gen)], new Set(efgh), 'ko', 6),
    ).toMatchObject({ done: 4, total: 14 })

    // 종료: 잔량 0·큐 빔 → 핀 해제
    expect(
      directorShotImageWork([...abcd, ...efgh].map(done), new Set(), 'ko', 0),
    ).toBeNull()
  })

  it('잔량 없이(단건 재생성 경로) 쓰면 종전 동작 그대로다', () => {
    expect(directorShotImageWork([gen('x')], new Set(['x']), 'ko')).toMatchObject({
      done: 0,
      total: 1,
    })
  })
})

describe('queueWorks — 전용 화면이 없는 탭의 알림바', () => {
  it('0건인 종류는 줄을 만들지 않는다', () => {
    expect(queueWorks({ shot_video: 0, character_view: 0 })).toEqual([])
  })

  it('종류별로 담당 에이전트 이름과 색(stage)을 붙여 세운다', () => {
    const works = queueWorks({ character_view: 2, shot_video: 1 })
    expect(works).toHaveLength(2)
    expect(works[0]).toMatchObject({ stage: 'artist', total: 2 })
    expect(works[0].label).toContain('Concept Artist')
    expect(works[1]).toMatchObject({ stage: 'director', total: 1 })
    expect(works[1].label).toContain('Director')
  })
})
