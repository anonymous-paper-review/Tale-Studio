// 실사 그림체의 영상 지시문 안의 말이 서로, 그리고 샷 설계와 어긋나지 않는지 검사한다 (오너 2026-11-23 "2 모두 적용을 실사 스타일로 지정해주고 바로 main에 올려줘")
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compileMotionContract as compileContract } from '@/lib/director/motion-contract'
import { buildVideoPrompt, clipSentences, fitPromptForModel, type BuildVideoPromptInput } from '@/lib/director/video-prompt'
import { designGear, entryNote, subjectAnchor, withoutCameraMoves, withoutContradictedLedgerMotions } from '@/lib/director/video-design'
import type { ShotDynamicSpec } from '@/lib/writer/types/pipeline'

const ZERO = { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }
const dyn = (over: Partial<ShotDynamicSpec> = {}): ShotDynamicSpec =>
  ({ shot_id: 'sh', camera_motion: { type: 'dolly_in', speed: 'slow', direction: 'forward', magnitude: 'minimal' }, character_motion: [], motion_prompt: '', ...over }) as ShotDynamicSpec
// 실사 그림체 길(aligned)만 본다 — 다른 그림체는 other-styles-unchanged.test.ts 가 글자까지 지금과 같은지 본다.
const BASE: BuildVideoPromptInput = { aligned: true, prompt: 'A woman sits by the window.', generationMethod: 'I2V', modelKey: 'seedance', durationSeconds: 5, dynamicSpec: dyn() }
const compileMotionContract = (spec: ShotDynamicSpec | null, seconds: number, opts: Parameters<typeof compileContract>[2] = {}) => compileContract(spec, seconds, { aligned: true, ...opts })

describe('카메라를 두 번 다르게 적지 않기', () => {
  it('카메라 값이 샷 설계에서 온 그대로면 움직임 약속의 카메라만 싣고 카메라 값 글은 싣지 않는다', () => {
    // 왜: 지하철 샷 1 · 2 · 5, 시브셀러 샷 7 은 "다가간다(dollies in)"와 "줌 인(zooms in)"이 같이 실렸다.
    const { fullPrompt } = buildVideoPrompt({ ...BASE, camera: { ...ZERO, zoom: 3 }, designCamera: { ...ZERO, zoom: 3 } })
    expect(fullPrompt).toContain('Camera: dollies in slow')
    expect(fullPrompt).not.toContain('Camera zooms')
  })

  it('사람이 카메라 값을 고쳤으면 그 값이 움직임 약속의 카메라가 되고, 두 번 싣지 않는다', () => {
    // 왜: 사람이 고른 카메라가 이겨야 한다 — 설계의 카메라와 나란히 실으면 모델이 어느 쪽도 따르지 않는다.
    const { fullPrompt } = buildVideoPrompt({ ...BASE, camera: { ...ZERO, tilt: 5 }, designCamera: { ...ZERO, zoom: 3 } })
    expect(fullPrompt).toContain('Camera: Camera pans steadily to the right'.replace('Camera: Camera ', 'Camera: '))
    expect(fullPrompt).not.toContain('dollies in')
    expect(fullPrompt.match(/pans steadily to the right/g)?.length).toBe(1)
  })

  it('카메라 값이 모두 0 인 샷은 설계의 카메라 움직임을 그대로 쓴다', () => {
    // 왜: 카메라 값을 채우기 전 샷(모두 0)은 사람이 고친 것이 아니다.
    expect(buildVideoPrompt({ ...BASE, camera: ZERO, designCamera: { ...ZERO, zoom: 3 } }).fullPrompt).toContain('Camera: dollies in slow')
  })

  it('설계의 높은 각도가 카메라 움직임으로 실리지 않는다', () => {
    // 왜: 내려다보는 각도는 저장된 값(위아래 회전 -5)으로 남는다 — 사람이 줌만 고쳐도 "아래로 숙인다"는 움직임이 같이 나갔다(11/23 검토).
    const angle = { ...ZERO, pan: -5 }
    const { fullPrompt } = buildVideoPrompt({ ...BASE, camera: { ...ZERO, pan: -5, zoom: 3 }, designCamera: angle, designAngle: angle })
    expect(fullPrompt).toContain('Camera: zooms slowly in.')
    expect(fullPrompt).not.toContain('pitches')
    // 각도만 남으면 설계의 움직임을 쓴다.
    expect(buildVideoPrompt({ ...BASE, camera: angle, designCamera: { ...ZERO, pan: -5, zoom: 3 }, designAngle: angle }).fullPrompt).toContain('Camera: dollies in slow')
  })

  it('설계가 위아래로 움직이는 축을 사람이 고친 값은 각도로 보지 않는다', () => {
    // 왜: 설계가 올려다보는 움직임인 축을 사람이 -5 로 고치면 무시됐다(11/23 검토).
    const angle = { ...ZERO, pan: -5 }
    const tiltUp = buildVideoPrompt({ ...BASE, camera: angle, designCamera: { ...ZERO, pan: 5 }, designAngle: angle, dynamicSpec: dyn({ camera_motion: { type: 'tilt', speed: 'medium', direction: 'up', magnitude: 'moderate' } as never }) }).fullPrompt
    expect(tiltUp).toContain('Camera: pitches steadily down.')
    expect(tiltUp).not.toContain('tilts steady')
  })

  it('설계의 카메라 값을 모르는 요청은 지금과 글자까지 같다', () => {
    // 왜: 독립 영상 · 옛 요청은 바뀌지 않는다(정상 경로 고정).
    expect(buildVideoPrompt({ ...BASE, camera: { ...ZERO, zoom: 3 } }).fullPrompt).toContain('Camera zooms slowly in')
  })

  it('움직임 글에서 카메라 말을 빼고 인물 · 환경의 움직임은 남긴다', () => {
    // 왜: 지하철 샷 4 는 약속이 "절대 움직이지 않는다"인데 움직임 글은 "손으로 든 흔들림", 샷 9 는 "팬"과 "다가간다"였다. 카메라는 약속 한 곳이 정한다.
    expect(withoutCameraMoves('The camera slowly dollies down the aisle of the subway car as overhead handles sway gently and tube lights flicker softly.')).toBe('Overhead handles sway gently and tube lights flicker softly.')
    expect(withoutCameraMoves('The camera pushes in slowly on the tired woman as she blinks heavily and turns her head slightly toward the dark window.')).toBe('The tired woman blinks heavily and turns her head slightly toward the dark window.')
    expect(withoutCameraMoves("The camera slowly dollies in on Okhwa's face as her iris flickers with a subtle blue prompt while her expression freezes.")).toBe("Okhwa's iris flickers with a subtle blue prompt while her expression freezes.")
    expect(withoutCameraMoves('The tired woman slowly raises her head and gazes at her reflection as the camera slowly dollies in.')).toBe('The tired woman slowly raises her head and gazes at her reflection.')
    expect(withoutCameraMoves('Yeong-gam walks along the skyway while Gyeyeon follows ten paces behind, camera tracking alongside.')).toBe('Yeong-gam walks along the skyway while Gyeyeon follows ten paces behind.')
    expect(withoutCameraMoves('Minimal handheld breathing drift while overhead lights flicker faintly across empty steel benches.')).toBe('Overhead lights flicker faintly across empty steel benches.')
    expect(withoutCameraMoves('The camera remains completely static as the woman stays motionless, her pupils slightly shifting.')).toBe('The woman stays motionless, her pupils slightly shifting.')
    expect(withoutCameraMoves('The camera tracks left.')).toBe('')
    expect(withoutCameraMoves('Seong-gi lowers to his knees and bows deeply.')).toBe('Seong-gi lowers to his knees and bows deeply.')
    // 소품 카메라 · 카메라맨은 카메라 움직임이 아니다.
    expect(withoutCameraMoves('She lifts an old camera and takes a photo.')).toBe('She lifts an old camera and takes a photo.')
    expect(withoutCameraMoves('A handheld lantern sways while she walks.')).toBe('A handheld lantern sways while she walks.')
    expect(withoutCameraMoves('A pan sizzles on the stove while she chops.')).toBe('A pan sizzles on the stove while she chops.')
  })

  it('카메라 말 속에 다른 사람 · 사물의 움직임이 섞였으면 그 문장은 그대로 둔다', () => {
    // 왜: 카메라 말과 함께 동작까지 지우면 영상에서 그 동작이 사라진다(11/23 검토: QA 글 971개 가운데 약 10개).
    for (const kept of [
      'Static shot of dim overhead lighting flickering and cutting off into shadow.',
      'Camera dollies in toward the long antenna wire violently thrashing in the storm.',
      'Camera tracks Mina pulling the lever as the machinery awakens.',
      'She steps aside as the camera dollies back, revealing the floor vibrating while Jun runs to the wall.',
      'From eye level, the camera drifts backward as the three push up from the dirt, dust themselves off and laugh.',
      'Rain falls as the camera holds steady and Mina lifts the cup.',
      'A handheld camera lies on the table beside the lamp.',
      'From the doorway, the camera drifts backward.',
      'Jun stands up from the water as the camera tilts up to track him, settling into a gentle nod.',
      'The camera pulls back as Mina skips in, holding all three in frame as they turn.',
    ]) expect(withoutCameraMoves(kept)).toBe(kept)
    // 카메라 조각 속 사람의 동작, 소품 pan · crane · 액자는 카메라 말이 아니다(11/23 2차 검토).
    for (const kept of [
      'Jun turns, camera follows him to the window where he pulls the curtain shut.',
      'The camera follows Mina to the well where she drops the coin.',
      'The camera follows Jun to the floor once he collapses.',
      'Camera pans to the door Mina slams shut.',
      'Camera pulls back and down the hall lights go out.',
      'A pan left on the stove boils over.',
      'The pan over the fire sizzles while Mina chops.',
      'The crane over the harbor swings its load while the sun sets.',
      'A static frame hangs crooked on the wall as Mina enters.',
      'As the camera rises to his eye, the reporter holds his breath.',
      'The camera pans to the man whose coat burns.',
    ]) expect(withoutCameraMoves(kept)).toBe(kept)
    // 관사 없이 · 꾸밈말과 함께 쓴 카메라 말은 지금처럼 뺀다.
    expect(withoutCameraMoves('Slow pan left across the room as Mina enters.')).toBe('Mina enters.')
    expect(withoutCameraMoves('Pan right as the door opens.')).toBe('The door opens.')
    expect(withoutCameraMoves('A slow tracking shot along the wall as Jun walks.')).toBe('Jun walks.')
    expect(withoutCameraMoves('Static frame, the rain falls.')).toBe('Static frame, the rain falls.')
    // 쌍반점으로 나뉘면 카메라 쪽만 뺀다.
    expect(withoutCameraMoves('Static camera; Mina lifts the cup.')).toBe('Mina lifts the cup.')
    expect(withoutCameraMoves('Slow push-in on her face; resolve hardens, hand gripping the lever.')).toBe('Resolve hardens, hand gripping the lever.')
    expect(withoutCameraMoves('He lowers his head; camera tilts down into the crack.')).toBe('He lowers his head.')
    expect(withoutCameraMoves('She waits; camera pulls back as the door opens.')).toBe('She waits; the door opens.')
  })

  it('"as if · as though · as soon as · as far as"에서 문장을 자르지 않는다', () => {
    // 왜: 여기의 as 는 "하는 동안"이 아니라서 "If breathing with her." 같은 부서진 조각이 남았다(11/23 검토).
    for (const kept of [
      'The camera pushes in slowly as if breathing with her.',
      'The camera pushes in slowly as though it were breathing.',
      'The camera pans right as soon as Mina turns.',
      'Camera pulls back as far as the doorway while Mina weeps.',
      'The camera holds steady as long as the bell rings.',
      'The camera drifts as slowly as the smoke rises.',
    ]) expect(withoutCameraMoves(kept)).toBe(kept)
  })

  it('카메라 조각에 사람이 둘 나오면 대명사가 누구인지 모르니 그 문장은 그대로 둔다', () => {
    // 왜: "Jun 을 지나 Mina 쪽으로 … he lowers the gun"이 "Mina lowers the gun"이 됐다 — 다른 사람이 총을 내린다(11/23 검토).
    for (const kept of [
      'The camera moves past Jun toward Mina as he lowers the gun.',
      'The camera pushes in on Mina beside Jun as she turns to him.',
      'The camera pushes in on the officer beside Jun as he turns.',
      'The camera pushes past the stranger toward Jun as he turns.',
    ]) expect(withoutCameraMoves(kept)).toBe(kept)
    expect(withoutCameraMoves('The camera pushes in slowly toward Mina as she turns.')).toBe('Mina turns.')
    expect(withoutCameraMoves('The camera follows Mina as she walks home.')).toBe('Mina walks home.')
    expect(withoutCameraMoves("Slow push-in on the tired woman's face as her eyes close.")).toBe("The tired woman's eyes close.")
  })

  it('이름 뒤에 다른 사람이 오면 그 이름을 주어로 바꾸지 않고, 직함의 마침표에서 문장을 자르지 않는다', () => {
    // 왜: "Mina 의 어머니가 돌아선다"가 "Mina 가 돌아선다"가 되고, "Mr. Kim"이 잘려 "Kim as he walks."가 남았다(11/23 3차 검토).
    for (const kept of [
      "The camera pushes in on Mina's mother as she turns.",
      "The camera follows Mina's father as he walks home.",
      'The camera follows Mr. Kim as he walks.',
    ]) expect(withoutCameraMoves(kept)).toBe(kept)
    expect(withoutCameraMoves('The camera pushes in on Dr. Han as the rain falls.')).toBe('The rain falls.')
    expect(withoutCameraMoves("The camera pushes in on Mina's clenched hands as she reaches out.")).toBe('Mina reaches out.')
    // 소유격 뒤의 -ing 는 동작일 수도 있어("Mina's trembling") 그대로 둔다.
    expect(withoutCameraMoves("The camera pushes in on Mina's trembling hands as she reaches out.")).toBe("The camera pushes in on Mina's trembling hands as she reaches out.")
  })

  it('소유격 바로 뒤 낱말이 몸의 부분일 때만 그 사람을 주어로 쓰고, 뒤에 자리 말이 붙어도 알아본다', () => {
    // 왜: "Mina 의 어머니를 몇 걸음 따라간다"는 끝 낱말(steps)이 몸의 말이라 다시 "Mina 가 걷는다"가 됐고, "운전대 위 Jun 의 손"은 카메라 말이 남았다(11/23 4차 검토).
    for (const kept of [
      "The camera follows Mina's mother a few steps as she walks.",
      "The camera follows Mina's mother over her shoulder as she walks.",
      "The camera stays on Mina's father in the back as he talks.",
      'The camera pushes in on the letter Mina reveals as the rain falls.',
    ]) expect(withoutCameraMoves(kept)).toBe(kept)
    expect(withoutCameraMoves("The camera pushes in on Jun's hands on the wheel as he drives.")).toBe('Jun drives.')
    expect(withoutCameraMoves("The camera pushes in on Mina's face in the mirror as she smiles.")).toBe('Mina smiles.')
  })

  it('크기 말이 붙은 소품 pan · crane, 목록에 없는 사람의 동작, 비유의 as 는 그대로 둔다', () => {
    // 왜: "작은 pan 이 지글거린다"가 카메라 말로 읽혀 사라지고, "경비원이 문을 닫는다"가 통째로 없어졌다(11/23 3차 검토).
    for (const kept of [
      'The small pan over the fire sizzles while Mina chops.',
      'A small pan left on the stove boils over as Mina enters.',
      'A tiny crane up on the shelf tips over as Jun enters.',
      'Camera pans to the door the guard slams shut.',
      'Camera pulls back to show the guard slam the door.',
      'Mina runs as soon as the camera pans left.',
      'The camera drifts as a leaf would.',
      'The camera holds still as before.',
      'Camera pulls back and down the lights go.',
      'A pan left to cool on the stove steams as Mina enters.',
      'The pan left to simmer on the stove bubbles while Mina chops.',
    ]) expect(withoutCameraMoves(kept)).toBe(kept)
  })

  it('흔한 카메라 말은 계속 뺀다 — 눈높이 · 고정 화면 · "잠시" · "방 밖으로" · 드러내는 방', () => {
    // 왜: 동작을 지키려고 조건을 늘리다가 흔한 카메라 말까지 남기면 "카메라를 두 번 다르게 적지 않기"가 풀린다(11/23 3차 검토).
    expect(withoutCameraMoves('Locked-off frame on Mina as she turns.')).toBe('Mina turns.')
    expect(withoutCameraMoves("The camera lowers to Mina's eye level as the rain falls.")).toBe('The rain falls.')
    expect(withoutCameraMoves('The camera pushes in on Mina for a beat as the rain falls.')).toBe('The rain falls.')
    expect(withoutCameraMoves('The camera slides toward Mina between the shelves as the rain falls.')).toBe('The rain falls.')
    expect(withoutCameraMoves('The camera pulls back and out of the room as Mina leaves.')).toBe('Mina leaves.')
    expect(withoutCameraMoves('The camera pushes in and around Mina as she speaks.')).toBe('Mina speaks.')
    expect(withoutCameraMoves('The camera pans right to reveal the room where Jun sleeps.')).toBe('The move reveals the room where Jun sleeps.')
    expect(withoutCameraMoves('A tilt up to the ceiling as the lights flicker.')).toBe('The lights flicker.')
    expect(withoutCameraMoves('The camera pulls back from the table a few feet as steam rises.')).toBe('Steam rises.')
    expect(withoutCameraMoves('The camera lingers on her face a moment longer as the rain falls.')).toBe('The rain falls.')
    expect(withoutCameraMoves('The camera glides over the water like a bird as the sun rises.')).toBe('The sun rises.')
    expect(withoutCameraMoves('The camera follows the car the whole way as the rain falls.')).toBe('The rain falls.')
    expect(withoutCameraMoves('The camera pans across the crowd as one of the dancers falls.')).toBe('One of the dancers falls.')
    expect(withoutCameraMoves('She lives on Maple St. The camera pushes in on the house as the rain falls.')).toBe('She lives on Maple St. The rain falls.')
    expect(withoutCameraMoves('A pan left across the room as Mina enters.')).toBe('Mina enters.')
    expect(withoutCameraMoves('The crane up from the street reveals the skyline as dawn breaks.')).toBe('Dawn breaks. The move reveals the skyline.')
    expect(withoutCameraMoves('The camera pulls back and up above the crowd as the bells ring.')).toBe('The bells ring.')
    expect(withoutCameraMoves("The camera follows Mina's footsteps as she walks.")).toBe('Mina walks.')
    expect(withoutCameraMoves('The camera pulls back slowly from the window to show the whole room as Mina sits.')).toBe('Mina sits. The move reveals the whole room.')
  })

  it('대명사의 주인이 분명하지 않으면 그 문장은 그대로 둔다', () => {
    // 왜: 카메라가 비추던 것을 주어로 바꿔 넣으면 "손전등 빛 → Leo 가 드러낸다", "식탁이 먹는다"처럼 뜻이 바뀐다(11/23 검토).
    for (const kept of [
      "Camera tilts upward following Leo's light beam as it reveals the rusted panel.",
      'The camera keeps holding the three at medium size as they rise from the bench.',
      'The camera holds on the table as they eat in silence.',
      "The camera stays on Jun's phone as it rings.",
      'The camera tracks slowly past the rack as she walks on.',
    ]) expect(withoutCameraMoves(kept)).toBe(kept)
    expect(withoutCameraMoves('The camera pushes in slowly on Mina Park as she opens her eyes.')).toBe('Mina Park opens her eyes.')
    expect(withoutCameraMoves('Jun laughs as the camera dollies in on his peaceful, glowing face.')).toBe('Jun laughs as the camera dollies in on his peaceful, glowing face.')
  })

  it('쌍반점 뒤 조각이 대명사로 시작하면 앞의 카메라 말을 빼지 않는다', () => {
    // 왜: "Mina 를 따라간다; 그가 넘어진다"에서 앞을 빼면 넘어지는 사람이 누구인지 사라졌다(11/23 검토).
    for (const kept of [
      'Handheld camera follows Mina; she stumbles and falls.',
      'Slow push-in on Jun; his hands shake.',
      'The camera pans to the two sisters; they embrace.',
    ]) expect(withoutCameraMoves(kept)).toBe(kept)
    expect(withoutCameraMoves('Static camera; Mina lifts the cup.')).toBe('Mina lifts the cup.')
    // 문장이 나뉘어 있어도 같다 — 앞 카메라 문장에 이름이 있고 다음 문장이 대명사로 시작할 때만.
    expect(withoutCameraMoves('The camera follows Mina. She stumbles and falls.')).toBe('The camera follows Mina. She stumbles and falls.')
    expect(withoutCameraMoves('The camera tracks left. She stumbles and falls.')).toBe('She stumbles and falls.')
  })

  it('카메라가 무엇을 드러내는지는 카메라 말을 빼도 남긴다', () => {
    // 왜: "레버를 드러낸다"는 뜻은 움직임 글에만 있을 때가 있다(2026-08-11 실측) — 카메라 말과 함께 지우면 드러낼 것이 사라진다.
    expect(withoutCameraMoves('The camera pans right, revealing a lever on the wall.')).toBe('The move reveals a lever on the wall.')
    expect(withoutCameraMoves('As the camera pulls back to reveal the empty hall, she turns.')).toBe('She turns. The move reveals the empty hall.')
    expect(withoutCameraMoves('She turns as the camera tracks left to reveal the gate.')).toBe('She turns. The move reveals the gate.')
  })

  it('제자리 회전(팬 · 틸트)에 뜻이 서지 않는 방향은 싣지 않는다', () => {
    // 왜: 지하철 샷 9 는 팬에 "안쪽(forward)"이 붙어 "pans toward deeper into the scene — flows toward past the camera"라는 말이 됐다.
    const pan = compileMotionContract(dyn({ camera_motion: { type: 'pan', direction: 'forward', speed: 'slow', magnitude: 'moderate' } as never }), 3).text
    expect(pan).toContain('Camera: pans slow. Rotation only')
    expect(pan).not.toMatch(/deeper into the scene|past the camera/)
    const tilt = compileMotionContract(dyn({ camera_motion: { type: 'tilt', direction: 'left', speed: 'slow', magnitude: 'moderate' } as never }), 3).text
    expect(tilt).toContain('Camera: tilts slow. Rotation only')
    expect(compileMotionContract(dyn({ camera_motion: { type: 'pan', direction: 'left', speed: 'slow', magnitude: 'moderate' } as never }), 3).text).toContain('toward screen left')
  })

  it('설계가 멈춘 카메라인데 움직임 글이 손으로 든 흔들림이면 제자리 흔들림으로 적는다', () => {
    // 왜: 지하철 샷 4 의 러프에는 HANDHELD DRIFT 가 그려져 있다 — "절대 움직이지 않는다"만 남기면 러프와 다르다. 자리를 옮기지 않는 흔들림뿐이다.
    const still = { type: 'static', speed: 'slow', direction: 'none', magnitude: 'minimal' } as never
    expect(compileMotionContract(dyn({ camera_motion: still, motion_prompt: 'Minimal handheld breathing drift while overhead lights flicker.' }), 3).text).toContain('Camera: handheld micro-drift only')
    expect(compileMotionContract(dyn({ camera_motion: still, motion_prompt: 'The camera slowly dollies in on her face.' }), 3).text).toContain('Camera: LOCKED tripod shot')
    expect(compileMotionContract(dyn({ camera_motion: still, motion_prompt: 'She lifts a handheld lantern.' }), 3).text).toContain('Camera: LOCKED tripod shot')
    expect(compileMotionContract(dyn({ camera_motion: still, motion_prompt: 'He raises a handheld camera and films.' }), 3).text).toContain('Camera: LOCKED tripod shot')
  })

  it('팬에 안쪽 방향이 붙고 움직임 글이 다가간다고 하면 다가감으로 적는다', () => {
    // 왜: 지하철 샷 9 의 러프에는 DOLLY IN 이 그려져 있다 — 설계의 "팬"만 남기면 러프와 다른 카메라가 나간다.
    const pan = { type: 'pan', direction: 'forward', speed: 'slow', magnitude: 'moderate' } as never
    expect(compileMotionContract(dyn({ camera_motion: pan, motion_prompt: 'The camera slowly dollies in towards the subway window.' }), 3).text).toContain('Camera: dollies in slow')
    expect(compileMotionContract(dyn({ camera_motion: { ...(pan as object), direction: 'backward' } as never, motion_prompt: 'The camera pulls back slowly.' }), 3).text).toContain('Camera: dollies out slow')
    // 사람의 동작("커튼을 젖힌다")을 카메라 동작으로 읽지 않는다.
    expect(compileMotionContract(dyn({ camera_motion: { ...(pan as object), type: 'tilt', direction: 'backward' } as never, motion_prompt: 'Mina pulls back the curtain.' }), 3).text).toContain('Camera: tilts slow')
    // 팬의 까닭("화면 밖을 드러내려고")은 다가감과 맞지 않는다 — 바꾼 샷에는 싣지 않는다.
    const revealed = compileMotionContract(dyn({ camera_motion: { ...(pan as object), motivation: 'reveal', target: 'window_glass' } as never, motion_prompt: 'The camera slowly dollies in towards the subway window.' }), 3).text
    expect(revealed).not.toMatch(/Purpose: to reveal/)
  })
})

describe('누가 움직이는지 이름으로', () => {
  const subjects = new Map([['okhwa', { name: 'Okhwa', anchor: 'a woman in an amber overcoat' }], ['yeong_gam', { name: 'Yeong-gam', anchor: 'a white-haired old man' }]])

  it('움직임 약속의 인물은 번호가 아니라 이름과 겉모습으로 적고, 시선도 누구의 시선인지 적는다', () => {
    // 왜: 시브셀러 샷 2 · 4 · 6 · 8, 우산 샷 1 은 "subject 1 · 2 · 3"이 누구인지 적혀 있지 않았다.
    const text = compileMotionContract(
      dyn({
        character_motion: [{ verb: 'crouches down', magnitude: 'large', character_id: 'yeong_gam' }, { verb: 'steps forward', magnitude: 'small', character_id: 'okhwa' }],
        gaze_arc: [{ character_id: 'yeong_gam', from: 'downward', to: 'okhwa' }],
      } as never), 5, { subjects }).text
    expect(text).toContain('Yeong-gam (a white-haired old man): "crouches down"')
    expect(text).toContain('Okhwa (a woman in an amber overcoat): "steps forward"')
    expect(text).toContain("Yeong-gam's gaze turns from downward to Okhwa")
    expect(text).not.toMatch(/subject \d/)
  })

  it('시작 그림에 없고 나중에 들어오는 인물은 어느 쪽에서 들어오는지 적는다', () => {
    // 왜: 시브셀러 샷 4 의 Okhwa 는 시작 그림에 없는데 글은 "문간으로 나선다"뿐이라, 갑자기 나타나거나 시작 그림과 다툰다.
    const layout = { screen_layout: { characters: [{ character_id: 'okhwa', start: { in_frame: false, position_in_frame: 'off_left' }, end: { in_frame: true, position_in_frame: 'left_third' } }, { character_id: 'yeong_gam', start: { in_frame: true }, end: { in_frame: true } }] } }
    expect(entryNote(layout, 'okhwa')).toBe('off-screen at the start, comes into frame from the left')
    // 카메라 뒤에 선 사람은 어느 쪽인지 모른다(무대 계산이 늘 "왼쪽"으로 적는다).
    expect(entryNote({ screen_layout: { characters: [{ character_id: 'b', start: { in_frame: false, position_in_frame: 'off_left', screen_x: 0 }, end: { in_frame: true } }] } }, 'b')).toBe('off-screen at the start, comes into frame')
    expect(entryNote(layout, 'yeong_gam')).toBeNull()
    expect(entryNote(null, 'okhwa')).toBeNull()
    const text = compileMotionContract(dyn({ character_motion: [{ verb: 'steps forward', magnitude: 'small', character_id: 'okhwa' }] } as never), 5,
      { subjects: new Map([['okhwa', { name: 'Okhwa', anchor: 'a woman in an amber overcoat', entry: 'off-screen at the start, enters from the left' }]]) }).text
    expect(text).toContain('Okhwa (a woman in an amber overcoat; off-screen at the start, enters from the left): "steps forward"')
  })

  it('움직임 약속에 이미 겉모습을 적은 인물은 대사에서 이름만 적는다', () => {
    // 왜: 한 지시문 안에 같은 겉모습 글이 두 번 들어가 샷 내용 자리를 빼앗았다.
    const withDialogue: BuildVideoPromptInput = {
      ...BASE, subjects,
      dynamicSpec: dyn({ character_motion: [{ verb: 'crouches down', magnitude: 'large', character_id: 'yeong_gam' }] } as never),
      dialogueLines: [{ text: 'Good evening.', characterId: 'yeong_gam' }, { text: 'Welcome.', characterId: 'okhwa' }],
      dialogueSpeakers: { yeong_gam: { name: 'Yeong-gam', appearance: 'A white-haired old man.' }, okhwa: { name: 'Okhwa', appearance: 'A woman in an amber overcoat.' } },
    }
    const { fullPrompt } = buildVideoPrompt(withDialogue)
    expect(fullPrompt).toContain('line 1: Yeong-gam says aloud: "Good evening."')
    expect(fullPrompt).toContain('line 2: Okhwa (A woman in an amber overcoat) says aloud: "Welcome."')
  })

  it('이름을 모르면 지금처럼 번호로 적는다', () => {
    // 왜: 이름을 못 읽은 샷 · 옛 요청은 그대로다(정상 경로 고정).
    expect(compileMotionContract(dyn({ character_motion: [{ verb: 'runs', magnitude: 'large', character_id: 'x' }] } as never), 5).text).toContain('subject 1: "runs"')
  })

  it('겉모습 한 마디는 첫 문장에서 짧게, 낱말 중간에서 자르지 않는다', () => {
    // 왜: 겉모습이 길면 약속을 밀어내고, 낱말 중간에서 잘리면 다른 말이 된다.
    expect(subjectAnchor('A 60-year-old man with white hair, carrying a frame of sieves, a fan, and a staff. He limps.')).toBe('a 60-year-old man with white hair, carrying a frame of sieves, a fan, and a staff')
    // 길면 쉼표에서 끊는다 — "…office-worker…"처럼 어중간하게 끝나지 않게.
    expect(subjectAnchor('A woman with disheveled hair and deep dark circles under her eyes, dressed in ordinary office-worker attire.')).toBe('a woman with disheveled hair and deep dark circles under her eyes')
    expect(subjectAnchor('Dr. Han is a 40-year-old surgeon in a white coat. He frowns.')).toBe('Dr. Han is a 40-year-old surgeon in a white coat')
    // 첫머리의 "나이: 34" · "주인공" 같은 표는 겉모습이 아니다 — 다음 문장을 쓴다(11/23 검토).
    expect(subjectAnchor('Age: 34. Korean woman in a grey blouse.')).toBe('Korean woman in a grey blouse')
    expect(subjectAnchor('Protagonist. A tall woman with short hair.')).toBe('a tall woman with short hair')
    expect(subjectAnchor('Protagonist.')).toBe('Protagonist')
    expect(subjectAnchor('Age: 34 years old. Korean woman in a grey blouse.')).toBe('Korean woman in a grey blouse')
    expect(subjectAnchor('Note: see reference sheet. A tall woman.')).toBe('a tall woman')
    expect(subjectAnchor('Main character. A tall woman with short hair.')).toBe('a tall woman with short hair')
    expect(subjectAnchor('Appearance: A tall woman with short hair.')).toBe('a tall woman with short hair')
    expect(subjectAnchor('A man in a hat: tall and thin.')).toBe('a man in a hat: tall and thin')
    expect(subjectAnchor('Hair color: black. Eye color: brown. A tall woman with a scar.')).toBe('a tall woman with a scar')
    expect(subjectAnchor('Type: human. A tall woman.')).toBe('a tall woman')
    expect(subjectAnchor('Okhwa: A woman in an amber overcoat.')).toBe('a woman in an amber overcoat')
    expect(subjectAnchor('Protagonist: Mina. A woman in a grey blouse.')).toBe('a woman in a grey blouse')
    expect(subjectAnchor('')).toBeNull()
    expect(subjectAnchor(`A ${'very '.repeat(60)}tall man`)!.length).toBeLessThanOrEqual(101)
  })
})

describe('동작의 크기와 순서가 어긋나지 않기', () => {
  it('"홱 · 갑자기"처럼 빠른 동작은 작은 크기여도 "작고 절제된"이 아니라 "작지만 빠른"이라고 적는다', () => {
    // 왜: 지하철 샷 8 은 "turns head sharply"와 "a small, restrained movement"가 같이 실렸다.
    const text = compileMotionContract(dyn({ character_motion: [{ verb: 'turns head sharply toward the window', magnitude: 'small', character_id: 'a' }] } as never), 3).text
    expect(text).toContain('a small but quick movement')
    expect(text).not.toContain('restrained')
    expect(compileMotionContract(dyn({ character_motion: [{ verb: 'turns her head', magnitude: 'small', character_id: 'a' }] } as never), 3).text).toContain('a small, restrained movement')
  })

  it('이미 그 자세로 시작하는 인물에게 장부가 더한 자세 바꿈은 싣지 않는다', () => {
    // 왜: 시브셀러 샷 8 의 Gyeyeon 은 자리 글이 "seated"인데 장부가 "sits down"을 더해, 이미 앉은 사람에게 앉으라고 했다.
    const spec = { character_blocking: [{ character_id: 'g', pose: 'seated quietly at low table' }, { character_id: 'y', pose: 'standing inside tavern' }] }
    const motions = [
      { verb: 'sits down', source: 'ledger', magnitude: 'medium', character_id: 'g' },
      { verb: 'walks out of frame to the left', source: 'ledger', magnitude: 'medium', character_id: 'g' },
      { verb: 'stands up', source: 'ledger', magnitude: 'medium', character_id: 'y' },
      { verb: 'sits down', magnitude: 'medium', character_id: 'g' },
    ]
    const kept = withoutContradictedLedgerMotions(dyn({ character_motion: motions } as never), spec)!.character_motion!
    expect(kept.map((m) => m.verb)).toEqual(['walks out of frame to the left', 'sits down'])
    expect(withoutContradictedLedgerMotions(null, spec)).toBeNull()
  })

  it('대사 말투는 목소리만이라고 적는다 — 몸 동작은 움직임 약속이 정한다', () => {
    // 왜: 시브셀러 샷 27 은 말투가 "반쯤 일어서며"인데 샷 내용에서는 앉아 있었다.
    const withTone = buildVideoPrompt({ ...BASE, dialogueLines: [{ text: 'Haha.', delivery: 'flustered, standing up half-uncertainly', characterId: 'y' }] }).fullPrompt
    expect(withTone).toContain('Delivery notes describe the voice only.')
    expect(buildVideoPrompt({ ...BASE, dialogueLines: [{ text: 'Haha.', characterId: 'y' }] }).fullPrompt).not.toContain('Delivery notes')
  })
})

describe('글이 잘리지 않고 설계와 맞기', () => {
  const long = Array.from({ length: 20 }, (_, i) => `Detail sentence number ${i + 1} describes the tavern, the lamp and the people in it.`).join(' ')

  it('움직임 약속이 있는 영상은 샷 내용을 문장 중간에서 자르지 않는다', () => {
    // 왜: 시브셀러 샷 2 · 4 · 6 · 8, 우산 샷 1 은 1,400자(대사 1,650자)에서 샷 내용이 낱말 중간에 끊겼다.
    const { fullPrompt } = buildVideoPrompt({ ...BASE, prompt: long, referenceImageRoles: ['start'] })
    expect(fullPrompt).toContain('Detail sentence number 20 describes the tavern, the lamp and the people in it.')
  })

  it('글 상한이 있는 모델은 넘치면 문장 경계에서 줄이고, 상한을 넘지 않는다', () => {
    // 왜: Kling · Happy Horse 는 2,500자까지만 받는다 — 넘치면 줄이되 반쪽 문장을 보내지 않는다.
    for (const modelKey of ['kling-o3', 'happy-horse'] as const) {
      const { fullPrompt } = buildVideoPrompt({ ...BASE, modelKey, prompt: `${long} ${long}`, referenceImageRoles: ['start'] })
      expect(fullPrompt.length).toBeLessThanOrEqual(2500)
      const head = fullPrompt.slice(0, fullPrompt.indexOf(' Reference image order'))
      expect(head.trimEnd()).toMatch(/[.!?]$/)
    }
  })

  it('문장 경계에서 줄이면 글이 너무 많이 사라질 때는 낱말 경계에서 줄인다', () => {
    // 왜: 쉼표로만 이어진 긴 샷 글은 문장 경계가 앞쪽에만 있어, 샷 내용이 통째로 빠졌다(11/23 검토).
    const list = `A tavern. ${Array.from({ length: 160 }, (_, i) => `detail ${i + 1} of the room`).join(', ')}.`
    const { fullPrompt } = buildVideoPrompt({ ...BASE, modelKey: 'happy-horse', prompt: list, referenceImageRoles: ['start'] })
    expect(fullPrompt.length).toBeLessThanOrEqual(2500)
    expect(fullPrompt).toContain('detail 20 of the room')
    expect(fullPrompt).toContain('The START image is the beginning of the shot.')
    expect(clipSentences('One. Two words here and then a very long tail without any stop', 30)).toBe('One. Two words here and then.')
  })

  it('Veo 지시문을 Happy Horse 로 넘길 때도 그림 순서 · 기준 문장을 남기고, 검은 화면 지시는 뺀다', () => {
    // 왜: Veo 지시문은 맨 끝이 검은 화면 지시라 뒤에 붙은 문장을 못 찾고 잘랐다(11/23 검토). 검은 화면은 Veo 만의 길이 맞추기다.
    const { fullPrompt, prompt_parts } = buildVideoPrompt({ ...BASE, modelKey: 'veo', durationSeconds: 5, prompt: `${long} ${long}`, referenceImageRoles: ['start'] })
    const fitted = fitPromptForModel(fullPrompt, 'happy-horse', prompt_parts)
    expect(fitted.length).toBeLessThanOrEqual(2500)
    expect(fitted).toContain('The START image is the beginning of the shot.')
    expect(fitted.endsWith('follow the references.')).toBe(true)
    expect(fitted).not.toContain('completely black screen')
  })

  it('만든 지시문이 자동 대체로 Happy Horse 에 갈 때 2,500자를 넘지 않고, 그림 순서 문장은 남긴다', () => {
    // 왜: 생성처 실패로 모델이 바뀔 때 처음 모델의 지시문을 그대로 보낸다 — Happy Horse 는 2,500자를 넘으면 거절해 대체도 실패한다.
    const { fullPrompt, prompt_parts } = buildVideoPrompt({ ...BASE, prompt: `${long} ${long}`, referenceImageRoles: ['start'] })
    expect(fullPrompt.length).toBeGreaterThan(2500)
    const fitted = fitPromptForModel(fullPrompt, 'happy-horse', prompt_parts)
    expect(fitted.length).toBeLessThanOrEqual(2500)
    expect(fitted).toContain('The START image is the beginning of the shot.')
    expect(fitted.endsWith('follow the references.')).toBe(true)
    expect(fitPromptForModel(fullPrompt, 'seedance', prompt_parts)).toBe(fullPrompt)
  })

  it('그림 없는 글 영상과 참고 그림을 손으로 이은 영상도 모델의 글 상한을 넘지 않는다', () => {
    // 왜: 앞 글 상한을 늘렸으니 손 배선 · 글 영상 길도 생성처의 글 상한을 지켜야 한다.
    expect(buildVideoPrompt({ ...BASE, modelKey: 'kling-o3', prompt: `${long} ${long}`, referenceImageRoles: ['start', 'ref'] }).fullPrompt.length).toBeLessThanOrEqual(2500)
    expect(buildVideoPrompt({ ...BASE, modelKey: 'seedance', generationMethod: 'T2V', prompt: `${long} ${long}` }).fullPrompt.length).toBeLessThanOrEqual(2500)
    // Veo 를 고른 글 영상은 맨 끝에 검은 화면 지시가 붙는다 — 그것까지 합쳐서 넘지 않는다(11/23 검토).
    expect(buildVideoPrompt({ ...BASE, modelKey: 'veo', durationSeconds: 5, generationMethod: 'T2V', prompt: `${long} ${long}` }).fullPrompt.length).toBeLessThanOrEqual(2500)
  })

  it('조각을 이을 때 마침표가 겹치지 않는다', () => {
    // 왜: "…follows.. The camera"처럼 마침표가 둘 붙었다.
    expect(buildVideoPrompt({ ...BASE, cameraPreset: { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 } }).fullPrompt).not.toMatch(/[.!?]\.\s/)
    expect(buildVideoPrompt({ ...BASE, prompt: 'She says "stop."', cameraPreset: { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 } }).fullPrompt).toContain('She says "stop." shot on Arri Alexa')
  })

  it('카메라 기종 글의 렌즈 · 색온도는 샷에 저장된 값이 처음 값이면 샷 설계를 따르고, 사람이 고친 값이면 그 값을 쓴다', () => {
    // 왜: 20샷 모두 처음 값(35mm · 5600K)이 나가 설계(예: 지하철 샷 6 은 85mm · 5000K)와 달랐다.
    const design = designGear({ lens_mm: 85, depth_of_field: 'shallow', lighting: { color_temp_kelvin: 5000 } })
    expect(design).toEqual({ lensMm: 85, kelvin: 5000, focus: 'shallow focus' })
    const stored = { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 }
    expect(buildVideoPrompt({ ...BASE, cameraPreset: stored, gearDesign: design }).fullPrompt).toContain('shot on Arri Alexa, 85mm lens, shallow focus, scene light around 5000K')
    expect(buildVideoPrompt({ ...BASE, cameraPreset: { ...stored, focalLength: 50 }, gearDesign: design }).fullPrompt).toContain('shot on Arri Alexa, 50mm, f/2.8, white balance 5600K')
    expect(buildVideoPrompt({ ...BASE, cameraPreset: stored }).fullPrompt).toContain('shot on Arri Alexa, 35mm, f/2.8, white balance 5600K')
    expect(designGear(null)).toBeNull()
    expect(designGear({})).toBeNull()
  })

  it('설계가 없는 샷에도 시간과 지어내기 금지 규칙을 싣는다', () => {
    // 왜: 우산 샷 2 · 4 는 움직임 약속이 없어 카메라가 멋대로 움직이거나 동작이 늘어질 수 있었다.
    const { fullPrompt, prompt_parts } = buildVideoPrompt({ ...BASE, dynamicSpec: null, fallbackContract: true })
    expect(fullPrompt).toMatch(/^Motion contract: Camera: hold a steady, unmoving camera unless the scene description says otherwise\./)
    expect(fullPrompt).toContain('Subjects: only the actions in the scene description.')
    expect(fullPrompt).toContain('do NOT stretch or slow it to fill 5 seconds')
    expect(fullPrompt).toContain('Do NOT invent camera movement')
    expect(prompt_parts.motionContract).toBeTruthy()
    expect(buildVideoPrompt({ ...BASE, dynamicSpec: null, fallbackContract: true, camera: { ...ZERO, zoom: 3 }, designCamera: null }).fullPrompt).toContain('Camera: zooms slowly in.')
    // 설계가 있거나 옛 요청이면 지금과 같다.
    expect(buildVideoPrompt({ ...BASE, dynamicSpec: null }).fullPrompt).not.toContain('Motion contract')
  })
})

describe('영상 길이 이 규칙을 쓰는지', () => {
  it('영상 제출은 실사 그림체일 때만 설계의 카메라 값 · 렌즈 · 인물 이름 · 움직임 글 정리를 함께 넘긴다', () => {
    // 왜: 순수 규칙만 고치고 길에서 안 쓰면 제품은 그대로고, 모든 그림체에 쓰면 오너가 정하지 않은 그림체까지 바뀐다.
    const src = readFileSync('src/lib/director/video-submit.ts', 'utf8')
    expect(src).toMatch(/const photoLook =[^\n]*resolvePhotoLook\(/)
    expect(src).toMatch(/const aligned = !standalone && !!photoLook/)
    expect(src).toMatch(/\.\.\.\(aligned \? \{\s*aligned: true,\s*designCamera,/)
    for (const key of ['gearDesign:', 'subjects,', 'fallbackContract:', 'withoutCameraMoves(', 'withoutContradictedLedgerMotions(', 'entryNote(']) expect(src).toContain(key)
  })
})
