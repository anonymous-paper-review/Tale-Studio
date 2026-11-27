// 실사 그림체(aligned) 영상 지시문 고정 입력 — lib/director/video-submit.ts 가 실사 길에서 buildVideoPrompt 에 넘기는 모양(2026-11-27 main).
//   기대값은 real-video-prompts.json, 시험은 tests/director/real-video-prompts.test.ts(검토 rev-video 3 낮음 4 — 실사 지시문이 한 글자도 안 바뀌는지 지킨다).
const ZERO = { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }
const ARRI = { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 }
const DYN = {
  shot_id: 'sh',
  camera_motion: { type: 'dolly_in', speed: 'slow', direction: 'forward', magnitude: 'minimal' },
  character_motion: [{ character_id: 'a', verb: 'turns her head', magnitude: 'small' }],
  gaze_arc: [{ character_id: 'a', from: 'down', to: 'window' }],
  motion_prompt: 'The camera pushes in on Mina as she turns.',
}
/** 샷 영상 한 건 — 시작+프롬프트(기본) · 실사 시작 한 장 · 대사 없음. 실사 길은 카메라 · 렌즈 · 이름 칸(aligned)을 함께 넘긴다. */
const shot = (over) => ({
  prompt: 'A woman sits by the window.', camera: { ...ZERO, zoom: 3 }, cameraPreset: ARRI, generationMethod: 'I2V', modelKey: 'seedance', durationSeconds: 5,
  startEndReference: false, dialogueLines: null, dialogueSpeakers: null, characterNames: null,
  referenceImageRoles: ['start'], videoMode: 'start_prompt', referenceLabels: null, aligned: true, ...over,
})

export function REAL_VIDEO_CASES() {
  return {
    // 설계 없음 — 실사인데 움직임 약속 · 읽은 줄이 없는 드문 길(조각을 ". "로 잇는 길 — 실사 아닌 길의 겹마침표 고침 밖).
    'real/no-design': shot({ dynamicSpec: null, designCamera: null, designAngle: null, gearDesign: null, subjects: null, fallbackContract: false }),
    // 설계 길 — 움직임 약속 · 설계 렌즈와 빛 · 인물 이름(서버 실사 길의 흔한 모양).
    'real/design': shot({
      dynamicSpec: DYN, designCamera: { ...ZERO, zoom: 3 }, designAngle: null, gearDesign: { lensMm: 85, kelvin: 5000, focus: 'shallow focus' },
      subjects: new Map([['a', { name: 'Mina', anchor: 'a tall woman in a grey coat', entry: null }]]), fallbackContract: false,
    }),
  }
}
