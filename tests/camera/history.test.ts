// Camera 샷 줄의 이력 — 실사 그림 판과 영상 Take 가 만든 차례대로 한 줄에 쌓이고, 판마다 무엇이 바뀌었는지 · 지금 쓰는 것 · 안 쓴 것을 가리는지 검사한다 (오너 2026-11-22 D2~D5)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dialogueRowLines, historyActions, shotHistory, type HistoryEntry, type HistoryPhrase } from '@/features/camera/shot-history'
import { translate } from '@/lib/i18n/translate'
import type { ShotDetailTake } from '@/lib/director/shot-detail'
import type { StoryboardImage, StoryboardImageVersion, VideoNodeData } from '@/types/director'

const T0 = Date.parse('2026-11-22T10:00:00Z')
const at = (minutes: number) => T0 + minutes * 60_000
const iso = (minutes: number) => new Date(at(minutes)).toISOString()

const version = (n: number, minutes: number, extra: Partial<StoryboardImageVersion> = {}): StoryboardImageVersion => ({
  id: `job-${n}`, n, url: `https://x/v${n}-start.png`,
  frames: { start: `https://x/v${n}-start.png`, direction: `https://x/v${n}-dir.png`, end: `https://x/v${n}-end.png` },
  generatedAt: at(minutes), source: 'generated', roughGeneratedAt: 1, ...extra,
})
const image = (versions: StoryboardImageVersion[], versionId: string, extra: Partial<StoryboardImage> = {}): StoryboardImage => {
  const chosen = versions.find((v) => v.id === versionId)!
  return { url: chosen.url, frames: chosen.frames, status: 'completed', errorMessage: null, generatedAt: chosen.generatedAt, versions, versionId, ...extra }
}
const take = (n: number, minutes: number, extra: Partial<VideoNodeData> = {}): ShotDetailTake => ({
  id: `take-${n}`,
  data: {
    kind: 'video', label: `take_v${n}`, videoClipId: `clip-${n}`, takeNumber: n, generationJobId: `vjob-${n}`,
    lastAttemptStatus: 'completed', lastAttemptError: null, lastAttemptAt: iso(minutes), createdAt: iso(minutes),
    frameInputs: { start: null, end: null, refs: [] }, videoChainInputId: null, videoChainFrameUrl: null,
    videoUrl: `https://x/take-${n}.mp4`, thumbnailUrl: `https://x/take-${n}.jpg`, status: 'completed', errorMessage: null,
    final: false, stale: false, parentShotNodeId: 'shot-1', standaloneVideoKey: null, override: {},
    madeFrames: { start: 'https://x/v1-start.png', end: 'https://x/v1-end.png' }, ...extra,
  } as VideoNodeData,
})
const shot = { provider: 'kling-o3' as const }
const ko = (phrases: HistoryPhrase[]) => phrases.map((p) => translate('ko', p.key, p.params)).join(' · ')
const kinds = (entries: HistoryEntry[]) => entries.map((e) => (e.kind === 'image' ? `v${e.n}` : e.kind === 'take' ? `T${e.takeNumber}` : e.kind))

describe('이력 줄의 차례', () => {
  it('그림 판과 영상 Take 는 만든 차례대로 한 줄에 서고 오래된 판이 왼쪽, 새 판이 오른쪽이다', () => {
    // 왜: 오너 D2~D5 "사진과 영상 히스토리가 계속 쌓이는 모양" · 리드 11/22 "오래된 판 왼쪽 → 새 판 오른쪽".
    const img = image([version(1, 0), version(2, 30)], 'job-2')
    const entries = shotHistory({ image: img, takes: [take(2, 40), take(1, 10)], final: { id: 'take-2', auto: true }, shot })
    expect(kinds(entries)).toEqual(['v1', 'T1', 'v2', 'T2'])
  })

  it('그림 판의 때는 다 그린 때이고 Take 의 때는 부탁한 때다 — 그림이 다 되기 전에 부탁한 Take 는 그 그림보다 왼쪽이다', () => {
    // 왜: 그 Take 가 어느 그림으로 만들어졌는지와 줄의 차례가 맞아야 요약을 읽을 수 있다(v2 가 다 되기 전에 부탁한 Take 는 v1 으로 만들었다).
    const img = image([version(1, 0), version(2, 30)], 'job-2')
    const entries = shotHistory({ image: img, takes: [take(1, 29)], final: { id: 'take-1', auto: true }, shot })
    expect(kinds(entries)).toEqual(['v1', 'T1', 'v2'])
  })
})

describe('지금 쓰는 판과 안 쓴 판', () => {
  it('지금 그림인 판에는 "지금 그림" 표시가 붙고 다른 그림 판은 안 쓴 판이다', () => {
    // 왜: 영상 · Editor 는 지금 그림을 쓴다 — 어느 판이 쓰이는지 줄에서 바로 보여야 되돌릴 판을 고른다.
    const img = image([version(1, 0), version(2, 30)], 'job-1')
    const [v1, v2] = shotHistory({ image: img, takes: [], final: null, shot }) as Extract<HistoryEntry, { kind: 'image' }>[]
    expect([v1.current, v1.used, v2.current, v2.used]).toEqual([true, true, false, false])
  })

  it('★ 로 고른 Take 에는 "★ 최종", 고르지 않았으면 가장 새 완성 Take 에 "★ 최종 (자동)"이 붙고 나머지 Take 는 안 쓴 판이다', () => {
    // 왜: ★ 가 Editor 로 가는 영상이다(11/14 약속) — 참고 페이지의 "지금 쓰는 클립".
    const img = image([version(1, 0)], 'job-1')
    const manual = shotHistory({ image: img, takes: [take(1, 10), take(2, 20)], final: { id: 'take-1', auto: false }, shot }).filter((e) => e.kind === 'take')
    expect(manual.map((e) => [e.final, e.used])).toEqual([['manual', true], [null, false]])
    const auto = shotHistory({ image: img, takes: [take(1, 10), take(2, 20)], final: { id: 'take-2', auto: true }, shot }).filter((e) => e.kind === 'take')
    expect(auto.map((e) => [e.final, e.used])).toEqual([[null, false], ['auto', true]])
  })

  it('화면에서 멈춘 Take 가 아직 안 끝났으면 만드는 중이 아니라 "멈춤"이고 안 쓴 판이다', () => {
    // 왜: 11/14 7번 — 멈춘 Take 는 ★ 가 아니면 만드는 중도 영상도 아니다.
    const img = image([version(1, 0)], 'job-1')
    const [stopped] = shotHistory({
      image: img, final: null, shot,
      takes: [take(1, 10, { status: 'generating', lastAttemptStatus: 'generating', videoUrl: null, cancelledAt: iso(11) })],
    }).filter((e) => e.kind === 'take')
    expect(stopped).toMatchObject({ phase: 'stopped', used: false })
    expect(ko(stopped.summary)).toContain('멈춤')
  })
})

describe('판마다 무엇이 바뀌었나', () => {
  it('첫 그림 판은 "처음 그림", 올린 그림은 "올린 그림", 멈춘 뒤 끝난 그림은 "멈춘 뒤 끝났어요", 러프가 바뀐 뒤 그린 판은 "러프가 바뀐 뒤 다시 그림", 그 밖은 "다시 그림"이다', () => {
    // 왜: 오너 D2~D5 "이력 사이에 변경 내역 요약" — 지금 저장된 것만으로 아는 사실을 먼저 적는다(사람이 쓴 말은 다음 조각).
    const img = image([
      version(1, 0),
      version(2, 10),
      version(3, 20, { roughGeneratedAt: 2 }),
      version(4, 30, { source: 'upload', id: 'upload-4', frames: undefined }),
      version(5, 40, { cancelled: true, roughGeneratedAt: 2 }),
    ], 'job-2')
    const entries = shotHistory({ image: img, takes: [], final: null, shot }).filter((e) => e.kind === 'image')
    expect(entries.map((e) => ko(e.summary))).toEqual(['처음 그림', '다시 그림', '러프가 바뀐 뒤 다시 그림', '올린 그림', '멈춘 뒤 끝났어요'])
  })

  it('첫 Take 는 "처음 영상"과 모델 · 해상도 · 쓴 그림 판을 적고, 다음 Take 부터는 앞 Take 와 달라진 것과 적어 둔 바꿀 점을 적는다', () => {
    // 왜: 참고 페이지의 판 요약처럼 "무엇을 바꿨나"를 한두 줄로 — 같은 설정으로 다시 만들었으면 "다시 만듦".
    const img = image([version(1, 0), version(2, 30)], 'job-2')
    const takes = [
      take(1, 10),
      take(2, 20),
      take(3, 40, { override: { provider: 'veo', resolution: '1080p', changeNote: '더 천천히' }, madeFrames: { start: 'https://x/v2-start.png', end: 'https://x/v2-end.png' } }),
    ]
    const entries = shotHistory({ image: img, takes, final: { id: 'take-3', auto: true }, shot }).filter((e) => e.kind === 'take')
    expect(entries.map((e) => ko(e.summary))).toEqual([
      '처음 영상 · Kling O3 Pro · 720p · 그림 v1',
      '다시 만듦',
      'Veo 3.1 · 1080p · 그림 v2 · 바꿀 점: 더 천천히',
    ])
  })

  it('만드는 중 · 실패한 Take 는 그 상태를 앞에 적고, 실패는 이유 첫 줄을 붙인다', () => {
    // 왜: 안 쓴 시도도 왜 안 썼는지 남아야 한다(참고 페이지 "중간에 화면이 끊김. 채택하지 않음").
    const img = image([version(1, 0)], 'job-1')
    const takes = [
      take(1, 10, { status: 'failed', lastAttemptStatus: 'failed', videoUrl: null, lastAttemptError: 'Content policy\nmore detail' }),
      take(2, 20, { status: 'generating', lastAttemptStatus: 'generating', videoUrl: null }),
    ]
    const entries = shotHistory({ image: img, takes, final: null, shot }).filter((e) => e.kind === 'take')
    expect(ko(entries[0].summary).startsWith('실패: Content policy')).toBe(true)
    expect(ko(entries[0].summary)).not.toContain('more detail')
    expect(ko(entries[1].summary).startsWith('만드는 중')).toBe(true)
  })

  it('앞 영상에서 이어서 만든 Take 는 "앞 영상에서 이어서"라고 적는다', () => {
    // 왜: 오너 D2~D5 ① 이어서 생성 — 지금도 노드 보기에서 이으면 그렇게 만들어진다. 방식 이름은 영상 방식 조각에서 늘어난다.
    const img = image([version(1, 0)], 'job-1')
    const [chained] = shotHistory({ image: img, final: null, shot, takes: [take(1, 10, { videoChainInputId: 'prev-take' })] }).filter((e) => e.kind === 'take')
    expect(ko(chained.summary)).toContain('앞 영상에서 이어서')
  })
})

describe('그리는 중 · 실패 자리', () => {
  it('그림을 다시 그리는 중이면 줄 맨 끝에 "이미지를 그리고 있어요" 판이 서고, 다시 그리기가 실패했으면 "다시 만들기 실패" 판이 선다 — 지금 그림은 그대로다', () => {
    // 왜: 다시 그리는 동안에도 옛 판 · 지금 그림이 사라지지 않는다(11/14 약속) — 새 판이 올 자리를 끝에 보인다.
    const img = image([version(1, 0)], 'job-1')
    const drawing = shotHistory({ image: img, takes: [take(1, 10)], final: { id: 'take-1', auto: true }, shot, imageWork: { phase: 'drawing' } })
    expect(kinds(drawing)).toEqual(['v1', 'T1', 'image-pending'])
    expect(ko(drawing.at(-1)!.summary)).toBe('이미지를 그리고 있어요')
    const failed = shotHistory({ image: img, takes: [], final: null, shot, imageWork: { phase: 'failed', message: 'Rate limited' } })
    expect(ko(failed.at(-1)!.summary)).toBe('다시 만들기 실패: Rate limited')
    expect((failed[0] as Extract<HistoryEntry, { kind: 'image' }>).current).toBe(true)
  })
})

describe('판 카드에서 할 수 있는 일', () => {
  it('지금 그림이 아닌 그림 판에서는 [이 그림 쓰기]로 되돌리고, 지금 그림에는 할 일이 없다', () => {
    // 왜: 11/14 답 5 — 판을 고르면 다시 그리지 않고(Take 0) 그 그림이 지금 그림이 된다.
    const img = image([version(1, 0), version(2, 30)], 'job-2')
    const [v1, v2] = shotHistory({ image: img, takes: [], final: null, shot })
    expect(historyActions(v1)).toEqual(['useImage'])
    expect(historyActions(v2)).toEqual([])
  })

  it('완성 Take 는 ★ 가 아니면 [★ 최종으로], 자동 ★ 면 [★ 최종으로](사람이 고른 것으로), 사람이 고른 ★ 면 [★ 풀기]다 — 만드는 중 · 실패 Take 에는 없다', () => {
    // 왜: 샷 상세의 ★ 단추와 같은 규칙(11/14) — Camera 줄에서도 같은 일을 한다.
    const img = image([version(1, 0)], 'job-1')
    const entries = shotHistory({
      image: img, shot, final: { id: 'take-2', auto: true },
      takes: [take(1, 10), take(2, 20), take(3, 30, { status: 'failed', lastAttemptStatus: 'failed', videoUrl: null })],
    }).filter((e) => e.kind === 'take')
    expect(entries.map(historyActions)).toEqual([['setFinal'], ['setFinal'], []])
    const manual = shotHistory({ image: img, shot, final: { id: 'take-1', auto: false }, takes: [take(1, 10)] }).filter((e) => e.kind === 'take')
    expect(historyActions(manual[0])).toEqual(['unsetFinal'])
  })
})

describe('샷 줄 왼쪽 정보', () => {
  it('대사는 화자 이름과 함께 보이고 화자가 없는 대사는 V.O. 다', () => {
    // 왜: 오너 D2~D5 — 샷마다 왼쪽에 샷 스토리 · 대사. 화자 이름은 Writer 인물 이름(콘티 대사 탭과 같은 규칙).
    const names = new Map([['char_a', '하윤']])
    expect(dialogueRowLines([{ characterId: 'char_a', text: '여기야.' }, { characterId: '', text: '그날 밤.' }], names)).toEqual([
      { speaker: '하윤', text: '여기야.' },
      { speaker: 'V.O.', text: '그날 밤.' },
    ])
  })
})

describe('이력 줄이 보이는 자리', () => {
  it('이력 줄은 처음 열 때 · 판이 늘 때 맨 오른쪽(새 판)이 보이고, 맨 오른쪽에 있던 줄은 창 폭이 바뀌어도 맨 오른쪽을 지키며, 사람이 옆으로 넘겨 둔 자리는 그대로 둔다', () => {
    // 왜: 리드 11/22 "처음엔 맨 오른쪽이 보이게" — 넓은 창에서 열고 좁히면 새 판이 오른쪽으로 숨었다(조각 6 화면 확인).
    const row = readFileSync('src/features/camera/shot-row.tsx', 'utf8')
    expect(row).toMatch(/pinnedRef\.current = strip\.scrollLeft >= strip\.scrollWidth - strip\.clientWidth - 4/)
    expect(row).toMatch(/new ResizeObserver\(\(\) => \{\s*if \(pinnedRef\.current\) strip\.scrollLeft = strip\.scrollWidth/)
    expect(row).toMatch(/\}, \[entries\.length\]\)/)
  })
})
