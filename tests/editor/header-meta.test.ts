// Editor 화면 머리의 "컷 7 · 33초 · 영상 0/7"과 소스 카드 · 미리 보기의 영상 상태 낱말을 검사한다 (v3 ED1, 2026-11-03)
import { describe, expect, it } from 'vitest'
import { clipStatusLabel, editorHeaderMeta } from '@/features/editor/editor-labels'
import { translate } from '@/lib/i18n/translate'
import type { VideoClip } from '@/types'

const ko = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)
const clip = (shotId: string, url: string | null): VideoClip => ({ shotId, url, status: url ? 'completed' : 'pending', thumbnailUrl: null })
const item = (shotId: string, startSec: number, durationSec: number) => ({ shotId, startSec, durationSec })

describe('혼자 정한 것', () => {
  // 왜: ED1 시안의 화면 머리 — 타임라인에 놓인 컷 수 · 전체 길이 · 영상이 생긴 컷 수를 한눈에 본다. 정상 경로 고정.
  it('타임라인에 컷 7개 · 33초 · 영상이 하나도 없으면 머리에 "컷 7 · 33초 · 영상 0/7"이라고 쓴다', () => {
    const lengths = [5, 3, 6, 3, 3, 6, 7]
    let at = 0
    const layout = lengths.map((sec, i) => {
      const it = item(`shot-${i + 1}`, at, sec)
      at += sec
      return it
    })
    const clips = layout.map((l) => clip(l.shotId, null))
    expect(editorHeaderMeta(layout, clips, ko)).toBe('컷 7 · 33초 · 영상 0/7')
  })

  // 왜: 타이틀 카드는 타임라인의 한 컷이지만 영상을 만들 수 없다 — "영상 a/b"의 b 에 넣으면 영영 다 채울 수 없는 숫자가 된다.
  //   길이는 트림 · 속도를 반영한 소수가 나오므로 초 단위로 반올림한다.
  it('타이틀 카드는 컷으로 세지만 영상이 필요한 컷에는 넣지 않고, 길이는 초 단위로 반올림한다', () => {
    const layout = [item('title__tabc', 0, 2.4), item('shot-1', 2.4, 4.3), item('shot-2', 6.7, 3.1)]
    const clips = [clip('shot-1', 'https://media.test/1.mp4'), clip('shot-2', null)]
    expect(editorHeaderMeta(layout, clips, ko)).toBe('컷 3 · 10초 · 영상 1/2')
  })

  // 왜: 타임라인이 비어 있으면(모든 클립을 숨긴 경우) 숫자 대신 빈칸 — "컷 0 · 0초"는 고장처럼 읽힌다.
  it('타임라인에 컷이 없으면 머리에 숫자를 쓰지 않는다', () => {
    expect(editorHeaderMeta([], [], ko)).toBeNull()
  })

  // 왜: 소스 카드가 영상 상태를 영어 원문(pending · completed)으로 보이고 있었다. ED1 시안은 "5초 · 대기"처럼 한국어 낱말이다.
  it('소스 카드는 영상 상태를 완료 · 생성 중 · 실패 · 대기 중 낱말로 보인다', () => {
    expect((['completed', 'generating', 'failed', 'pending'] as const).map((s) => ko(clipStatusLabel(s)))).toEqual([
      '완료', '생성 중', '실패', '대기 중',
    ])
  })
})
