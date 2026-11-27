// 실사 그림체가 아닌 길의 입력 모음 — 실사 샷 · 인물 시트는 2026-11-23 main, 영상은 2026-11-27 main(오너 N4a 영상 방식 넷)의 지시문(other-style-prompts.json)과
//   글자까지 같은지 본다(tests/director/other-styles-unchanged.test.ts). 영상 경우는 지금 서버가 보내는 모양만 쓴다(같은 시험 파일이 모양을 확인한다).
const ZERO = { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }
const KYO = { name: 'Kyotaro', position: 'right_third', pose: 'sitting on the wooden bench next to Komatsu, holding the camera open for viewing while the sun goes down behind the willow and the water glitters in front of them' }
const KOM = { name: 'Komatsu', position: 'frame_edge_left', pose: 'leaning her upper body closer' }
const MELO = 'Grade the whole image in this look: soft diffuse light.'
const dyn = (over = {}) => ({ shot_id: 'sh', camera_motion: { type: 'dolly_in', speed: 'slow', direction: 'forward', magnitude: 'minimal' }, character_motion: [{ character_id: 'a', verb: 'turns her head sharply', magnitude: 'small' }, { character_id: 'a', verb: 'stands up', magnitude: 'medium' }], gaze_arc: [{ character_id: 'a', from: 'down', to: 'b' }], motion_prompt: 'The camera pushes in on Mina as she turns.', ...over })

const ARRI = { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 }
const LONG = Array.from({ length: 30 }, (_, i) => `Detail ${i + 1} of the tavern and the lamp.`).join(' ')
/**
 * 샷 영상 한 건 — 실사 그림체가 아닌 길(aligned 아님)에서 lib/director/video-submit.ts 가 buildVideoPrompt 에 넘기는 모양 그대로.
 *   샷 영상은 대사 칸 · 화자 · 카메라 동기 이름을 늘 넘기고(없으면 null), 보낼 그림이 둘 이상이면 startEndReference 가 참이다(그림 역할이 있으면 쓰이지 않는다).
 *   렌즈 줄(cameraPreset)은 실사 매체의 다른 그림체(일본 멜로 · 그림체 없음)만 싣고, 그린 그림체(애니 · 수채 …)는 서버가 null 로 넘긴다(suppressGear).
 */
const shotVideo = (over) => ({
  camera: { ...ZERO, zoom: 3 }, cameraPreset: ARRI, generationMethod: 'I2V', modelKey: 'seedance', durationSeconds: 5, startEndReference: false,
  dynamicSpec: dyn(), dialogueLines: null, dialogueSpeakers: null, characterNames: null, ...over,
})

/** 영상 경우 — 키마다 서버의 어느 길을 본뜬 것인지 적는다(2026-11-27 main · 오너 N4a 영상 방식 넷). f.SHOT_REFERENCE_LABEL = 서버가 쓰는 샷 실사 그림 이름. */
export function VIDEO_CASES(f) {
  return {
    // ④ 시작+프롬프트(기본) — 샷 상세 · 노드 · 일괄 · 채팅이 방식 없이 낸 샷 영상(frameSource auto → 서버 기본 방식). 실사 시작 한 장. 실사 매체 그림체라 렌즈 줄 있음.
    'video/start_prompt': shotVideo({ prompt: 'A woman sits.', referenceImageRoles: ['start'], videoMode: 'start_prompt', referenceLabels: null }),
    // ① 이어서 — 시작 = 앞 샷 영상의 마지막 장면 한 장(continueFrom). 그린 그림체라 렌즈 줄 없음. 카메라 고정 약속(static).
    'video/continue': shotVideo({
      prompt: 'A bench.', cameraPreset: null, durationSeconds: 4,
      dynamicSpec: dyn({ camera_motion: { type: 'static', speed: 'slow', direction: 'none', magnitude: 'minimal' }, motion_prompt: 'Minimal handheld breathing drift.' }),
      referenceImageRoles: ['start'], videoMode: 'continue', referenceLabels: null,
    }),
    // ② 레퍼런스 — 샷 실사 → 인물 시트 → 배경 → 소품 순 참고 그림 넷과 그 이름(서버 selectModeFrames 의 이름 그대로). 그림이 둘 이상이라 startEndReference 참.
    'video/reference': shotVideo({
      prompt: 'Mina waits at the harbor with a lantern.', modelKey: 'happy-horse', startEndReference: true,
      referenceImageRoles: ['ref', 'ref', 'ref', 'ref'], videoMode: 'reference',
      referenceLabels: [f.SHOT_REFERENCE_LABEL, 'character sheet: Mina', 'the location', 'prop: lantern'],
    }),
    // ③ 시작+미들 — 실사 시작 + 실사 가운데 장(연출 · 의도). H3 Max(첫 장면 칸이 있는 모델)도 지시문은 같다.
    'video/start_middle': shotVideo({ prompt: 'A woman sits.', modelKey: 'h3-max', startEndReference: true, referenceImageRoles: ['start', 'direction'], videoMode: 'start_middle', referenceLabels: null }),
    // ③ + 읽은 줄 — 콘티 · 실사 가운데 장의 화살표를 고친 샷(videoDirectionLine). 움직임은 그 줄이 정하고 옛 움직임 약속은 빠진다.
    'video/direction_line': shotVideo({
      prompt: 'A woman sits.', startEndReference: true, referenceImageRoles: ['start', 'direction'], videoMode: 'start_middle', referenceLabels: null,
      directionLine: 'The woman turns away from the window and walks toward the camera.',
    }),
    // ④ + 대사 — 화자 이름(실사 아닌 길은 저장된 이름 그대로)과 겉모습. 긴 샷 글이라 Kling 글 상한(2,500자)에서 앞 글부터 줄인다.
    'video/dialogue': shotVideo({
      prompt: LONG, modelKey: 'kling-o3', durationSeconds: 8,
      dynamicSpec: dyn({ camera_motion: { type: 'pan', direction: 'forward', speed: 'slow', magnitude: 'moderate' } }),
      dialogueLines: [{ text: 'Hello.', delivery: 'standing up', characterId: 'a' }], dialogueSpeakers: { a: { name: 'Mina', appearance: 'A tall woman.' } },
      referenceImageRoles: ['start'], videoMode: 'start_prompt', referenceLabels: null,
    }),
    // ④ + 바꿀 점 — 샷 상세 영상 고치기 · 채팅 고치기의 바꿀 점(오너 O5, 영어로 옮긴 뒤). 움직임 약속 바로 뒤에 붙는다.
    'video/change': shotVideo({ prompt: 'A woman sits.', change: 'Make her turn slower and keep the camera still.', referenceImageRoles: ['start'], videoMode: 'start_prompt', referenceLabels: null }),
    // 손 배선(방식 없음) — 노드에서 시작 · 참고 그림을 손으로 이은 Take(frameSource manual). 서버는 방식을 쓰지 않고 그림 역할 문장만 싣는다.
    'video/manual': shotVideo({ prompt: 'A woman sits.', startEndReference: true, referenceImageRoles: ['start', 'ref'] }),
    // 독립 영상 · 그림 없음(T2V) — 샷에 묶이지 않은 영상 노드(설계 · 대사 · 그림 없음). 그린 그림체 프로젝트라 렌즈 줄 없음. 지금 화면은 movementPreset 을 보내지 않는다.
    'video/none': {
      prompt: LONG, camera: { ...ZERO, tilt: 5 }, cameraPreset: null, generationMethod: 'T2V', modelKey: 'veo', durationSeconds: 5, startEndReference: false,
      dynamicSpec: null, dialogueLines: null, dialogueSpeakers: null, characterNames: null,
    },
  }
}

export function CASES(f) {
  const out = {}
  const strip = (key, text, opts) => { out[key] = f.buildRealStripPrompt(text, opts) }
  strip('strip/anchor', 'A bench at dusk.', { characterRefCount: 2, worldRefCount: 1, characterRefs: [KYO, KOM], hasStyleRef: true, sceneLighting: 'Afternoon', styleClause: MELO, anchorKeepsGrade: true, styleRefCount: 1, frameAxis: 'rows' })
  strip('strip/one', 'A bench at dusk.', { characterRefCount: 1, characterRefs: [KYO], hasStyleRef: true, sceneLighting: null, styleRefCount: 2, frameAxis: 'cols' })
  strip('strip/plain', 'A bench.', { characterRefCount: 0, hasStyleRef: false, sceneLighting: 'Night', extraRefCount: 1 })
  out['grid/anchor'] = f.buildRealGridPrompt(3, { characterRefCount: 2, worldRefCount: 1, hasStyleRef: true, characterRefs: [{ name: 'Kyotaro' }, { name: 'Komatsu' }], columnCharacters: [[KYO, KOM], [KYO], []], sceneLighting: 'Afternoon', styleClause: MELO, anchorKeepsGrade: true, styleRefCount: 1, styleAnchors: 'thin lines', styleAvoid: 'Avoid gloss.' })
  out['grid/plain'] = f.buildRealGridPrompt(4, { characterRefCount: 1, hasStyleRef: false })
  for (const [key, parts] of Object.entries(VIDEO_CASES(f))) out[key] = f.buildVideoPrompt(parts).fullPrompt
  const input = { name: 'Ian', appearance: 'A young man in his twenties with short black hair. He has a calm face.', role: 'lead', costumes: ['white shirt'], artStyle: 'japanese_melodrama_live_action', texturePhilosophy: 'photorealistic' }
  out['sheet/plain'] = f.buildCharacterTurnaroundPrompt(input)
  out['sheet/safe'] = f.buildCharacterTurnaroundPrompt({ ...input, safeMode: true, followAnchorStyle: true }, { hasPriorRender: true })
  return out
}
