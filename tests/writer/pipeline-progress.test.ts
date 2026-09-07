// 진행 중인 작업은 정확한 수와 담당자를 보여주고, 끝나면 알림을 숨긴다
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
  it('진행 중인 장면이 하나도 없으면 진행 알림을 보여주지 않는다', () => {
    expect(writerRoughWork([])).toBeNull()
    expect(writerRoughWork([roughShot('completed'), roughShot('completed')])).toBeNull()
  })

  it('진행 중인 장면이 있으면 완료·전체·실패 수를 정확히 보여준다', () => {
    const work = writerRoughWork([
      roughShot('completed'),
      roughShot('generating'),
      roughShot('failed'),
      roughShot(null),
    ])
    expect(work).toMatchObject({ done: 1, total: 4, failed: 1 })
  })

  it('장면 설명이 없으면 진행 대상에서 제외한다', () => {
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

  it('Writer 작업이 진행 중이면 완료 수와 전체 수를 담은 알림을 보여준다', () => {
    const work = writerPipelineWork(base, 'ko')
    expect(work).not.toBeNull()
    expect(work?.key).toBe('writer-pipeline')
    expect(work).toMatchObject({ done: 4, total: 14, stage: 'writer' })
  })

  it('사용자 확인을 기다리는 동안에는 진행 중이라는 알림을 보여주지 않는다', () => {
    expect(writerPipelineWork({ ...base, current_status: 'awaiting_confirmation' }, 'ko')).toBeNull()
  })

  it('상태가 없거나 작업이 끝났거나 실패했거나 시작되지 않았으면 진행 알림을 보여주지 않는다', () => {
    expect(writerPipelineWork({ ...base, pipeline_completed: true }, 'ko')).toBeNull()
    expect(writerPipelineWork({ ...base, pipeline_failed: true }, 'ko')).toBeNull()
    expect(writerPipelineWork({ ...base, started: false }, 'ko')).toBeNull()
    expect(writerPipelineWork(null, 'ko')).toBeNull()
  })

  it('전체 작업 수를 알 수 없으면 숫자 대신 진행 중임만 보여준다', () => {
    const work = writerPipelineWork({ ...base, total_units: 0, completed_units: 0 }, 'ko')
    expect(work).not.toBeNull()
    expect(work?.done).toBeUndefined()
    expect(work?.total).toBeUndefined()
  })
})

describe('다시 만든 작업의 진행 알림', () => {
  it('Writer의 새 그림은 이전에 끝난 장면을 제외하고 현재 작업만 합산한다', () => {
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

  it('Director의 장면 그림도 이전 작업을 제외하고 현재 작업만 합산한다', () => {
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

  it('Director 영상도 이전에 끝난 장면을 새 작업에 섞지 않는다', () => {
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

  it('초기 안내가 끝나기 전에는 작업이 있으면 준비된 수와 전체 수를 보여준다', () => {
    expect(artistImageWork({ ...base, activeCount: 3 })).toMatchObject({ done: 2, total: 5 })
    expect(artistImageWork({ ...base, generatingCount: 1 })).toMatchObject({ done: 2, total: 5 })
  })

  it('아직 끝나지 않은 프로젝트라도 작업이 없으면 "생성 중" 알림을 보여주지 않는다 (D13)', () => {
    // 2026-08-31 오너 실측: 생성이 끝났거나 시작된 적도 없는 프로젝트에서
    //   "Concept Artist가 생성하고 있습니다 0/N"이 영원히 떠 있었다.
    expect(artistImageWork(base)).toBeNull()
    expect(artistImageWork({ ...base, progress: { ready: 0, total: 8 } })).toBeNull()
  })

  it('작업이 멈추거나 실패하면 "진행 중" 알림을 보여주지 않는다', () => {
    expect(artistImageWork({ ...base, stalled: true })).toBeNull()
    expect(artistImageWork({ ...base, failed: true })).toBeNull()
  })

  it('초기 안내가 끝난 뒤에는 다시 만드는 작업 수만 진행 알림에 보여준다', () => {
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
  it('진행 중인 장면이 없으면 진행 알림을 보여주지 않는다', () => {
    expect(directorShotImageWork([])).toBeNull()
    expect(
      directorShotImageWork([
        node({ kind: 'shot', storyboardImage: { status: 'completed' } }),
      ]),
    ).toBeNull()
  })

  it('진행 중인 장면만 세어 완료 수와 전체 수를 보여주고 다른 작업은 제외한다', () => {
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
  it('진행 중인 영상이 있을 때만 완료·전체·실패 수를 보여준다', () => {
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

describe('떠났다가 돌아와도 진행 알림을 이어간다', () => {
  it('러프 그림이 아직 없어도 처리할 작업이 있으면 진행 중으로 알려준다', () => {
    const shots = [
      { shotId: 'sh_01', actionDescription: '달린다', roughStoryboard: null },
      { shotId: 'sh_02', actionDescription: '멈춘다', roughStoryboard: null },
    ]
    expect(writerRoughWork(shots)).toBeNull()
    const work = writerRoughWork(shots, new Set(['sh_01']))
    expect(work).toMatchObject({ done: 0, total: 1 })
  })

  it('러프 그림 작업이 모두 끝나면 진행 알림이 사라진다', () => {
    const shots = [
      { shotId: 'sh_01', actionDescription: '달린다', roughStoryboard: { status: 'completed' } },
    ]
    expect(writerRoughWork(shots, new Set())).toBeNull()
  })

  it('Director 장면 그림이 아직 없어도 처리할 장면이 있으면 진행 중으로 알려준다', () => {
    const nodes = [
      node({ kind: 'shot', writerShotId: 'sh_01', storyboardImage: null }),
      node({ kind: 'shot', writerShotId: 'sh_02', storyboardImage: { status: 'completed' } }),
    ]
    expect(directorShotImageWork(nodes)).toBeNull()
    expect(directorShotImageWork(nodes, new Set(['sh_01']))).toMatchObject({ done: 0, total: 1 })
  })

  it('Director 영상이 아직 표시되지 않아도 처리할 영상 수를 진행 알림에 보여준다', () => {
    expect(directorVideoWork([], 0)).toBeNull()
    expect(directorVideoWork([], 2)).toMatchObject({ done: 0, total: 2 })
  })

  it('Artist 화면에 작업이 없어도 처리할 그림이 있으면 진행 중으로 알려준다', () => {
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
describe('directorShotImageWork — 남은 작업까지 합쳐 전체 진행을 보여준다 (#batch-backlog)', () => {
  const gen = (id: string) =>
    node({ kind: 'shot', writerShotId: id, storyboardImage: { status: 'generating' } }, `n-${id}`)
  const done = (id: string) =>
    node({ kind: 'shot', writerShotId: id, storyboardImage: { status: 'completed' } }, `n-${id}`)

  it('여러 장면을 나눠 처리해도 진행 알림의 전체 수가 끝까지 유지된다', () => {
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

  it('한 장면만 다시 만들 때는 기존처럼 진행 알림을 보여준다', () => {
    expect(directorShotImageWork([gen('x')], new Set(['x']), 'ko')).toMatchObject({
      done: 0,
      total: 1,
    })
  })
})

describe('queueWorks — 다른 화면에서도 진행 알림을 보여준다', () => {
  it('처리할 작업이 없는 종류는 진행 알림을 만들지 않는다', () => {
    expect(queueWorks({ shot_video: 0, character_view: 0 })).toEqual([])
  })

  it('종류마다 담당자 이름과 알맞은 색으로 진행 알림을 보여준다', () => {
    const works = queueWorks({ character_view: 2, shot_video: 1 })
    expect(works).toHaveLength(2)
    expect(works[0]).toMatchObject({ stage: 'artist', total: 2 })
    expect(works[0].label).toContain('Concept Artist')
    expect(works[1]).toMatchObject({ stage: 'director', total: 1 })
    expect(works[1].label).toContain('Director')
  })
})
