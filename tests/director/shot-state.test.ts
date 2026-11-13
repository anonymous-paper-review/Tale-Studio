// Director 샷 하나가 지금 어느 상태인지(이미지 필요 · 만드는 중 · 완료 · 영상 만드는 중 · 완성 · 실패)와 상태 고르기 · 상태 색 (시안 R 416:4941, 오너 2026-11-14)
import { describe, expect, it } from 'vitest'
import {
  SHOT_STATUS_FILTERS,
  countStatusFilters,
  filterShotsByStatus,
  dimmedByStatusFilter,
  imageRemakeFailed,
  matchesStatusFilter,
  realBatchPendingNodeIds,
  shotFactsByNode,
  shotStageDots,
  shotState,
  shotStateTone,
  shotTail,
  videoTakeFrame,
  videoTakeTail,
  type ShotStateFacts,
} from '@/lib/director/shot-state'
import type { DirectorNode } from '@/types/director'

const none: ShotStateFacts = {
  imageGenerating: false,
  imageDone: false,
  imageFailed: false,
  imageRemakeFailed: false,
  imageWaiting: false,
  videoGenerating: false,
  videoDone: false,
  videoLatestFailed: false,
}

function shot(id: string, image: { status: string; url?: string } | null, writerShotId = `w-${id}`): DirectorNode {
  return {
    id,
    type: 'shot',
    position: { x: 0, y: 0 },
    data: {
      kind: 'shot',
      label: id,
      writerShotId,
      storyboardImage: image ? { url: image.url ?? '', status: image.status, errorMessage: null, generatedAt: 1 } : null,
    },
  } as unknown as DirectorNode
}

function video(id: string, parent: string, v: { status: string; url?: string | null; take: number; last?: string | null; at?: string }): DirectorNode {
  return {
    id,
    type: 'video',
    position: { x: 0, y: 0 },
    data: {
      kind: 'video',
      label: id,
      parentShotNodeId: parent,
      takeNumber: v.take,
      status: v.status,
      videoUrl: v.url ?? null,
      lastAttemptStatus: v.last ?? null,
      lastAttemptAt: v.at ?? null,
      createdAt: v.at ?? null,
      final: false,
    },
  } as unknown as DirectorNode
}

const quiet = { queuedImageShots: new Set<string>(), queuedVideoShots: new Set<string>() }

describe('샷 상태', () => {
  it('이미지가 없고 만드는 중도 아니면 그 샷은 "이미지 필요"다', () => {
    // 왜: 이미지 만들기 단추 숫자와 주황 태그가 이 상태를 센다.
    expect(shotState(none)).toBe('image_needed')
  })

  it('이미지를 만드는 중이면 그 샷은 "이미지 만드는 중"이다', () => {
    // 왜: 카드 안 Lumi 로딩 · 파랑 테두리가 이 상태에서 나온다.
    expect(shotState({ ...none, imageGenerating: true })).toBe('image_generating')
  })

  it('이미지가 있고 영상이 없으면 그 샷은 "이미지 완료"다', () => {
    // 왜: 영상 만들기 단추가 이 샷을 센다.
    expect(shotState({ ...none, imageDone: true })).toBe('image_done')
  })

  it('영상을 만드는 중이면 그 샷은 "영상 만드는 중"이다', () => {
    // 왜: 보라 테두리 · 진행이 이 상태에서 나온다.
    expect(shotState({ ...none, imageDone: true, videoGenerating: true })).toBe('video_generating')
  })

  it('완성 영상이 있으면 그 샷은 "영상 완성"이다', () => {
    // 왜: 초록 테두리 · Editor 로 넘길 수 있는 샷.
    expect(shotState({ ...none, imageDone: true, videoDone: true })).toBe('video_done')
  })

  it('마지막 영상이 실패했고 완성 영상이 없으면 그 샷은 "영상 실패"다', () => {
    // 왜: 빨강 테두리 · 다시 만들기를 보일 샷.
    expect(shotState({ ...none, imageDone: true, videoLatestFailed: true })).toBe('video_failed')
  })

  it('앞에 완성 영상이 있으면 마지막 영상이 실패해도 "영상 완성"이다', () => {
    // 왜: Editor 로 갈 영상이 이미 있는 샷을 실패로 보이지 않는다.
    expect(shotState({ ...none, imageDone: true, videoDone: true, videoLatestFailed: true })).toBe('video_done')
  })

  it('이미지를 못 만들었으면 그 샷은 "이미지 실패"다', () => {
    // 왜: 빨강 테두리 · "이미지를 못 만들었어요" · 다시 만들기를 보일 샷(시안 없음, 결정 페이지 추천).
    expect(shotState({ ...none, imageFailed: true })).toBe('image_failed')
  })

  it('한 샷이 여러 상태에 걸치면 영상 만드는 중 > 이미지 만드는 중 > 영상 완성 > 영상 실패 > 이미지 실패 > 이미지 완료 > 이미지 필요 순으로 하나만 보인다', () => {
    // 왜: 지금 하고 있는 일이 먼저 보여야 한다(이미지를 다시 그리는 중인 완성 샷 등).
    expect(shotState({ ...none, imageGenerating: true, videoGenerating: true })).toBe('video_generating')
    expect(shotState({ ...none, imageGenerating: true, videoDone: true })).toBe('image_generating')
    expect(shotState({ ...none, imageDone: true, videoDone: true, imageFailed: true })).toBe('video_done')
    expect(shotState({ ...none, imageDone: true, videoLatestFailed: true, imageFailed: true })).toBe('video_failed')
    expect(shotState({ ...none, imageFailed: true, imageDone: false })).toBe('image_failed')
  })
})

describe('캔버스 노드에서 샷 상태 근거 모으기', () => {
  it('큐에 떠 있는 이미지 작업이 있으면 노드 기록이 아직 안 바뀌었어도 이미지 만드는 중으로 센다', () => {
    // 왜: 화면을 떠났다 오면 노드 기록은 DB 로 다시 채워지지만 작업은 큐가 안다.
    const facts = shotFactsByNode([shot('a', null)], { ...quiet, queuedImageShots: new Set(['w-a']) })
    expect(shotState(facts.get('a')!)).toBe('image_generating')
  })

  it('완성 Take 와 실패한 마지막 Take 가 함께 있으면 영상 완성으로 센다', () => {
    // 왜: 앞 Take 가 살아 있으면 Editor 로 갈 영상이 있다.
    const nodes = [
      shot('a', { status: 'completed', url: 'https://x/a.png' }),
      video('v1', 'a', { status: 'completed', url: 'https://x/v1.mp4', take: 1, at: '2026-11-14T00:00:00Z' }),
      video('v2', 'a', { status: 'failed', take: 2, last: 'failed', at: '2026-11-14T01:00:00Z' }),
    ]
    expect(shotState(shotFactsByNode(nodes, quiet).get('a')!)).toBe('video_done')
  })

  it('마지막 Take 만 실패하고 완성 Take 가 없으면 영상 실패로 센다', () => {
    // 왜: 다시 만들기가 필요한 샷.
    const nodes = [
      shot('a', { status: 'completed', url: 'https://x/a.png' }),
      video('v1', 'a', { status: 'failed', take: 1, last: 'failed', at: '2026-11-14T01:00:00Z' }),
    ]
    expect(shotState(shotFactsByNode(nodes, quiet).get('a')!)).toBe('video_failed')
  })

  it('주소가 없는 완료 기록은 이미지가 있는 것으로 세지 않는다', () => {
    // 왜: 이미지 없이 영상 만들기를 켜면 서버가 말없이 빼던 고장(N 보드 "10 available")을 막는다.
    const facts = shotFactsByNode([shot('a', { status: 'completed', url: '' })], quiet)
    expect(shotState(facts.get('a')!)).toBe('image_needed')
  })

  it('이미지를 다시 만들다 실패해도 옛 그림이 남아 있으면 그 샷은 "이미지 완료"로 세고, 다시 만들기 실패를 따로 적는다', () => {
    // 왜: 다시 만들기가 실패해도 화면에는 옛 그림이 남는다(리드 검토 c ①, 영상의 "완성 Take 가 있으면 완성"과 같은 원칙).
    //   '이미지 필요'로 세면 [이미지 만들기 · N]이 그림 있는 샷을 세고 [영상 만들기 · N]에서 뺀다.
    const facts = shotFactsByNode([shot('a', { status: 'failed', url: 'https://x/a.png' })], quiet).get('a')!
    expect(shotState(facts)).toBe('image_done')
    expect(facts.imageRemakeFailed).toBe(true)
    expect(facts.imageFailed).toBe(false)
    expect(countStatusFilters([shotState(facts)]).image_done).toBe(1)
  })

  it('그림이 없는 샷의 이미지 만들기가 실패하면 그 샷은 "이미지 실패"다', () => {
    // 왜: 보일 그림이 없으니 빨강 테두리 · "이미지를 못 만들었어요" · [다시 만들기] 판을 띄운다.
    const facts = shotFactsByNode([shot('a', { status: 'failed', url: '' })], quiet).get('a')!
    expect(shotState(facts)).toBe('image_failed')
    expect(facts.imageRemakeFailed).toBe(false)
    expect(imageRemakeFailed({ status: 'failed', url: 'https://x/a.png' })).toBe(true)
    expect(imageRemakeFailed({ status: 'failed', url: '' })).toBe(false)
    expect(imageRemakeFailed({ status: 'completed', url: 'https://x/a.png' })).toBe(false)
    expect(imageRemakeFailed(null)).toBe(false)
  })

  it('일괄이 맡았지만 아직 큐에 앉지 않은 샷은 "이미지 만드는 중"으로 세고 기다림으로 적는다', () => {
    // 왜: 리드 검토 c ④d — 넘기지 않던 이 샷들이 '이미지 필요'로 보였다. 일괄이 곧 그릴 샷이라 [이미지 만들기 · N]에 다시 세면 안 된다.
    const pending = new Set(['a'])
    const facts = shotFactsByNode([shot('a', null), shot('b', null)], { ...quiet, pendingImageNodeIds: pending })
    expect(shotState(facts.get('a')!)).toBe('image_generating')
    expect(facts.get('a')!.imageWaiting).toBe(true)
    expect(shotState(facts.get('b')!)).toBe('image_needed')
    // 큐에 앉으면 기다림이 아니라 만드는 중이다.
    const queued = shotFactsByNode([shot('a', null)], { ...quiet, pendingImageNodeIds: pending, queuedImageShots: new Set(['w-a']) })
    expect(queued.get('a')!.imageWaiting).toBe(false)
    expect(shotState(queued.get('a')!)).toBe('image_generating')
  })

  it('일괄이 맡은 샷은 그림이 없고 · 실패하지 않았고 · 러프가 있고 · 일괄 대상인 샷이며, 멈추기를 누르면 없다', () => {
    // 왜: 일괄은 러프가 있는 빈 샷만 그린다(실패한 샷 · 손으로 더한 샷은 한 장씩). 멈춘 뒤에는 남은 샷을 그리지 않는다.
    const nodes = [
      shot('a', null),
      shot('b', { status: 'completed', url: 'https://x/b.png' }),
      shot('c', { status: 'failed', url: '' }),
      shot('d', null),
      shot('e', null),
    ]
    const batch = { busy: true, cancelled: false, shotIds: null, roughShotIds: new Set(['w-a', 'w-b', 'w-c', 'w-e']) }
    expect([...realBatchPendingNodeIds(nodes, batch)]).toEqual(['a', 'e'])
    expect([...realBatchPendingNodeIds(nodes, { ...batch, shotIds: ['w-e'] })]).toEqual(['e'])
    expect(realBatchPendingNodeIds(nodes, { ...batch, busy: false }).size).toBe(0)
    expect(realBatchPendingNodeIds(nodes, { ...batch, cancelled: true }).size).toBe(0)
  })
})

describe('꼬리 글', () => {
  it('꼬리는 카드 · 노드가 같은 판정이고, 노드형 이미지 필요 샷만 "이미지 필요"라고 쓴다', () => {
    // 왜: 시안 D1 — 카드는 주황 "이미지 필요" 태그가 따로 있어 꼬리가 "대기", 노드형은 태그가 없어 꼬리가 "이미지 필요"(406:4051).
    expect(shotTail('image_needed', none, 'card').label).toBe('Not started')
    expect(shotTail('image_needed', none, 'node').label).toBe('Image needed')
    expect(shotTail('image_done', none, 'node')).toMatchObject({ label: 'Image ready', color: 'stage-director', ring: false })
    expect(shotTail('video_done', none, 'card')).toMatchObject({ label: 'Video done', color: 'success' })
  })

  it('다시 만들기가 실패한 샷의 꼬리는 빨강 점 "다시 만들기 실패"이고, 다시 만드는 중이면 만드는 중이 먼저다', () => {
    // 왜: 리드 검토 c ① — 옛 그림이 남은 실패는 꼬리 · [다시 만들기]로만 알린다. 테두리는 샷 상태 색 그대로.
    const failed = { ...none, imageDone: true, imageRemakeFailed: true }
    expect(shotTail('image_done', failed, 'card')).toMatchObject({ label: 'Remake failed', color: 'destructive', remakeFailed: true })
    expect(shotTail('video_done', failed, 'node')).toMatchObject({ label: 'Remake failed', remakeFailed: true })
    expect(shotTail('image_generating', failed, 'card')).toMatchObject({ label: 'Making image', remakeFailed: false })
  })

  it('일괄이 맡아 차례를 기다리는 샷의 꼬리는 "대기 중"이다', () => {
    // 왜: 리드 검토 c ④d — 아직 큐에 앉지 않았으니 만드는 중이라고 쓰지 않는다(#e4 2026-08-12 "대기 vs 실작업").
    expect(shotTail('image_generating', { ...none, imageWaiting: true }, 'card')).toMatchObject({ label: 'Waiting', color: 'stage-director', ring: true })
  })

  it('영상 노드 꼬리는 그 Take 상태다 — 영상이 없으면 "영상 없음", 만드는 중 "영상 만드는 중", 실패 "영상 실패"', () => {
    // 왜: 시안 D1 노드형(406:4051) "● 영상 없음" — 영상 노드도 색만으로 말하지 않는다(리드 검토 c ②).
    expect(videoTakeTail({ status: 'pending', lastAttemptStatus: null, videoUrl: null })).toEqual({ label: 'No video yet', color: null, ring: false })
    expect(videoTakeTail({ status: 'generating', lastAttemptStatus: 'generating', videoUrl: null })).toEqual({ label: 'Making video', color: 'state-video', ring: true })
    expect(videoTakeTail({ status: 'failed', lastAttemptStatus: 'failed', videoUrl: null })).toEqual({ label: 'Video failed', color: 'destructive', ring: false })
  })

  it('영상이 남아 있는 Take 를 다시 만들다 실패하면 영상 노드 꼬리는 "다시 만들기 실패"다', () => {
    // 왜: 이미지와 같은 원칙(리드 검토 c ①) — 볼 수 있는 영상 · 초록 테두리는 그대로 두고, 실패는 꼬리로만 알린다.
    expect(videoTakeTail({ status: 'completed', lastAttemptStatus: 'failed', videoUrl: 'https://x/v.mp4' })).toEqual({ label: 'Remake failed', color: 'destructive', ring: false })
  })
})

describe('상태 고르기', () => {
  it('상태 고르기의 줄은 전체 · 이미지 필요 · 이미지 만드는 중 · 이미지 완료 · 영상 만드는 중 · 영상 완성 · 영상 실패다', () => {
    // 왜: 시안 D1(406:3717) 드롭다운 = 범례 겸 거르기, 실패는 R 의 여섯째 상태.
    expect(SHOT_STATUS_FILTERS).toEqual([
      'all',
      'image_needed',
      'image_generating',
      'image_done',
      'video_generating',
      'video_done',
      'video_failed',
    ])
  })

  it('상태 고르기는 줄마다 그 상태 샷 수를 세고, 전체는 모든 샷 수다', () => {
    // 왜: "이미지 필요 4 · 이미지 만드는 중 0 …"처럼 개수를 함께 보인다.
    const counts = countStatusFilters(['image_needed', 'image_needed', 'image_done', 'video_done'])
    expect(counts).toMatchObject({ all: 4, image_needed: 2, image_done: 1, video_done: 1, video_generating: 0 })
  })

  it('이미지를 못 만든 샷은 상태 고르기에서 "이미지 필요"로 센다', () => {
    // 왜: 다시 만들 샷이라 이미지 필요와 같은 줄에서 찾는다(드롭다운 줄을 늘리지 않음).
    expect(countStatusFilters(['image_failed']).image_needed).toBe(1)
    expect(matchesStatusFilter('image_failed', 'image_needed')).toBe(true)
  })

  it('상태 고르기에서 하나를 고르면 그 상태 샷만 맞고, 전체를 고르면 모두 맞는다', () => {
    // 왜: 고른 상태 샷만 보이게 거른다(결정 페이지 추천).
    expect(matchesStatusFilter('image_done', 'image_done')).toBe(true)
    expect(matchesStatusFilter('video_done', 'image_done')).toBe(false)
    expect(matchesStatusFilter('video_failed', 'all')).toBe(true)
  })
})

describe('상태로 거르기', () => {
  it('스토리보드형에서 상태를 고르면 그 상태 샷만 남고, 전체를 고르면 모두 남는다', () => {
    // 왜: 결정 페이지 추천 "상태 고르기에서 상태를 고르면 그 상태 샷만 보임".
    const shots = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const states = new Map([['a', 'image_needed'], ['b', 'video_done'], ['c', 'image_failed']] as const)
    expect(filterShotsByStatus(shots, states, 'image_needed').map((s) => s.id)).toEqual(['a', 'c'])
    expect(filterShotsByStatus(shots, states, 'all').map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('노드형에서 상태를 고르면 다른 상태의 샷 노드는 숨기지 않고 흐리게 둔다', () => {
    // 왜: 캔버스의 선 · 자리 · 자동 정렬이 흔들리지 않게(혼자 정한 것, 쉬움).
    expect(dimmedByStatusFilter('video_done', 'image_needed')).toBe(true)
    expect(dimmedByStatusFilter('image_needed', 'image_needed')).toBe(false)
    expect(dimmedByStatusFilter('video_done', 'all')).toBe(false)
    expect(dimmedByStatusFilter(undefined, 'image_needed')).toBe(false)
  })
})

describe('상태 색', () => {
  it('테두리는 이미지 만드는 중 · 이미지 완료 파랑, 영상 만드는 중 보라, 영상 완성 초록, 영상 실패 · 이미지 실패 빨강이고 이미지 필요는 테두리 색이 없다', () => {
    // 왜: 시안 R 의 상태 색(색 = 단계, 오너 2026-11-14 "Director 생성 상태" 예외).
    expect(shotStateTone('image_generating').frame).toBe('border-stage-director')
    expect(shotStateTone('image_done').frame).toBe('border-stage-director')
    expect(shotStateTone('video_generating').frame).toBe('border-state-video')
    expect(shotStateTone('video_done').frame).toBe('border-success')
    expect(shotStateTone('video_failed').frame).toBe('border-destructive')
    expect(shotStateTone('image_failed').frame).toBe('border-destructive')
    expect(shotStateTone('image_needed').frame).toBeNull()
  })

  it('노드형 영상 노드 테두리는 그 Take 가 만드는 중이면 보라, 완성이면 초록, 실패면 빨강이다', () => {
    // 왜: 시안 D4 · D7 — Take 마다 상태가 다르다(완성 Take 옆에서 새 Take 를 만드는 중일 수 있다).
    expect(videoTakeFrame({ status: 'generating', lastAttemptStatus: 'generating', videoUrl: null })).toBe('border-state-video')
    expect(videoTakeFrame({ status: 'completed', lastAttemptStatus: 'generating', videoUrl: 'https://x/v.mp4' })).toBe('border-state-video')
    expect(videoTakeFrame({ status: 'completed', lastAttemptStatus: 'completed', videoUrl: 'https://x/v.mp4' })).toBe('border-success')
    expect(videoTakeFrame({ status: 'failed', lastAttemptStatus: 'failed', videoUrl: null })).toBe('border-destructive')
    expect(videoTakeFrame({ status: 'pending', lastAttemptStatus: null, videoUrl: null })).toBeNull()
  })

  it('만드는 중인 상태의 점은 테두리만 있는 고리이고, 끝난 상태의 점은 꽉 찬 점이다', () => {
    // 왜: 시안 R "테두리만 = 만드는 중, 꽉 찬 점 = 끝남".
    expect(shotStateTone('image_generating').ring).toBe(true)
    expect(shotStateTone('video_generating').ring).toBe(true)
    expect(shotStateTone('image_done').ring).toBe(false)
    expect(shotStateTone('video_done').ring).toBe(false)
    expect(shotStateTone('image_needed').dot).toBe('stage-producer')
  })

  it('카드 아래 이미지 → 영상 줄은 이미지 점과 영상 점을 각 단계 색으로 보인다', () => {
    // 왜: 시안 D1 · D3 "● 이미지 → ● 영상" — 어느 단계까지 왔는지 한눈에.
    expect(shotStageDots('image_needed')).toEqual({ image: 'none', video: 'none' })
    expect(shotStageDots('image_generating')).toEqual({ image: 'image_progress', video: 'none' })
    expect(shotStageDots('image_done')).toEqual({ image: 'image_done', video: 'none' })
    expect(shotStageDots('video_generating')).toEqual({ image: 'image_done', video: 'video_progress' })
    expect(shotStageDots('video_done')).toEqual({ image: 'image_done', video: 'video_done' })
    expect(shotStageDots('video_failed')).toEqual({ image: 'image_done', video: 'failed' })
    expect(shotStageDots('image_failed')).toEqual({ image: 'failed', video: 'none' })
  })
})
