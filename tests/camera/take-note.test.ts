// Cinema 이력의 Take 판이 그 Take 를 만들 때 적은 사람 말(바꿀 점 · 채팅 부탁)을 보이고, [다시 만들기] · 일괄로 만든 새 Take 가 앞 Take 의 말을 이어받지 않는지 검사한다 (오너 2026-11-22 결정 4 · 리드 11/22 ⑥)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { shotHistory } from '@/features/camera/shot-history'
import { buildVideoBatchInputs } from '@/lib/director/video-batch-inputs'
import { translate } from '@/lib/i18n/translate'
import type { ShotDetailTake } from '@/lib/director/shot-detail'
import type { DirectorNode, VideoNodeData } from '@/types/director'

const take = (n: number, override: Record<string, unknown>): ShotDetailTake => ({
  id: `t${n}`,
  data: {
    kind: 'video', label: `take_v${n}`, takeNumber: n, parentShotNodeId: 's1', videoClipId: `c${n}`, generationJobId: `j${n}`,
    status: 'completed', lastAttemptStatus: 'completed', videoUrl: `https://x/${n}.mp4`, thumbnailUrl: null, final: false,
    createdAt: `2026-11-22T10:0${n}:00Z`, lastAttemptAt: `2026-11-22T10:0${n}:00Z`, cancelledAt: null, override,
  } as unknown as VideoNodeData,
})
const summaries = (takes: ShotDetailTake[]) =>
  shotHistory({ image: null, takes, final: null, shot: { provider: 'seedance' } })
    .filter((entry) => entry.kind === 'take')
    .map((entry) => entry.summary.map((p) => translate('ko', p.key, p.params)).join(' · '))

describe('Take 판의 사람 말', () => {
  it('Take 판은 그 Take 를 만들 때 적은 사람 말을 보인다 — 단추로 적은 바꿀 점은 "바꿀 점: …", 채팅으로 부탁한 말은 "채팅으로 부탁: …"', () => {
    // 왜: 결정 4 "요약에 사람이 쓴 말 남기기" — 그림 판과 같은 말(조각 6). LLM 요약은 부르지 않는다.
    const [first, second] = summaries([take(1, {}), take(2, { note: '천천히 고개를 든다', via: 'button' })])
    expect(first).not.toContain('바꿀 점')
    expect(second).toContain('바꿀 점: 천천히 고개를 든다')
    const [, chat] = summaries([take(1, {}), take(2, { note: '샷 2 다시, 더 어둡게', via: 'chat' })])
    expect(chat).toContain('채팅으로 부탁: 샷 2 다시, 더 어둡게')
  })

  it('사람 말 칸이 있는 Take 는 그 칸만 본다 — 빈 말이면 아무 말도 붙지 않고, 칸이 없는 옛 Take 는 지금처럼 바꿀 점을 보인다', () => {
    // 왜: 이어받은 바꿀 점(changeNote)은 다음 Take 칸에 미리 채워질 뿐이다 — 새 Take 에 실제로 적은 말(note)이 그 판의 말이다. 옛 Take 는 note 가 없다.
    const [, blank] = summaries([take(1, {}), take(2, { changeNote: '', note: '', via: 'button' })])
    expect(blank).not.toContain('바꿀 점')
    const [, legacy] = summaries([take(1, {}), take(2, { changeNote: '더 느리게' })])
    expect(legacy).toContain('바꿀 점: 더 느리게')
  })
})

describe('앞 Take 의 말을 이어받지 않기', () => {
  it('[다시 만들기] · 샷 상세로 만든 새 Take 는 앞 Take 의 설정은 이어받아도 사람 말 · 만든 길은 이어받지 않는다', () => {
    // 왜: 리드 11/22 ⑤ 주의 — 상속(withoutTakePrompt)이 note · via 를 넘기면 옛 판의 요약이 새 판에 붙는다. 그 판의 말은 그 판을 만들 때만 적는다.
    const store = readFileSync('src/stores/director-store.ts', 'utf8')
    expect(store).toMatch(/function withoutTakePrompt[\s\S]{0,200}delete rest\.prompt\s+delete rest\.note\s+delete rest\.via/)
  })

  it('일괄로 만든 새 Take 는 앞 Take 의 사람 말 · 만든 길을 싣지 않는다', () => {
    // 왜: 일괄은 앞 Take 설정(모델 · 해상도)을 복사한다 — 그때 앞 Take 의 말까지 실리면 새 판 요약이 틀린다.
    const node = (id: string, data: Record<string, unknown>) => ({ id, type: String(data.kind), position: { x: 0, y: 0 }, data }) as unknown as DirectorNode
    const camera = { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }
    const nodes = [
      node('s1', { kind: 'shot', writerShotId: 'w1', prompt: 'p', camera, lighting: { position: 'front', brightness: 50, colorTemp: 5600 }, cameraPreset: { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 }, provider: 'seedance', durationSeconds: 5, storyboardImage: null, referenceImages: [], imageInputs: [] }),
      // 손으로 시작 그림을 이은 Take — 일괄은 이 Take 의 설정을 통째로 복사한다(video-batch-take pickActiveTake).
      node('v1', { kind: 'video', parentShotNodeId: 's1', standaloneVideoKey: null, takeNumber: 1, createdAt: '2026-11-22T00:00:00Z', status: 'pending', videoUrl: null, frameInputs: { start: 'a1', end: null, refs: [] }, videoChainInputId: null, videoChainFrameUrl: null, override: { provider: 'kling-o3', note: '옛 말', via: 'button' } }),
      node('a1', { kind: 'asset', imageUrl: 'https://cdn/start.png' }),
    ]
    const override = buildVideoBatchInputs('p-1', nodes, ['s1']).items[0]!.request.override as Record<string, unknown>
    expect(override).toMatchObject({ provider: 'kling-o3' })
    expect(override).not.toHaveProperty('note')
    expect(override).not.toHaveProperty('via')
  })
})
