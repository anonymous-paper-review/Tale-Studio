// 영상을 만든 뒤 그 샷 대사가 바뀌면 Cinema 의 Take 판(★ 최종이면 샷 줄에도)에 "대사가 바뀌었어요. 다시 만들면 맞아요."가 보이고, 막지는 않는지 검사한다 (오너 2026-11-22 E3 · fb-video 대사 지문 계약)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { finalTakeDialogueChanged, shotHistory, type HistoryEntry } from '@/features/camera/shot-history'
import { dialogueFingerprint } from '@/lib/director/dialogue-fingerprint'
import { translate } from '@/lib/i18n/translate'
import type { ShotDetailTake } from '@/lib/director/shot-detail'
import type { VideoNodeData } from '@/types/director'

const OLD = [{ characterId: 'c1', text: '마지막... 하나 남았어.', emotion: 'tired', delivery: 'whisper' }]
const NEW = [{ characterId: 'c1', text: '마지막 하나야.', emotion: 'tired', delivery: 'whisper' }]
const take = (n: number, extra: Partial<VideoNodeData> = {}): ShotDetailTake => ({
  id: `t${n}`,
  data: {
    kind: 'video', label: `take_v${n}`, takeNumber: n, parentShotNodeId: 's1', videoClipId: `c${n}`, generationJobId: `j${n}`,
    status: 'completed', lastAttemptStatus: 'completed', videoUrl: `https://x/${n}.mp4`, thumbnailUrl: null, final: false,
    createdAt: `2026-11-22T10:0${n}:00Z`, lastAttemptAt: `2026-11-22T10:0${n}:00Z`, cancelledAt: null, override: {},
    madeDialogueFingerprint: dialogueFingerprint(OLD), ...extra,
  } as unknown as VideoNodeData,
})
const history = (takes: ShotDetailTake[], final: { id: string; auto: boolean } | null, dialogueLines: typeof OLD | undefined) =>
  shotHistory({ image: null, takes, final, shot: { provider: 'seedance' }, dialogueLines })
const flags = (entries: HistoryEntry[]) => entries.flatMap((entry) => (entry.kind === 'take' ? [entry.dialogueChanged] : []))
const card = () => readFileSync('src/features/camera/history-card.tsx', 'utf8')
const row = () => readFileSync('src/features/camera/shot-row.tsx', 'utf8')

describe('대사 바뀜 표시', () => {
  it('영상을 만든 뒤 그 샷 대사(화자 · 글)가 바뀌면 그 Take 판에 "대사가 바뀌었어요. 다시 만들면 맞아요."가 보인다', () => {
    // 왜: 오너 E3 — 영상 속 말은 만들 때의 대사 그대로인데 Editor 자막은 지금 대사를 따른다. 다시 만들면 맞는다는 것을 판에서 알린다.
    expect(flags(history([take(1)], { id: 't1', auto: true }, NEW))).toEqual([true])
    expect(translate('ko', 'The dialogue changed. Make a new Take to match.')).toBe('대사가 바뀌었어요. 다시 만들면 맞아요.')
    expect(card()).toMatch(/entry\.kind === 'take' && entry\.dialogueChanged \?/)
    expect(card()).toContain("t('The dialogue changed. Make a new Take to match.')")
  })

  it('그 Take 가 ★ 최종 Take(고르지 않았으면 가장 새 완성 Take)이면 샷 줄에도 같은 한 줄이 보인다', () => {
    // 왜: 오너 E3 — ★ 최종이 Editor 로 가는 영상이다. 판을 옆으로 넘기지 않아도 샷 줄에서 바로 보인다.
    expect(finalTakeDialogueChanged(history([take(1), take(2)], { id: 't2', auto: true }, NEW))).toBe(true)
    expect(finalTakeDialogueChanged(history([take(1), take(2, { madeDialogueFingerprint: dialogueFingerprint(NEW) })], { id: 't2', auto: false }, NEW))).toBe(false)
    expect(row()).toMatch(/finalTakeDialogueChanged\(entries\) \?/)
  })

  it('대사가 그대로거나, 지문 기록이 없는 옛 Take · 다시 만드는 중 · 재시도가 실패한 동안에는 아무것도 보이지 않는다', () => {
    // 왜: 오너 E3 "기록이 없는 옛 Take 에는 표시하지 않는다" · 리드 계약 — 모르는 것은 바뀐 것으로 말하지 않는다('unknown').
    expect(flags(history([take(1)], { id: 't1', auto: true }, OLD))).toEqual([false])
    expect(flags(history([take(1, { madeDialogueFingerprint: null })], { id: 't1', auto: true }, NEW))).toEqual([false])
    // 어조 · 말투만 바뀐 것은 대사 바뀜이 아니다(fb-video 지문 규칙).
    expect(flags(history([take(1)], { id: 't1', auto: true }, [{ ...OLD[0]!, emotion: 'angry', delivery: 'shout' }]))).toEqual([false])
    // 화면이 그 샷의 대사를 모르면(Writer 샷이 없는 손으로 더한 샷) 묻지 않는다.
    expect(flags(history([take(1)], { id: 't1', auto: true }, undefined))).toEqual([false])
  })

  it('알리기만 하고 막지 않는다 — [영상 만들기] · ★ 고르기 · [다음: Director] 는 그대로다', () => {
    // 왜: 오너 E3 "막지는 않는다" — 대사만 고친 뒤 그대로 넘길지는 사람이 정한다.
    expect(readFileSync('src/features/camera/new-take.ts', 'utf8')).not.toMatch(/dialogue/i)
    expect(readFileSync('src/features/camera/work-bar.tsx', 'utf8')).not.toMatch(/dialogueChanged|DialogueChanged/)
    expect(card()).not.toMatch(/disabled=\{[^}]*dialogueChanged/)
  })
})
