// 실사 그림체가 아닌 길의 입력 모음 — 2026-11-23 main 의 지시문(other-style-prompts.json)과 글자까지 같은지 본다(tests/director/other-styles-unchanged.test.ts).
const ZERO = { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }
const KYO = { name: 'Kyotaro', position: 'right_third', pose: 'sitting on the wooden bench next to Komatsu, holding the camera open for viewing while the sun goes down behind the willow and the water glitters in front of them' }
const KOM = { name: 'Komatsu', position: 'frame_edge_left', pose: 'leaning her upper body closer' }
const MELO = 'Grade the whole image in this look: soft diffuse light.'
const dyn = (over = {}) => ({ shot_id: 'sh', camera_motion: { type: 'dolly_in', speed: 'slow', direction: 'forward', magnitude: 'minimal' }, character_motion: [{ character_id: 'a', verb: 'turns her head sharply', magnitude: 'small' }, { character_id: 'a', verb: 'stands up', magnitude: 'medium' }], gaze_arc: [{ character_id: 'a', from: 'down', to: 'b' }], motion_prompt: 'The camera pushes in on Mina as she turns.', ...over })

export function CASES(f) {
  const out = {}
  const strip = (key, text, opts) => { out[key] = f.buildRealStripPrompt(text, opts) }
  strip('strip/anchor', 'A bench at dusk.', { characterRefCount: 2, worldRefCount: 1, characterRefs: [KYO, KOM], hasStyleRef: true, sceneLighting: 'Afternoon', styleClause: MELO, anchorKeepsGrade: true, styleRefCount: 1, frameAxis: 'rows' })
  strip('strip/one', 'A bench at dusk.', { characterRefCount: 1, characterRefs: [KYO], hasStyleRef: true, sceneLighting: null, styleRefCount: 2, frameAxis: 'cols' })
  strip('strip/plain', 'A bench.', { characterRefCount: 0, hasStyleRef: false, sceneLighting: 'Night', extraRefCount: 1 })
  out['grid/anchor'] = f.buildRealGridPrompt(3, { characterRefCount: 2, worldRefCount: 1, hasStyleRef: true, characterRefs: [{ name: 'Kyotaro' }, { name: 'Komatsu' }], columnCharacters: [[KYO, KOM], [KYO], []], sceneLighting: 'Afternoon', styleClause: MELO, anchorKeepsGrade: true, styleRefCount: 1, styleAnchors: 'thin lines', styleAvoid: 'Avoid gloss.' })
  out['grid/plain'] = f.buildRealGridPrompt(4, { characterRefCount: 1, hasStyleRef: false })
  const video = (key, parts) => { out[key] = f.buildVideoPrompt(parts).fullPrompt }
  const LONG = Array.from({ length: 30 }, (_, i) => `Detail ${i + 1} of the tavern and the lamp.`).join(' ')
  video('video/contract', { prompt: 'A woman sits.', generationMethod: 'I2V', modelKey: 'seedance', durationSeconds: 5, dynamicSpec: dyn(), camera: { ...ZERO, zoom: 3 }, cameraPreset: { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 }, referenceImageRoles: ['start', 'end'] })
  video('video/dialogue', { prompt: LONG, generationMethod: 'I2V', modelKey: 'kling-o3', durationSeconds: 8, dynamicSpec: dyn({ camera_motion: { type: 'pan', direction: 'forward', speed: 'slow', magnitude: 'moderate' } }), dialogueLines: [{ text: 'Hello.', delivery: 'standing up', characterId: 'a' }], dialogueSpeakers: { a: { name: 'Mina', appearance: 'A tall woman.' } }, startEndReference: true })
  video('video/none', { prompt: LONG, generationMethod: 'T2V', modelKey: 'veo', durationSeconds: 5, movementPreset: null, camera: { ...ZERO, tilt: 5 } })
  video('video/static', { prompt: 'A bench.', generationMethod: 'I2V', modelKey: 'seedance', durationSeconds: 4, dynamicSpec: dyn({ camera_motion: { type: 'static', speed: 'slow', direction: 'none', magnitude: 'minimal' }, motion_prompt: 'Minimal handheld breathing drift.' }), startEndReference: true })
  const input = { name: 'Ian', appearance: 'A young man in his twenties with short black hair. He has a calm face.', role: 'lead', costumes: ['white shirt'], artStyle: 'japanese_melodrama_live_action', texturePhilosophy: 'photorealistic' }
  out['sheet/plain'] = f.buildCharacterTurnaroundPrompt(input)
  out['sheet/safe'] = f.buildCharacterTurnaroundPrompt({ ...input, safeMode: true, followAnchorStyle: true }, { hasPriorRender: true })
  return out
}
