// 사람이 고친 연출 장을 AI 가 읽은 한 줄이 있으면 영상 지시의 움직임은 그 줄이 정하고, 없으면 지시는 지금 그대로다 (오너 2026-11-22 Q4)
import { describe, expect, it } from 'vitest'
import { buildVideoPrompt, type BuildVideoPromptInput } from '@/lib/director/video-prompt'
import type { ShotDynamicSpec } from '@/lib/writer/types/pipeline'

const LINE = 'The mannequin turns, walks over and stands in the lower-right foreground, close to the camera.'
const DYNAMIC = { shot_id: 'sh_01', camera_motion: { type: 'dolly_in', speed: 'slow', magnitude: 'moderate' }, character_motion: [], motion_prompt: '' } as ShotDynamicSpec
const BASE: BuildVideoPromptInput = {
  prompt: 'Medium shot of Doyoon standing by a rusted locker in the rain',
  generationMethod: 'I2V',
  modelKey: 'seedance',
  durationSeconds: 5,
  dynamicSpec: DYNAMIC,
  dialogueLines: [{ text: 'Is this the one?', characterId: null }],
  camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 2 },
}
const MODES: Array<[string, Partial<BuildVideoPromptInput>]> = [
  ['start_end', { referenceImageRoles: ['start', 'end'] }],
  ['continue', { referenceImageRoles: ['start', 'end'], videoMode: 'continue' }],
  ['reference', { referenceImageRoles: ['ref', 'ref'], videoMode: 'reference', referenceLabels: ['character sheet: Mina', 'the location'] }],
  ['start_middle', { referenceImageRoles: ['start', 'direction'], videoMode: 'start_middle', middleSource: 'rough' }],
  ['start_prompt', { referenceImageRoles: ['start'], videoMode: 'start_prompt' }],
]

describe('같이 정한 것', () => {
  // 왜: 오너 Q4 "영상 지시에도 사용해줘" — 화살표를 고쳐도 영상이 옛 움직임을 따르던 것(D10)을 영상까지 잇는다. 방식은 가리지 않는다.
  it('고친 연출 장을 읽은 줄이 있으면 그 줄을 다섯 방식 모두의 영상 지시에 싣는다', () => {
    for (const [mode, extra] of MODES) {
      const { fullPrompt, prompt_parts } = buildVideoPrompt({ ...BASE, ...extra, directionLine: LINE })
      expect({ mode, has: fullPrompt.includes(LINE) }).toEqual({ mode, has: true })
      expect(prompt_parts.directionRead).toBe(LINE)
    }
  })

  // 왜: 정상 경로 고정(리드) — 읽은 줄이 없는(또는 낡아 null 인) 샷은 이 기능 전과 한 글자도 다르지 않아야 한다.
  it('읽은 줄이 없으면 영상 지시는 지금과 한 글자도 다르지 않다', () => {
    for (const modelKey of ['seedance', 'kling-o3', 'veo', 'happy-horse'] as const) {
      for (const [, extra] of MODES) {
        const input = { ...BASE, ...extra, modelKey, durationSeconds: modelKey === 'veo' ? 4 : 5 }
        expect(buildVideoPrompt({ ...input, directionLine: null })).toEqual(buildVideoPrompt(input))
      }
    }
  })
})

describe('혼자 정한 것', () => {
  // 왜: 고친 화살표와 샷 설계의 옛 움직임 글이 서로 다른 움직임을 시키면 모델이 어느 쪽도 제대로 따르지 않는다 —
  //   끝 그림(fb-end end-frame-plan)과 같은 원칙. 장면 글 · 대사 · 카메라 설정은 움직임과 다투지 않으니 그대로 둔다.
  it('읽은 줄이 있으면 영상의 움직임은 그 줄이 정한다 — 옛 움직임 계약은 싣지 않고 장면 글 · 대사 · 카메라는 그대로 둔다', () => {
    const { fullPrompt, prompt_parts } = buildVideoPrompt({ ...BASE, referenceImageRoles: ['start', 'end'], directionLine: LINE })

    expect(fullPrompt.startsWith(`Movement (from the edited direction sketch): ${LINE}`)).toBe(true)
    expect(fullPrompt).not.toContain('Motion contract')
    expect(prompt_parts.motionContract).toBeUndefined()
    expect(fullPrompt).toContain('Is this the one?')
    expect(fullPrompt).toContain('Medium shot of Doyoon standing by a rusted locker in the rain')
    expect(fullPrompt).toContain('Camera zooms')
  })

  // 왜: Kling · Happy Horse 는 글을 2500자까지만 받는다 — 줄이 잘리면 고친 연출이 사라진다. 줄이 맨 앞이라 넘치면 뒤쪽 글부터 잘린다.
  //   사람이 고친 줄이 지나치게 길면 다른 지시를 밀어내니 400자까지만 싣는다.
  it('글 상한이 있는 모델에서 읽은 줄은 잘리지 않고, 줄은 400자까지만 싣는다', () => {
    for (const modelKey of ['kling-o3', 'happy-horse'] as const) {
      const { fullPrompt } = buildVideoPrompt({
        ...BASE, modelKey, prompt: 'A long scene description. '.repeat(200),
        referenceImageRoles: ['start', 'direction'], videoMode: 'start_middle', middleSource: 'rough', directionLine: LINE,
      })
      expect(fullPrompt.length).toBeLessThanOrEqual(2500)
      expect(fullPrompt).toContain(LINE)
      expect(fullPrompt).toContain('follow the sketch')
    }
    const long = 'x'.repeat(900)
    expect(buildVideoPrompt({ ...BASE, directionLine: long }).prompt_parts.directionRead).toHaveLength(400)
  })

  // 왜: 읽은 줄은 그 미들 스케치를 글로 옮긴 것이다 — "글과 스케치가 다르면 스케치를 따르라"와 다투지 않으니 그 문장을 그대로 둔다.
  it('시작+미들에서도 읽은 줄을 싣고 스케치를 따르라는 문장은 그대로 둔다', () => {
    const { fullPrompt } = buildVideoPrompt({ ...BASE, referenceImageRoles: ['start', 'direction'], videoMode: 'start_middle', middleSource: 'rough', directionLine: LINE })

    expect(fullPrompt).toContain(LINE)
    expect(fullPrompt).toContain('If this text and the sketch disagree about the movement, follow the sketch.')
  })
})
