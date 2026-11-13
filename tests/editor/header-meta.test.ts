// Editor 위 둘째 줄 시퀀스 정보의 길이와 프로젝트 판 샷 줄의 영상 상태 낱말을 검사한다 — 예전 화면 머리 "컷 7 · 33초 · 영상 0/7"의 길이를 이 줄로 옮겼다 (v3 ED1 2026-11-03 → 2단계 ① 새 배치, 리드 2026-11-14)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  ;(globalThis as { window?: unknown }).window = globalThis
})
vi.mock('@/stores/project-store', () => ({
  useProjectStore: Object.assign((pick: (s: { projectId: string | null }) => unknown) => pick({ projectId: 'project-header' }), {
    getState: () => ({ projectId: 'project-header' }),
  }),
}))

import { ProjectPanel } from '@/features/editor/video-source-panel'
import { sequenceInfoLine, sequenceLengthSec } from '@/lib/editor/sequence-info'
import { useEditorStore } from '@/stores/editor-store'
import { useLocaleStore } from '@/stores/locale-store'
import type { Shot, VideoClip } from '@/types'

const read = (file: string) => readFileSync(file, 'utf8')
const shot = (shotId: string): Shot =>
  ({ shotId, sceneId: 'sc_1', shotType: 'MS', actionDescription: '', characters: [], durationSeconds: 4, generationMethod: 'T2V', dialogueLines: [], camera: {}, lighting: {}, referenceImageUrl: null }) as unknown as Shot
/** 정적 렌더는 스토어의 처음 값을 읽는다 — 지금 값을 처음 값으로 옮겨 그린다(tests/editor/panels.test.ts 와 같은 방법). */
function html(el: ReturnType<typeof createElement>) {
  for (const store of [useLocaleStore, useEditorStore] as Array<{ getState: () => object; getInitialState: () => object }>) Object.assign(store.getInitialState(), store.getState())
  return renderToStaticMarkup(el)
}
const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

beforeEach(() => {
  useLocaleStore.setState({ locale: 'ko' })
  useEditorStore.getState().reset()
})
afterEach(() => {
  useLocaleStore.setState({ locale: 'en' })
})
const item = (shotId: string, startSec: number, durationSec: number) => ({ shotId, startSec, durationSec })
const sound = (startSec: number, durationSec: number) => ({ startSec, durationSec })
/** 위 둘째 줄 "00:00:33:00 · 1280×720 · 30fps"의 길이 칸. */
const lengthShown = (layout: ReturnType<typeof item>[], audio: ReturnType<typeof sound>[] = []) =>
  sequenceInfoLine(sequenceLengthSec(layout, audio), 'horizontal_16:9').split(' · ')[0]

describe('혼자 정한 것', () => {
  // 왜: 위 둘째 줄 시퀀스 정보(시안 E1 409:4639) — 예전 화면 머리의 "N초"를 옮긴 자리. 정상 경로 고정.
  it('컷 7개가 33초 동안 이어지면 위 둘째 줄 시퀀스 정보의 길이는 "00:00:33:00"이다', () => {
    const lengths = [5, 3, 6, 3, 3, 6, 7]
    let at = 0
    const layout = lengths.map((sec, i) => {
      const it = item(`shot-${i + 1}`, at, sec)
      at += sec
      return it
    })
    expect(lengthShown(layout)).toBe('00:00:33:00')
  })

  // 왜: 타이틀 카드도 시퀀스의 한 컷이다. 시:분:초:장으로 쓰므로 예전 "N초"처럼 초 단위로 반올림하지 않는다 — 내보낸 영상의 장 수와 같다.
  it('타이틀 카드도 시퀀스 길이에 들고, 길이는 반올림하지 않고 장까지 쓴다', () => {
    const layout = [item('title__tabc', 0, 2.4), item('shot-1', 2.4, 4.3), item('shot-2', 6.7, 3.1)]
    expect(lengthShown(layout)).toBe('00:00:09:24')
  })

  // 왜: 검토 c 낮음 4(자유 배치, 2026-11-14) — 빈 곳도 영상 줄의 시간이다. 클립 길이만 더하면 내보낸 영상보다 짧게 보였다.
  it('빈 곳이 있으면 시퀀스 정보의 길이는 빈 곳까지 센 영상 줄 끝이다', () => {
    expect(lengthShown([item('shot-1', 0, 4), item('shot-2', 8, 4)])).toBe('00:00:12:00')
  })

  // 왜: 시퀀스 정보는 크기 · 장 수와 늘 함께 보인다 — 빈 시퀀스의 길이 0 은 고장이 아니라 빈 것이다(예전 머리의 "컷 0 · 0초"와 다르다).
  it('타임라인에 컷이 없으면 시퀀스 정보의 길이는 "00:00:00:00"이다', () => {
    expect(lengthShown([])).toBe('00:00:00:00')
  })

  // 왜: 2단계 ② 줄 여러 개 — 시퀀스 길이는 눈 끈 줄 · 음소거 줄까지 모든 줄과 소리의 마지막 끝이고, 자 · 모니터 · 재생 끝 · 내보내기가
  //   같은 길이를 쓴다(검토 c ② 낮음 4 — tests/editor/tracks.test.ts 시퀀스 길이). 위 둘째 줄만 다르면 길이를 믿을 수 없다.
  it('V2 클립이나 소리가 V1 보다 늦게 끝나면 시퀀스 정보의 길이는 그 끝까지다', () => {
    expect(lengthShown([item('shot-1', 0, 4), item('shot-2', 10, 4)])).toBe('00:00:14:00')
    expect(lengthShown([item('shot-1', 0, 4)], [sound(2, 15)])).toBe('00:00:17:00')
    expect(read('src/app/studio/editor/page.tsx')).toMatch(/sequenceInfoLine\(sequenceLengthSec\(\[\.\.\.timelineLayout, \.\.\.overlayLayout\], audioClips\), projectFormat\)/)
  })

  // 왜: 프로젝트 판(예전 소스 카드)이 영상 상태를 영어 원문(pending · completed)으로 보이고 있었다. ED1 시안은 "대기"처럼 한국어 낱말이다.
  //   영상이 있는 샷은 낱말 대신 시안 E1 409:4757 의 "V · 04:00" — 그래서 "완료"는 줄에 나오지 않는다(검토 c, 2026-11-14).
  it('프로젝트 판의 샷 줄은 영상이 있으면 "V · 길이"를, 영상이 없으면 생성 중 · 실패 · 대기 중 낱말을 보인다', () => {
    const clips: VideoClip[] = [
      { shotId: 'A', url: 'https://video.test/A.mp4', status: 'completed', thumbnailUrl: null },
      { shotId: 'B', url: null, status: 'generating', thumbnailUrl: null },
      { shotId: 'C', url: null, status: 'failed', thumbnailUrl: null },
      { shotId: 'D', url: null, status: 'pending', thumbnailUrl: null },
    ]
    const markup = text(html(createElement(ProjectPanel, {
      shots: ['A', 'B', 'C', 'D'].map(shot), videoClips: clips, audioSources: [], newItems: [],
      onOpenSource: () => {}, onAddClip: () => {}, onAddClipAtPlayhead: () => {}, onAddAudioFromSource: () => {},
      onAddAudioSource: () => {}, onRemoveAudioSource: () => {}, onBinDragStart: () => {}, onBinDragEnd: () => {}, onSetBinDropSec: () => {},
    })))
    expect(markup).toMatch(/샷 1 · MS V · 04:00/)
    expect(markup).toMatch(/샷 2 · MS 생성 중/)
    expect(markup).toMatch(/샷 3 · MS 실패/)
    expect(markup).toMatch(/샷 4 · MS 대기 중/)
    expect(markup).not.toContain('완료')
  })
})
