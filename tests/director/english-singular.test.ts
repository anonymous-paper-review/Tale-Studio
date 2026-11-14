// Director 본 화면의 영어 글은 수가 1이면 단수로 쓴다 — 1 image · 1 shot · Making 1 video (리드 11/14 답 2)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n/translate'
import { countText } from '@/lib/i18n/count-text'
import { makingLabel, workEstimateText } from '@/lib/director/toolbar-work'
import { describeVideoBatchPlan, planVideoBatch } from '@/lib/director/video-batch-plan'
import { directorCanvasMeta, storyboardCanvasMeta } from '@/features/director/canvas-meta'
import type { DirectorNode } from '@/types/director'

const en = (text: string, params?: Record<string, string | number>) => translate('en', text, params)
const ko = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)
const node = (id: string, kind: string, extra: Record<string, unknown> = {}): DirectorNode =>
  ({ id, type: kind, position: { x: 0, y: 0 }, data: { kind, label: id, ...extra } }) as unknown as DirectorNode

describe('영어 단수', () => {
  it('예상 칸은 수가 1이면 "1 image" · "1 video" · "1 Take"로 쓰고, 한국어는 지금 그대로다', () => {
    // 왜: "1 images · about 2 min"처럼 읽혔다(리드 11/14 답 2).
    const base = { videoTakes: 0, takesShown: true, making: false }
    expect(workEstimateText({ ...base, images: 1, videoModels: [] }, en)).toBe('1 image · about 2 min · No Takes used')
    expect(workEstimateText({ ...base, images: 0, videoModels: ['happy-horse'], videoTakes: 1 }, en)).toBe('1 video · about 2 min · 1 Take')
    expect(workEstimateText({ ...base, images: 0, videoModels: ['seedance'], videoTakes: 5 }, en)).toBe('1 video · about 3 min · 5 Takes')
    expect(workEstimateText({ ...base, images: 1, videoModels: ['seedance'], videoTakes: 5, chain: true }, en)).toBe('1 image · 1 video · about 5 min · 5 Takes')
    expect(workEstimateText({ ...base, images: 0, videoModels: ['seedance'], videoTakes: 5 }, ko)).toBe('영상 1개 · 약 3분 · Takes 5')
    expect(workEstimateText({ ...base, images: 1, videoModels: ['seedance'], videoTakes: 5, chain: true }, ko)).toBe('이미지 1장 · 영상 1개 · 약 5분 · Takes 5')
  })

  it('만드는 중 진행 글은 수가 1이면 "Making 1 image" · "Making 1 video"로 쓴다', () => {
    // 왜: "Making 1 videos"로 읽혔다.
    expect(makingLabel(1, 0, en)).toBe('Making 1 image')
    expect(makingLabel(0, 1, en)).toBe('Making 1 video')
    expect(makingLabel(2, 1, en)).toBe('Making 2 images · 1 video')
    expect(makingLabel(2, 2, ko)).toBe('이미지 2장 · 영상 2개 만드는 중')
    expect(makingLabel(0, 2, ko)).toBe('영상 2개 만드는 중')
  })

  it('전체 체크 줄 · The Set 옆 개수는 수가 1이면 단수로 쓴다', () => {
    // 왜: "All 1 shots" · "1 scenes · 1 shots"로 읽혔다.
    expect(countText(en, 1, 'All 1 shot', 'All {count} shots', { count: 1 })).toBe('All 1 shot')
    expect(countText(en, 3, 'All 1 shot', 'All {count} shots', { count: 3 })).toBe('All 3 shots')
    expect(readFileSync('src/features/director/shot-status.tsx', 'utf8')).toContain("countText(t, total, 'All 1 shot', 'All {count} shots', { count: total })")
    const one = [node('scene-1', 'scene'), node('s1', 'shot', { durationSeconds: 5 })]
    expect(storyboardCanvasMeta(one, en)).toBe('1 scene · 1 shot · 5s')
    expect(storyboardCanvasMeta(one, ko)).toBe('씬 1 · 샷 1 · 5초')
    expect(directorCanvasMeta([node('a', 'asset'), node('s1', 'shot')], en)).toBe('2 nodes · 1 shot')
    expect(directorCanvasMeta([node('s1', 'shot')], en)).toBe('1 node · 1 shot')
  })

  it('확인 창 · 알림 글도 수가 1이면 단수로 쓴다', () => {
    // 왜: "Make 1 images again?" · "1 videos didn't start because their images…"로 읽혔다.
    const page = readFileSync('src/app/studio/director/page.tsx', 'utf8')
    expect(page).toContain("countText(t, imageMode.shotIds.length, 'Make 1 image again?', 'Make {count} images again?'")
    expect(page).toContain("'Remakes the image for the 1 picked shot. No Takes are used.'")
    expect(page).toContain("countText(t, imageWork.length, 'Makes 1 image, and its video starts by itself when the image is done.'")
    expect(page).toContain(`countText(t, missed.length, "1 video didn't start because its image wasn't made."`)
    expect(ko('Make 1 image again?')).toBe('이미지 1장을 다시 만들까요?')
    expect(ko('Remakes the image for the 1 picked shot. No Takes are used.')).toBe('고른 샷 1개의 이미지를 다시 만들어요. Takes 는 쓰지 않아요.')
    expect(ko('Makes 1 image, and its video starts by itself when the image is done.')).toBe('이미지 1장을 만들고, 이미지가 끝나면 영상이 저절로 시작돼요.')
    expect(ko("1 video didn't start because its image wasn't made.")).toBe('이미지를 못 만들어 영상 1개는 시작하지 않았어요')
  })

  it('영상 확인 창의 영어는 1개일 때 단수다', () => {
    // 왜: 영어 재점검 S2 — "Generate videos for 1 eligible shots." · "Costs money for every generated video: 1 videos."로 읽혔다(main 부터 있던 글).
    //   한국어는 그대로다.
    const page = readFileSync('src/app/studio/director/page.tsx', 'utf8')
    expect(countText(en, 1, 'Generate a video for 1 eligible shot.', 'Generate videos for {count} eligible shots.', { count: 1 })).toBe('Generate a video for 1 eligible shot.')
    expect(countText(en, 1, 'Costs money for every generated video: 1 video.', 'Costs money for every generated video: {count} videos.', { count: 1 })).toBe('Costs money for every generated video: 1 video.')
    expect(page).toContain("countText(t, videoPlan.total, 'Generate a video for 1 eligible shot.', 'Generate videos for {count} eligible shots.', { count: videoPlan.total })")
    expect(page).toContain("countText(t, videoPlan.runCount, 'Costs money for every generated video: 1 video.', 'Costs money for every generated video: {count} videos.', { count: videoPlan.runCount })")
    expect(page).toContain("countText(t, chainPlan.total, 'Costs money for every generated video: 1 video.', 'Costs money for every generated video: {count} videos.', { count: chainPlan.total })")
    expect(ko('Generate a video for 1 eligible shot.')).toBe(ko('Generate videos for {count} eligible shots.', { count: 1 }))
    expect(ko('Costs money for every generated video: 1 video.')).toBe(ko('Costs money for every generated video: {count} videos.', { count: 1 }))
  })

  it('영상 확인 창 본문 끝 줄도 1개면 자연스러운 단수다', () => {
    // 왜: 영어 재점검(qa-golden f19330d7) S2b — 과금을 아직 막지 않을 때 영상 1개면 "…so all 1 will be generated."로 읽혔다.
    //   Take 로 1개만 만들 수 있을 때도 "The first 1 will be generated."였다. 한국어는 그대로다.
    const shadowOne = planVideoBatch([5], 3, 'shadow')
    expect(describeVideoBatchPlan(shadowOne, en)[1]).toBe('Takes are short by 2. Billing is not enforced yet, so it will be generated.')
    expect(describeVideoBatchPlan(planVideoBatch([5, 5], 3, 'shadow'), en)[1]).toBe('Takes are short by 7. Billing is not enforced yet, so all 2 will be generated.')
    const enforceOne = planVideoBatch([5, 5, 5], 6, 'enforce')
    expect(describeVideoBatchPlan(enforceOne, en)[1]).toBe('Only 1 of 3 videos can be made with your Takes. The first one will be generated.')
    expect(describeVideoBatchPlan(planVideoBatch([5, 5, 5, 5], 10, 'enforce'), en)[1]).toBe('Only 2 of 4 videos can be made with your Takes. The first 2 will be generated.')
    // 한국어는 그대로 — 1개여도 지금 글과 같다.
    expect(describeVideoBatchPlan(shadowOne, ko)[1]).toBe('Take가 2개 모자라요. 아직 차감을 막지 않아 1개 모두 만들어요.')
    expect(describeVideoBatchPlan(enforceOne, ko)[1]).toBe('Take가 모자라 3개 중 1개만 만들 수 있어요. 앞에서부터 1개를 만들어요.')
  })
})
