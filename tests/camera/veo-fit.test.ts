// Veo 는 16:9 · 9:16 프로젝트에서만 고를 수 있어, 그 밖의 비율이면 샷 상세의 모델 고르기에서 Veo 가 까닭과 함께 꺼지고, 이어받은 모델이 Veo 면 Cinema [영상 만들기]도 꺼지는지 검사한다 (오너 V3 · fb-video videoModelFitsAspectRatio)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { newTakeButton } from '@/features/camera/new-take'
import { VIDEO_MODEL_ASPECT_TEXT, videoModelFitsAspectRatio } from '@/lib/video-models'
import { translate } from '@/lib/i18n/translate'

const ready = { hasImage: true, imageBusy: false, takeMaking: false, batchBusy: false, sending: false, hasTake: true, imageChanged: false }

describe('V3 — Veo 화면비', () => {
  it('Veo 는 16:9 · 9:16 프로젝트에서만 고를 수 있다 — 그 밖의 비율이면 샷 상세의 모델 고르기에서 Veo 가 꺼지고 까닭이 한 줄 보인다', () => {
    // 왜: 오너 V3 — Veo 3.1 은 가로 · 세로 영상만 만든다. 고를 수 없게 하고 왜인지 알린다(서버도 409 model_aspect_unsupported).
    expect([videoModelFitsAspectRatio('veo', '16:9'), videoModelFitsAspectRatio('veo', '9:16'), videoModelFitsAspectRatio('veo', '1:1')]).toEqual([true, true, false])
    const tab = readFileSync('src/features/director/shot-detail/shot-video-tab.tsx', 'utf8')
    expect(tab).toMatch(/disabled=\{!videoModelFitsAspectRatio\(key, aspectRatio\)\}/)
    expect(tab).toMatch(/\{blockedModels\.length > 0 \? <p[^>]*>\{t\(VIDEO_MODEL_ASPECT_TEXT\)\}<\/p> : null\}/)
    expect(translate('ko', VIDEO_MODEL_ASPECT_TEXT)).toBe('Veo 3.1 은 가로(16:9) · 세로(9:16) 영상만 만들어요. 이 프로젝트에서는 다른 모델을 골라 주세요.')
  })

  it('샷 상세에서 이어받은 모델이 Veo 인데 비율이 맞지 않으면 [새 Take 만들기]도 꺼진다', () => {
    // 왜: 고른 채 남은 Veo 로 누르면 서버가 거절한다 — Take 를 쓰기 전에 화면이 막는다.
    expect(readFileSync('src/features/director/shot-detail/shot-video-tab.tsx', 'utf8')).toMatch(/const modelBlocked = !videoModelFitsAspectRatio\(provider, aspectRatio\)/)
  })

  it('Cinema [영상 만들기]는 이어받은 모델이 Veo 인데 프로젝트가 16:9 · 9:16 이 아니면 꺼지고 "…다른 모델을 골라 주세요. 상세에서 모델을 바꿔요."가 보인다', () => {
    // 왜: 리드 승인 — Cinema 칸에는 모델 고르기가 없어 어디서 푸는지 알려야 한다(⤢ 상세).
    expect(newTakeButton({ ...ready, modelFits: false })).toMatchObject({ disabled: true, reason: VIDEO_MODEL_ASPECT_TEXT })
    expect(newTakeButton({ ...ready, modelFits: true })).toMatchObject({ disabled: false, reason: null })
    expect(translate('ko', 'Change the model in Details.')).toBe('상세에서 모델을 바꿔요.')
    const panel = readFileSync('src/features/camera/fix-panel.tsx', 'utf8')
    expect(panel).toMatch(/modelFits: videoModelFitsAspectRatio\(setup\.model, aspectRatio\)/)
    expect(panel).toContain("t('Change the model in Details.')")
  })
})
