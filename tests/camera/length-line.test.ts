// Cinema [영상 만들기] 칸에도 샷 길이와 영상 길이가 다르면 샷 상세 영상 탭과 같은 판정 · 같은 말로 길이 바뀜 한 줄이 보이는지 검사한다 (fb-video QA 발견 2 · 리드 2026-11-23)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { VIDEO_MODELS, clampDuration } from '@/lib/video-models'
import { translate } from '@/lib/i18n/translate'

describe('같이 정한 것(리드 11/23)', () => {
  it('Cinema [영상 만들기] 칸에도 샷 길이와 영상 길이가 다르면 샷 상세 영상 탭과 같은 길이 바뀜 한 줄("샷 3초 → 영상 4초")을 보인다', () => {
    // 왜: Seedance 는 최소 4초라 3초 샷도 4초 영상이 나오고 값도 4초로 드는데, Cinema 칸에는 그 안내가 없었다(fb-video QA 발견 2, 복사본 8cee779e 씬 3 샷 7 · 8).
    const seconds = clampDuration(VIDEO_MODELS.seedance, 3)
    expect(seconds).toBe(4)
    expect(translate('ko', 'Length: shot {shot}s → video {video}s', { shot: 3, video: seconds })).toBe('길이 샷 3초 → 영상 4초')
    // 판정 · 말은 샷 상세 영상 탭과 같다 — 같은 함수 · 같은 열쇠, 칸이 이어받은 모델(setup.model)로 잰다.
    const tab = readFileSync('src/features/director/shot-detail/shot-video-tab.tsx', 'utf8')
    expect(tab).toContain("t('Length: shot {shot}s → video {video}s', { shot: data.durationSeconds, video: videoSeconds })")
    const panel = readFileSync('src/features/camera/fix-panel.tsx', 'utf8')
    expect(panel).toMatch(/const videoSeconds = clampDuration\(VIDEO_MODELS\[setup\.model\], data\.durationSeconds\)/)
    expect(panel).toMatch(/\{videoSeconds !== data\.durationSeconds \? \(\s*<p className="text-micro text-warning">\{t\('Length: shot \{shot\}s → video \{video\}s', \{ shot: data\.durationSeconds, video: videoSeconds \}\)\}<\/p>\s*\) : null\}/)
  })
})
