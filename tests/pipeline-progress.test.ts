import { describe, it, expect } from 'vitest'
import {
  writerRoughWork,
  artistImageWork,
  directorShotImageWork,
  directorVideoWork,
  queueWorks,
} from '@/lib/pipeline-progress'
import type { DirectorNode } from '@/types/director'

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

describe('artistImageWork', () => {
  const base = {
    imagesReady: false,
    stalled: false,
    failed: false,
    progress: { ready: 2, total: 5 },
    generatingCount: 0,
  }

  it('초기 잠금 구간: 서버 집계 ready/total 을 그대로 노출', () => {
    expect(artistImageWork(base)).toMatchObject({ done: 2, total: 5 })
  })

  it('stalled/failed 로 큐가 멈추면 "진행 중"이 아니므로 null', () => {
    expect(artistImageWork({ ...base, stalled: true })).toBeNull()
    expect(artistImageWork({ ...base, failed: true })).toBeNull()
  })

  it('잠금 해제 후엔 in-flight 재생성 개수로만 뜬다', () => {
    expect(artistImageWork({ ...base, imagesReady: true })).toBeNull()
    const work = artistImageWork({ ...base, imagesReady: true, generatingCount: 3 })
    expect(work?.label).toContain('3건')
    expect(work?.total).toBeUndefined()
  })
})

// 노드 타입 가드는 data.kind 만 본다 — 테스트는 최소 형태로 구성.
const node = (data: Record<string, unknown>) => ({ data }) as unknown as DirectorNode

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
    expect(work).toMatchObject({ done: 0, total: 2 })
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
    expect(directorShotImageWork(nodes, new Set(['sh_01']))).toMatchObject({ done: 1, total: 2 })
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
    expect(artistImageWork({ ...base, activeCount: 2 })?.label).toContain('2건')
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
