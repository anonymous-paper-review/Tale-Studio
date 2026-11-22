// Take 판(Cinema 이력 · Director 샷 상세 Take 목록)의 모델 이름이 그 영상을 실제로 낸 작업의 모델을 먼저 쓰고, 다음 Take 의 모델은 바꾸지 않는지 검사한다 (리드 2026-11-22 결정 ① · fb-camera 발견 · fb-video made_model)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { takeShownModel } from '@/lib/director/take-model-name'
import { takeSettings } from '@/lib/director/remake-take'
import { shotHistory } from '@/features/camera/shot-history'
import { translate } from '@/lib/i18n/translate'
import type { ShotDetailTake } from '@/lib/director/shot-detail'
import type { VideoNodeData } from '@/types/director'

const take = (n: number, extra: Partial<VideoNodeData> = {}): ShotDetailTake => ({
  id: `t${n}`,
  data: {
    kind: 'video', label: `take_v${n}`, takeNumber: n, parentShotNodeId: 's1', videoClipId: `c${n}`, generationJobId: `j${n}`,
    status: 'completed', lastAttemptStatus: 'completed', videoUrl: `https://x/${n}.mp4`, thumbnailUrl: null, final: false,
    createdAt: `2026-11-22T10:0${n}:00Z`, lastAttemptAt: `2026-11-22T10:0${n}:00Z`, cancelledAt: null, override: {}, ...extra,
  } as unknown as VideoNodeData,
})
const summaries = (takes: ShotDetailTake[], provider: 'seedance' | 'happy-horse') =>
  shotHistory({ image: null, takes, final: null, shot: { provider } })
    .flatMap((entry) => (entry.kind === 'take' ? [entry.summary.map((p) => translate('ko', p.key, p.params)).join(' · ')] : []))

describe('Take 판의 모델 이름', () => {
  it('Take 판의 모델 이름은 그 영상을 실제로 낸 작업의 모델을 먼저 쓴다 — 샷 기본 모델이 나중에 바뀌어도 옛 Take 의 모델 이름은 그대로다', () => {
    // 왜: fb-camera 이어서 시험 — Happy Horse 로 만든 Take 가 샷 기본 모델(Seedance)로 돌아가자 판에 "Seedance 2.0"으로 보였다(리드 결정 ①).
    expect(takeShownModel({ provider: 'seedance' }, take(1, { madeModel: 'happy-horse' }).data)).toBe('happy-horse')
    const [first] = summaries([take(1, { madeModel: 'happy-horse' })], 'seedance')
    expect(first).toContain('Happy Horse')
    expect(first).not.toContain('Seedance')
    // 앞 Take 와 실제 모델이 같으면 다시 적지 않고, 다르면 바뀐 모델을 적는다(실제 모델끼리 견준다).
    const [, same] = summaries([take(1, { madeModel: 'happy-horse' }), take(2, { madeModel: 'happy-horse' })], 'seedance')
    expect(same).not.toMatch(/Happy Horse|Seedance/)
    const [, changed] = summaries([take(1, { madeModel: 'happy-horse' }), take(2, { madeModel: 'seedance' })], 'happy-horse')
    expect(changed).toContain('Seedance 2.0')
    // Director 샷 상세의 Take 목록도 같은 함수로 이름을 고른다.
    expect(readFileSync('src/features/director/shot-detail/shot-video-tab.tsx', 'utf8')).toMatch(/VIDEO_MODELS\[takeShownModel\(data, take\.data\)\]\.label/)
  })

  it('그 기록이 없으면(옛 Take · 아직 만드는 중 · 모르는 이름) 지금처럼 Take 설정 → 샷 기본 모델로 보인다', () => {
    // 왜: fb-video 계약 — made_model 이 null 인 넷(다시 만드는 중 · 다시 만들기 실패 · MiniMax 대체 · 작업 기록 없는 옛 Take)은 지금 그대로 보인다.
    expect(takeShownModel({ provider: 'seedance' }, take(1, { madeModel: null }).data)).toBe('seedance')
    expect(takeShownModel({ provider: 'seedance' }, take(1, { override: { provider: 'kling-o3' } }).data)).toBe('kling-o3')
    expect(takeShownModel({ provider: 'seedance' }, take(1, { madeModel: 'minimax' as never }).data)).toBe('seedance')
    expect(takeShownModel({ provider: 'happy-horse' }, null)).toBe('happy-horse')
  })

  it('다음 Take 를 만드는 모델은 바꾸지 않는다 — [영상 만들기]의 모델 줄 · 단추의 Take 값 · [다시 만들기] · 일괄은 지금처럼 Take 설정 → 샷 기본 모델이다', () => {
    // 왜: 리드 결정 ① — 보이는 이름만 맞춘다(② 안 함). 다음 Take 는 Take 에 고른 값 · 샷 설정 그대로(fb-video made-model-hydrate 시험과 같은 약속).
    expect(takeSettings({ provider: 'seedance' }, take(1, { madeModel: 'happy-horse' }).data).model).toBe('seedance')
    expect(readFileSync('src/features/camera/fix-panel.tsx', 'utf8')).toMatch(/const setup = takeSettings\(data, base\?\.data \?\? null\)/)
    expect(readFileSync('src/features/director/shot-detail/director-shot-detail.tsx', 'utf8')).toMatch(/const settings = takeSettings\(data, latestShotTake\(nodes, shotNodeId\)\?\.data \?\? null\)/)
  })
})
