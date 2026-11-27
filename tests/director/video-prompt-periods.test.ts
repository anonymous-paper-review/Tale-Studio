// 실사 그림체가 아닌 영상 지시문은 문장 끝으로 끝난 조각 뒤에 마침표를 또 붙이지 않는다 — 실사 그림체 지시문은 이 고침과 상관없다 (오너 2026-11-27 3차 "고쳐줘")
import { describe, expect, it } from 'vitest'
import { buildVideoPrompt, type BuildVideoPromptInput } from '@/lib/director/video-prompt'

const ZERO = { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }
const DYN = {
  shot_id: 'sh',
  camera_motion: { type: 'dolly_in', speed: 'slow', direction: 'forward', magnitude: 'minimal' },
  character_motion: [{ character_id: 'a', verb: 'turns her head', magnitude: 'small' }],
  motion_prompt: 'The camera pushes in on Mina as she turns.',
}
/** 실사가 아닌 길에서 서버가 넘기는 샷 영상 한 건(tests/fixtures/other-style-cases.mjs 와 같은 모양) — 시작+프롬프트, 렌즈 줄 있음. */
const SHOT = {
  prompt: 'A woman sits.', camera: { ...ZERO, zoom: 3 }, cameraPreset: { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 },
  generationMethod: 'I2V', modelKey: 'seedance', durationSeconds: 5, startEndReference: false, dynamicSpec: DYN,
  dialogueLines: null, dialogueSpeakers: null, characterNames: null, referenceImageRoles: ['start'], videoMode: 'start_prompt', referenceLabels: null,
} as unknown as BuildVideoPromptInput
const doubled = (text: string) => text.match(/[.!?…]["'”’)]*\.(?!\.)/gu) ?? []

describe('같이 정한 것', () => {
  // 왜: 실사가 아닌 길은 조각을 ". "로 이어 "…the scene description that follows.. A woman sits.. shot on Arri"처럼 마침표가 둘 붙었다(오너 11/27 3차 "고쳐줘").
  //   움직임 약속 · 읽은 줄 · 바꿀 점 · 대사 · 샷 글 · 글만 영상 어느 조각이 마침표로 끝나도 같다.
  it('실사 그림체가 아니면 영상 지시문의 조각 사이에 마침표가 겹치지 않는다', () => {
    const cases: Array<[string, BuildVideoPromptInput]> = [
      ['움직임 약속 + 샷 글', SHOT],
      ['읽은 줄', { ...SHOT, directionLine: 'The woman turns away from the window and walks toward the camera.' }],
      ['바꿀 점', { ...SHOT, change: 'Make her turn slower.' }],
      ['대사', { ...SHOT, dialogueLines: [{ text: 'Hello.', delivery: 'softly', characterId: 'a' }], dialogueSpeakers: { a: { name: 'Mina', appearance: 'A tall woman.' } } }],
      ['글만 영상', { prompt: 'A bench at dusk.', camera: { ...ZERO, tilt: 5 }, cameraPreset: null, generationMethod: 'T2V', modelKey: 'seedance', durationSeconds: 5 } as BuildVideoPromptInput],
    ]
    for (const [name, parts] of cases) expect({ name, doubled: doubled(buildVideoPrompt(parts).fullPrompt) }).toEqual({ name, doubled: [] })
    expect(buildVideoPrompt(SHOT).fullPrompt).toContain('A woman sits. shot on Arri Alexa, 35mm, f/2.8, white balance 5600K')
  })
})

describe('혼자 정한 것', () => {
  // 왜: 실사 그림체 길과 같은 문장 끝 규칙이다 — 물음표 · 느낌표 · 말줄임 · 따옴표 안 마침표로 끝난 조각 뒤에 "."를 또 붙이면 "?." · "\".\"."가 된다.
  //   마침표 말고는 글자를 바꾸지 않는다(조각 앞뒤 빈칸 · 다른 글은 그대로).
  it('실사 그림체가 아니면 물음표 · 느낌표 · 말줄임 · 따옴표로 끝난 조각 뒤에도 마침표를 또 붙이지 않고 다른 글자는 그대로 둔다', () => {
    expect(buildVideoPrompt({ ...SHOT, prompt: 'She says "stop."' }).fullPrompt).toContain('She says "stop." shot on Arri Alexa')
    expect(buildVideoPrompt({ ...SHOT, prompt: 'Is she leaving?' }).fullPrompt).toContain('Is she leaving? shot on Arri Alexa')
    expect(buildVideoPrompt({ ...SHOT, prompt: 'She waits...' }).fullPrompt).toContain('She waits... shot on Arri Alexa')
    // 마침표로 끝나지 않은 조각 사이는 지금처럼 ". "로 잇는다.
    expect(buildVideoPrompt({ ...SHOT, prompt: 'A woman sits' }).fullPrompt).toContain('A woman sits. shot on Arri Alexa')
  })
})
