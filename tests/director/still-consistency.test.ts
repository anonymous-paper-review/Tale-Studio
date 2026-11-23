// 실사 그림체의 실사 샷 지시문이 사진으로 만들라고 하고, 지시문 안의 말이 서로 · 러프와 어긋나지 않는지 검사한다 (오너 2026-11-23 "2 모두 적용을 실사 스타일로 지정해주고 바로 main에 올려줘")
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildPhotoGridPrompt, buildPhotoStripPrompt, describePhotoCharacterRef as describeCharacterRef, photoIdentityBlock as stripIdentityBlock } from '@/lib/director/photo-strip'
import { englishTimeOfDay, extraCharactersInShot, isReflectionShot, quotePreviousShot, roughIsStaticHold, stillCharacterLabel, stillConstraints, STILL_PANEL_RULE } from '@/lib/director/still-prompt'
import { realCineLine } from '@/lib/director/real-cine-line'
import { pairKey, planShotCharacterRefs, type ReferenceLookup } from '@/lib/director/shot-references'

const read = (rel: string) => readFileSync(rel, 'utf8')
const REAL = { clause: null }
const strip = (opts: Partial<Parameters<typeof buildPhotoStripPrompt>[1]> = {}, text = 'A shot.') => buildPhotoStripPrompt(text, { characterRefCount: 1, photoLook: REAL, ...opts })
const grid = (opts: Partial<Parameters<typeof buildPhotoGridPrompt>[1]> = {}) => buildPhotoGridPrompt(4, { characterRefCount: 1, photoLook: REAL, ...opts })
const ONE = { name: 'Tired Woman', position: 'center_third', pose: 'sitting slumped on the seat' }
const TWO = { name: 'Ian', position: 'right_third', pose: 'standing at the door' }

describe('실사 그림체를 사진으로', () => {
  const photo = { clause: 'Grade the whole image in this look: soft diffuse light.' }

  it('실사 그림체의 실사 지시문은 러프를 다시 칠하라고 하지 않고, 실제 세트에서 실제 카메라로 찍은 사진으로 만들라고 한다 (한 샷 · 네 샷)', () => {
    // 왜: 원인 ⑥ — "이 띠를 다시 칠해라(Repaint)"가 연필 그림에 색을 입힌 그림을 만들었다.
    for (const prompt of [strip({ photoLook: photo }), grid({ photoLook: photo })]) {
      expect(prompt).not.toMatch(/repaint/i)
      expect(prompt).toMatch(/Re-shoot this exact (strip|sheet) as photographs/)
      expect(prompt).toMatch(/frames of a live-action film, photographed with a real camera/)
      // 11/23 시험: "구도 그림일 뿐"이라고 하자 러프에 있는 사람이 빠졌다(우산 샷 2) — 구도 · 사람 수 · 자리 · 자세는 그대로의 도면이고, 생김새만 아니라고 적는다.
      expect(prompt).toMatch(/exact blueprint of each panel: its framing, how many figures there are, where they stand and how they pose — but not of the look/)
      expect(prompt).toMatch(/never a painted-over sketch, illustration, 3D render or game screenshot/)
    }
  })

  it('색감 문장이 있으면 글로 싣고 시간대 줄에서 색 보정 말을 빼며, 그림체 기준 그림 말은 싣지 않는다', () => {
    // 왜: 색은 색감 문장이 정한다 — 시간대 줄이 다시 색 보정을 시키면 두 줄이 다툰다. 붙지 않은 기준 그림을 가리키면 안 된다.
    for (const prompt of [strip({ photoLook: photo, sceneLighting: 'Night' }), grid({ photoLook: photo, sceneLighting: 'Night' })]) {
      expect(prompt).toContain('- Grade the whole image in this look: soft diffuse light.')
      expect(prompt).not.toMatch(/color grade consistently|light and color grade/)
      expect(prompt).not.toMatch(/style reference/i)
    }
    expect(strip({ photoLook: { clause: null }, sceneLighting: 'Night' })).toMatch(/light and color grade consistently/)
  })

  it('피부 · 옷감 · 재질이 실제 사진 같아야 한다는 문장을 싣고, 렌즈와 색은 그 문장에 적지 않는다 (한 샷 · 네 샷)', () => {
    // 왜: 오너 11/23 "일본 멜로를 선택한 경우가 실사에 제일 가깝게 나와" — 일본 멜로 2번에만 있던 사진 문장이 실사에는 없었다.
    //   그 문장의 35mm 렌즈와 파스텔 · 번짐 색은 샷 설계와 다투고 일본 멜로의 것이라 빼고 적는다.
    for (const prompt of [strip(), grid()]) {
      expect(prompt).toMatch(/true-to-life skin texture with visible pores, real fabric weave and true material response/)
      expect(prompt).toMatch(/A real photograph, not an illustration, painting or anime\./)
      expect(prompt).not.toMatch(/35mm|pastel|bloom|halation|wistful/)
    }
    // 색감 문장에 이미 있으면 두 번 싣지 않는다.
    const melo = { clause: 'Grade the whole image in this look: soft light. A real photograph, not an illustration, painting or anime.' }
    for (const prompt of [strip({ photoLook: melo }), grid({ photoLook: melo })]) expect(prompt.match(/A real photograph, not an illustration/g)?.length).toBe(1)
  })
})

describe('인물 배정이 러프와 어긋나지 않기', () => {
  it('인물이 한 명인 샷은 인물 줄에 화면 자리를 적지 않고 자세만 적는다', () => {
    // 왜: 지하철 샷 1 · 4 · 6 은 인물 줄이 "화면 가운데"인데 러프와 샷 내용은 왼쪽이었다 — 인형이 하나뿐이면 자리로 가릴 것이 없다.
    expect(stripIdentityBlock([ONE])[0]).toContain('reference image 2 = Tired Woman (sitting slumped on the seat)')
    expect(stripIdentityBlock([ONE])[0]).not.toContain('center of the frame')
    expect(grid({ characterRefs: [{ name: 'Tired Woman' }], columnCharacters: [[ONE]] })).toContain('Column 1: Tired Woman (sitting slumped on the seat)')
  })

  it('인물이 둘 이상이면 자리와 자세를 함께 적는다', () => {
    // 왜: 두 인형 중 누가 누구인지는 자리로 가린다(9/2 약속, 정상 경로 고정).
    expect(stripIdentityBlock([ONE, TWO])[0]).toContain('reference image 2 = Tired Woman (center of the frame — sitting slumped on the seat)')
    expect(stripIdentityBlock([ONE, TWO])[0]).toContain('reference image 3 = Ian (right third of the frame — standing at the door)')
  })

  it('시작에 없고 끝에 들어오는 인물은 시작 칸에 없고 끝 칸에 어느 쪽에서 들어오는지 적고, 나가는 인물은 끝 칸에 없다고 적는다', () => {
    // 왜: 시브셀러 샷 4 의 Okhwa 는 인물 줄이 "화면 밖 왼쪽"뿐이라 시작 칸에 그려졌다.
    const layout = (start: object, end: object) => ({ screen_layout: { characters: [{ character_id: 'okhwa', start, end }] } })
    const enters = stillCharacterLabel({ characterId: 'okhwa', name: 'Okhwa', position: 'off_left', pose: 'standing inside doorway' },
      layout({ in_frame: false, position_in_frame: 'off_left' }, { in_frame: true, position_in_frame: 'left_third' }))
    expect(describeCharacterRef(enters)).toBe('Okhwa (not in the START panel; comes into frame from the left and is in the left third of the frame in the END panel — standing inside doorway)')
    // 카메라 뒤에 선 사람은 무대 계산이 늘 "왼쪽"으로 적는다(screen_x 0) — 어느 쪽인지 적지 않는다.
    const behind = stillCharacterLabel({ characterId: 'okhwa', name: 'Okhwa', position: null, pose: 'standing' },
      { screen_layout: { characters: [{ character_id: 'okhwa', start: { in_frame: false, position_in_frame: 'off_left', screen_x: 0 }, end: { in_frame: true, position_in_frame: 'right_third' } }] } })
    expect(describeCharacterRef(behind)).toBe('Okhwa (not in the START panel; comes into frame and is in the right third of the frame in the END panel — standing)')
    const leaves = stillCharacterLabel({ characterId: 'okhwa', name: 'Okhwa', position: 'left_third', pose: 'standing' },
      layout({ in_frame: true, position_in_frame: 'left_third' }, { in_frame: false, position_in_frame: 'off_left' }))
    // 러프 끝 칸에 나가는 사람이 조금 남아 있을 수 있다(시브셀러 샷 8) — "없다"고 적으면 러프와 다시 어긋난다.
    expect(describeCharacterRef(leaves)).toBe('Okhwa (left third of the frame in the START panel; leaving by the END panel, where only what the pencil panel still shows of them stays — standing)')
    const stays = stillCharacterLabel({ characterId: 'okhwa', name: 'Okhwa', position: 'left_third', pose: 'standing' }, null)
    expect(describeCharacterRef(stays)).toBe('Okhwa (left third of the frame — standing)')
  })

  it('인물이 둘 이상이면 시작 칸의 왼쪽부터 차례를 적고, 끝 칸 차례가 다르면 끝 칸도 적는다', () => {
    // 왜: 시브셀러 샷 8 은 가운데 인형(부채를 든 Yeong-gam)이 전에도 후에도 Gyeyeon 으로 그려졌다 — 괄호의 자리만으로는 누가 어느 인형인지 놓친다.
    const at = (id: string, name: string, start: object | null, end: object | null = null) =>
      stillCharacterLabel({ characterId: id, name, position: null, pose: 'standing' }, { screen_layout: { characters: [{ character_id: id, start, end }] } })
    const okhwa = at('okhwa', 'Okhwa', { in_frame: true, screen_x: -0.85 }), yeong = at('yeong', 'Yeong-gam', { in_frame: true, screen_x: 0 }), gye = at('gye', 'Gyeyeon', { in_frame: true, screen_x: 0.83 })
    expect(stripIdentityBlock([gye, okhwa, yeong])[0]).toContain('Left to right in the START panel: Okhwa, Yeong-gam, Gyeyeon.')
    // 끝에서 들어오는 인물은 시작 차례에 없고 끝 차례에 있다(시브셀러 샷 4).
    const enters = at('okhwa', 'Okhwa', { in_frame: false, position_in_frame: 'off_left', screen_x: -6.3 }, { in_frame: true, screen_x: -0.48 })
    const y4 = at('yeong', 'Yeong-gam', { in_frame: true, screen_x: 0 }, { in_frame: true, screen_x: 0 }), g4 = at('gye', 'Gyeyeon', { in_frame: true, screen_x: 0.25 }, { in_frame: true, screen_x: 0.17 })
    expect(stripIdentityBlock([g4, enters, y4])[0]).toContain('Left to right in the START panel: Yeong-gam, Gyeyeon. Left to right in the END panel: Okhwa, Yeong-gam, Gyeyeon.')
    // 자리가 거의 같거나 모르는 인물이 있으면 차례를 적지 않는다. 한 명이면 적지 않는다.
    expect(stripIdentityBlock([at('a', 'A', { in_frame: true, screen_x: 0.1 }), at('b', 'B', { in_frame: true, screen_x: 0.15 })])[0]).not.toContain('Left to right')
    expect(stripIdentityBlock([okhwa, { name: 'Dohyun' }])[0]).not.toContain('Left to right')
    expect(stripIdentityBlock([okhwa])[0]).not.toContain('Left to right')
    // 네 샷 시트도 칸마다 같은 차례를 적는다.
    expect(grid({ characterRefs: [{ name: 'Gyeyeon' }, { name: 'Okhwa' }, { name: 'Yeong-gam' }], columnCharacters: [[gye, okhwa, yeong]] })).toContain('Column 1: Gyeyeon (standing) and Okhwa (standing) and Yeong-gam (standing). Left to right in row 1: Okhwa, Yeong-gam, Gyeyeon.')
  })

  it('인물이 둘 이상이면 이름 뒤에 짧은 겉모습을 적고, 한 명이면 적지 않는다', () => {
    // 왜: 이름만으로는 어느 시트가 누구인지 잇지 못해 시브셀러 샷 8 의 가운데 사람(Yeong-gam)이 Gyeyeon 으로 그려졌다.
    const look = { name: 'Yeong-gam', look: 'a 60-year-old man with white hair', position: 'center_third', pose: 'standing' }
    expect(stripIdentityBlock([look, TWO])[0]).toContain('reference image 2 = Yeong-gam, a 60-year-old man with white hair (center of the frame — standing)')
    expect(stripIdentityBlock([look])[0]).toContain('reference image 2 = Yeong-gam (standing)')
    const sheet = grid({ characterRefs: [{ name: 'Yeong-gam', look: 'a 60-year-old man with white hair' }, { name: 'Ian' }], columnCharacters: [[look, TWO]] })
    expect(sheet).toContain('reference image 2 = Yeong-gam, a 60-year-old man with white hair; reference image 3 = Ian.')
    expect(sheet).toContain('Column 1: Yeong-gam (center of the frame — standing) and Ian')
    expect(grid({ characterRefs: [{ name: 'Yeong-gam', look: 'a 60-year-old man with white hair' }], columnCharacters: [[look]] })).toContain('reference image 2 = Yeong-gam.')
  })

  it('괄호가 하나도 없으면 괄호를 설명하는 문장을 싣지 않고, 샷 설명을 읽고 누가 어느 인형인지 정하게 한다', () => {
    // 왜: 우산 샷 2 · 4 는 자리 · 자세가 없는데 "괄호가 자리를 알려 준다"는 문장만 남아 두 인형이 누구인지 알 수 없었다.
    const lines = stripIdentityBlock([{ name: 'Dohyun' }, { name: 'Seoyun' }])
    expect(lines[0]).not.toMatch(/words in parentheses/)
    expect(lines[0]).toMatch(/match each mannequin to the character whose action and look fit the shot description/i)
    // 누구인지만 정하고 사람을 더하거나 빼지 않는다 — 우산 샷 2 는 시작 칸에서 Dohyun 이 빠졌다.
    expect(lines[0]).toMatch(/only to tell who is who, never to add or remove anyone/)
    expect(stripIdentityBlock([ONE, TWO])[0]).toMatch(/words in parentheses say where that figure stands in the pencil frame and what it is doing/)
  })

  it('인물이 한 명이면 괄호 설명도 자세만 말하고, 자세 글 끝의 마침표는 싣지 않는다', () => {
    // 왜: 자리를 적지 않으면서 "괄호가 자리를 알려 준다"고 하면 다시 허공을 가리킨다.
    const [line] = stripIdentityBlock([{ name: 'Tired Woman', position: 'center_third', pose: 'Sitting slumped on the seat.' }])
    expect(line).toContain('reference image 2 = Tired Woman (Sitting slumped on the seat).')
    expect(line).toContain('The words in parentheses say what that figure is doing.')
    expect(line).not.toMatch(/where that figure stands/)
  })

  it('인물이 한 명이면 "위에 적힌 자리"라고 하지 않고, 사람이 없는 샷 · 칸은 러프 칸 규칙에서 사람을 빼고 적는다', () => {
    // 왜: 자리를 적지 않았는데 "위에 적힌 자리의 인형"이라고 하면 허공을 가리키고, "사람을 그리지 마라"와 "러프 칸에 있는 사람 그대로"가 다툰다(11/23 검토).
    expect(stripIdentityBlock([ONE])[1]).toMatch(/Replace the wooden mannequin doing that with this character/)
    expect(stripIdentityBlock([ONE])[1]).not.toMatch(/assigned to its place above/)
    expect(stripIdentityBlock([ONE, TWO])[1]).toMatch(/assigned to its place above/)
    expect(strip({ noPeople: true })).not.toMatch(/exactly the figures its pencil panel has/)
    expect(strip({ noPeople: true })).toMatch(/The pencil panels decide the framing and where things stand/)
    expect(grid({ characterRefs: [{ name: 'A' }], columnCharacters: [[ONE], []] })).toMatch(/a column marked "no character" stays free of people/)
  })

  it('인물이 한 명이고 자세 글도 없으면 "그렇게 하는 인형"이라고 하지 않고 가운데 인물 인형이라고 적는다', () => {
    // 왜: 목록에 없던 인물을 더한 샷 · 설계 없는 샷은 앞에 적힌 행동이 없어 "doing that"이 허공을 가리켰다(11/23 검토).
    expect(stripIdentityBlock([{ name: 'Mina' }])[1]).toMatch(/Replace the main wooden mannequin with this character/)
    expect(stripIdentityBlock([{ name: 'Mina' }])[1]).not.toMatch(/doing that/)
    // 둘 이상인데 자리 · 자세가 하나도 없으면 "위에 적힌 자리" 대신 앞 줄에서 짝지은 대로라고 적는다.
    expect(stripIdentityBlock([{ name: 'Dohyun' }, { name: 'Seoyun' }])[1]).toMatch(/Replace each wooden mannequin with the character it was matched to\./)
    expect(stripIdentityBlock([{ name: 'Dohyun' }, { name: 'Seoyun' }])[1]).not.toMatch(/its place above/)
  })

  it('어느 칸에 없는 인물이 있거나 비친 모습을 그리는 샷이면 "한 칸에 한 번" 줄에 예외를 적는다', () => {
    // 왜: 시브셀러 샷 4(시작 칸에 없음)와 지하철 샷 5 · 6 · 9(창에 비친 얼굴)는 "모든 인물이 칸마다 딱 한 번"과 정면으로 다퉜다.
    const entering = { name: 'Okhwa', presence: 'not in the START panel; comes into frame from the left and is in the left third of the frame in the END panel', pose: null }
    expect(stripIdentityBlock([ONE, entering])[1]).toContain('Where a line above says a character is not in a panel, that panel has none of them.')
    expect(stripIdentityBlock([ONE], { reflection: true })[1]).toContain("A reflection in glass, a mirror or water shows the same character and is not a second person")
    expect(stripIdentityBlock([ONE, TWO])[1]).not.toMatch(/reflection|that panel has none/)
    expect(strip({ characterRefs: [ONE], reflection: true })).toContain('A reflection in glass')
    expect(grid({ characterRefs: [{ name: 'Tired Woman' }], columnCharacters: [[ONE]], reflection: true })).toContain('A reflection in glass')
    expect(grid({ characterRefs: [{ name: 'Tired Woman' }, { name: 'Okhwa' }], columnCharacters: [[ONE, entering]] })).toContain('Where a line above says a character is not in a panel')
  })

  it('자세 글은 낱말 중간에서 자르지 않는다', () => {
    // 왜: 지하철 샷 5 의 자세 글이 110자에서 잘려 "upwa"로 끝났다.
    const pose = 'sitting in office blouse with dark leather shoulder bag strap across her chest, starting to tilt her head upward toward the window and then holding still for a long moment while the train shakes'
    const text = describeCharacterRef({ name: 'A', pose })
    expect(text).not.toMatch(/\bupwa\b/)
    const shown = text.slice(text.indexOf('(') + 1, -1).replace(/…$/, '')
    expect(pose.startsWith(shown)).toBe(true)
    expect(pose[shown.length] === undefined || /[\s,]/.test(pose[shown.length])).toBe(true)
  })

  it('누가 어느 칸에 어디서 어떤 자세인지는 러프 칸이 정하고, 다른 줄이 다르게 말하면 러프 칸을 따르라고 적는다 (한 샷 · 네 샷)', () => {
    // 왜: 사람이 보고 확정한 것은 러프다 — 지하철 샷 4 는 글이 오른쪽 의자, 러프가 왼쪽이었다.
    expect(strip()).toContain(STILL_PANEL_RULE.strip)
    expect(grid()).toContain(STILL_PANEL_RULE.grid)
    expect(STILL_PANEL_RULE.strip).toMatch(/follow the panels/)
    for (const rule of [STILL_PANEL_RULE.strip, STILL_PANEL_RULE.grid]) expect(rule).toMatch(/no one added and no one missing/)
    // 인물 줄 · 샷 설명보다 앞에 적는다 — 뒤에 적으면 샷 설명의 시간 순서("옆으로 들어선다")가 시작 칸 사람을 뺐다.
    expect(strip({ characterRefs: [ONE, TWO] }).indexOf(STILL_PANEL_RULE.strip)).toBeLessThan(strip({ characterRefs: [ONE, TWO] }).indexOf('- Character references'))
    expect(grid({ characterRefs: [{ name: 'A' }], columnCharacters: [[ONE]] }).indexOf(STILL_PANEL_RULE.grid)).toBeLessThan(grid({ characterRefs: [{ name: 'A' }], columnCharacters: [[ONE]] }).indexOf('- Character references'))
  })
})

describe('샷에 나오는 인물을 빠뜨리지 않기', () => {
  const names = new Map([['seoyun', ['Seoyun']], ['dohyun', ['Dohyun']], ['tired_woman', ['지친 여자', 'Tired Woman']]])

  it('샷 설계에 화면 안으로 적혀 있고 샷 글에 이름이 나오는 인물은, 인물 목록에 없어도 그 샷의 인물로 본다', () => {
    // 왜: 우산 샷 1 은 Dohyun 이 글 · 러프에 나오는데 인물 목록에 없어 시트가 빠지고 "이름 없는 배경 사람"이 됐다.
    const shot = {
      shot_id: 's', characters: ['seoyun'], prompt: 'Seoyun waits. Dohyun steps into view holding an umbrella.',
      static_spec: { character_blocking: [{ character_id: 'seoyun' }, { character_id: 'dohyun' }], screen_layout: { characters: [{ character_id: 'dohyun', start: { in_frame: true } }] } },
    }
    expect(extraCharactersInShot(shot, names)).toEqual(['dohyun'])
    // 글에 이름이 없으면(사람이 샷에서 뺀 인물의 설계가 남은 경우) 더하지 않는다.
    expect(extraCharactersInShot({ ...shot, prompt: 'Seoyun waits alone.' }, names)).toEqual([])
    // 화면 밖이면 더하지 않는다.
    expect(extraCharactersInShot({ ...shot, static_spec: { ...shot.static_spec, screen_layout: { characters: [{ character_id: 'dohyun', start: { in_frame: false } }], off_frame: ['dohyun'] } } }, names)).toEqual([])
    // 사람이 Director 에서 참조 목록을 손댄 샷은 그 목록이 이긴다 — 그 목록에 없으면 더하지 않고, 있으면 더한다(우산 샷 1: 사람이 이은 Dohyun 이 빠졌다).
    expect(extraCharactersInShot({ ...shot, director_refs: { characters: ['seoyun'], locations: [] } }, names)).toEqual([])
    expect(extraCharactersInShot({ ...shot, director_refs: { characters: ['seoyun', 'dohyun'], locations: [] } }, names)).toEqual(['dohyun'])
  })

  it('거울이나 창에 비친 모습을 그리는 샷은, 그 샷에서 움직이는 인물을 화면 밖으로 보지 않는다', () => {
    // 왜: 지하철 샷 9 는 창에 비친 얼굴 샷인데 무대 계산이 인물을 화면 밖으로 봐서 시트가 빠지고 "사람을 그리지 마라"가 붙었다.
    const shot = {
      shot_id: 's', characters: [] as string[], prompt: 'Close-up on the window glass. Her mirrored face remains frozen in the reflection.',
      static_spec: { character_blocking: [], screen_layout: { characters: [], off_frame: ['tired_woman'] } },
      dynamic_spec: { character_motion: [{ character_id: 'tired_woman', verb: 'remains completely frozen' }] },
    }
    expect(extraCharactersInShot(shot, names)).toEqual(['tired_woman'])
    // 화면 안에 다른 인물이 있으면 비친 것은 그 사람일 수 있다 — 이름이 나온 화면 밖 인물만 더한다. 시점 인물(카메라가 그 사람의 눈)은 더하지 않는다.
    const withOther = { ...shot, characters: ['seoyun'], prompt: 'Seoyun studies her own reflection in the window.' }
    expect(extraCharactersInShot(withOther, names)).toEqual([])
    expect(extraCharactersInShot({ ...withOther, prompt: 'Behind Seoyun, the reflection of the Tired Woman: her mirrored face is frozen. Tired Woman stares.' }, names)).toEqual(['tired_woman'])
    expect(extraCharactersInShot({ ...shot, static_spec: { ...shot.static_spec, screen_layout: { characters: [], off_frame: ['tired_woman'], pov_of: 'tired_woman' } } }, names)).toEqual([])
    // 비친 모습이 아니면 프레임 밖 봉인(9/5 약속)은 그대로다.
    expect(extraCharactersInShot({ ...shot, prompt: 'Close-up on the window glass at night.' }, names)).toEqual([])
    // 네온 반사 · 유리에 비친 빛은 사람의 비친 모습이 아니다 — 화면 밖에서 말하는 사람을 그리게 되면 안 된다.
    expect(extraCharactersInShot({ ...shot, prompt: 'Gyeyeon drinks under neon reflections.', dynamic_spec: { character_motion: [{ character_id: 'tired_woman', verb: 'speaks' }] } }, names)).toEqual([])
    // 장부가 더한 배경 동작은 근거가 아니다.
    expect(extraCharactersInShot({ ...shot, dynamic_spec: { character_motion: [{ character_id: 'tired_woman', verb: 'walks', source: 'ledger' }] } }, names)).toEqual([])
  })

  it('행동 글이 있으면 그 글로만 찾는다 — 채팅에서 뺀 인물을 옛 샷 프롬프트가 되살리지 않는다', () => {
    // 왜: 채팅으로 인물을 빼면 인물 목록과 행동 글만 바뀌고 샷 프롬프트 · 설계는 옛것이 남는다(11/23 검토).
    const shot = {
      shot_id: 's', characters: ['seoyun'], prompt: 'Seoyun waits while Dohyun opens an umbrella.', action_description: 'Seoyun waits alone in the rain.',
      static_spec: { character_blocking: [{ character_id: 'seoyun' }, { character_id: 'dohyun' }], screen_layout: { characters: [{ character_id: 'dohyun', start: { in_frame: true } }] } },
    }
    expect(extraCharactersInShot(shot, names)).toEqual([])
    expect(extraCharactersInShot({ ...shot, action_description: 'Dohyun stands a few steps behind Seoyun.' }, names)).toEqual(['dohyun'])
    expect(extraCharactersInShot({ ...shot, action_description: null, action_description_native: '서윤이 혼자 기다린다.' }, names)).toEqual([])
    expect(extraCharactersInShot({ ...shot, action_description: null }, names)).toEqual(['dohyun'])
    // 흔한 낱말과 같은 이름("Will")은 대문자로 시작하는 이름만 이름이다.
    const cast = new Map([['will', ['Will']]])
    const will = (action: string) => ({ shot_id: 's', characters: [] as string[], action_description: action, static_spec: { character_blocking: [{ character_id: 'will' }] } })
    expect(extraCharactersInShot(will('The door will open slowly.'), cast)).toEqual([])
    expect(extraCharactersInShot(will('She hands the letter to Will.'), cast)).toEqual(['will'])
  })

  it('이름을 모두 대문자로 적었거나 첫 글자만 대문자로 적었거나 같은 이름으로 본다', () => {
    // 왜: 저장된 이름이 "MAYA"인데 글은 "Maya steps into view"라 그 샷의 인물을 빠뜨렸다(11/23 검토). 소문자 낱말("will")은 여전히 이름이 아니다.
    const shot = (action: string) => ({ shot_id: 's', characters: [] as string[], action_description: action, static_spec: { character_blocking: [{ character_id: 'p' }] } })
    expect(extraCharactersInShot(shot('Maya steps into view.'), new Map([['p', ['MAYA']]]))).toEqual(['p'])
    expect(extraCharactersInShot(shot('MAYA steps into view.'), new Map([['p', ['Maya']]]))).toEqual(['p'])
    expect(extraCharactersInShot(shot('The door will open.'), new Map([['p', ['WILL']]]))).toEqual([])
  })

  it('이름은 낱말로 찾는다 — 다른 낱말 속 글자는 이름이 아니다', () => {
    // 왜: "Ian"이 "guardian" 안에 있다고 그 샷의 인물로 보면 없는 사람이 그려진다.
    const cast = new Map([['ian', ['Ian']], ['seoyun', ['서윤']]])
    const shot = (prompt: string) => ({ shot_id: 's', characters: [] as string[], prompt, static_spec: { character_blocking: [{ character_id: 'ian' }, { character_id: 'seoyun' }] } })
    expect(extraCharactersInShot(shot('A guardian statue stands by the piano.'), cast)).toEqual([])
    expect(extraCharactersInShot(shot("Ian's hand rests on the piano."), cast)).toEqual(['ian'])
    expect(extraCharactersInShot(shot('서윤이 우산을 편다.'), cast)).toEqual(['seoyun'])
  })

  it('사람의 비친 모습을 그리는 샷만 비친 모습 샷으로 본다', () => {
    // 왜: "유리에 빛이 비친다" · "네온 반사"까지 비친 모습으로 보면 없는 얼굴이 유리에 그려진다.
    for (const prompt of ['She gazes at her faint reflection in the dark window.', 'The glass sharply reflects her identical facial features.', 'In the reflection on the glass surface, her mirrored face stays frozen.', "Okhwa's reflection trembles in the bowl.", '거울 속 여자의 얼굴이 웃는다.', '창에 비친 얼굴이 굳는다.'])
      expect({ prompt, hit: isReflectionShot({ prompt }) }).toEqual({ prompt, hit: true })
    for (const prompt of ['Cold overhead light reflects softly off the glass window behind her.', 'Under neon reflections, Gyeyeon drinks.', 'The window reflects the dark empty train environment.', 'She reflects on her past.', '젖은 도로에 불빛이 반사된다.',
      'Cold light reflects off his eyes.', 'Warm light reflects on her face as she reads.', 'A neon sign and its pink reflection shimmer in a puddle.', 'In the rearview mirror the black sedan closes in.', '달빛에 비친 얼굴이 하얗다.', '가로등 불빛에 비친 눈이 내린다.'])
      expect({ prompt, hit: isReflectionShot({ prompt }) }).toEqual({ prompt, hit: false })
  })

  it('거울 앞의 자기 모습 · 사람의 비친 얼굴을 흔히 쓰는 말도 비친 모습으로 보고, 건물 · 풍경이 비친 것은 아니다', () => {
    // 왜: "거울 속 자기를 본다" · "백미러에 Elena 의 눈이 비친다"를 놓치면 "한 칸에 한 번"과 다시 다투고, 탑의 비친 모습까지 보면 없는 얼굴이 그려진다(11/23 검토).
    for (const prompt of ['Elena looks at herself in the mirror.', "The woman's reflection stares back from the glass.", 'Her face is mirrored in the dark glass.', "A rearview mirror reflecting Elena's gentle eyes.", 'The reflection of a woman wavers in the window.', 'His eyes reflected in the visor.'])
      expect({ prompt, hit: isReflectionShot({ prompt }) }).toEqual({ prompt, hit: true })
    for (const prompt of ['A reflection of Seoul Tower shimmers in the river.', 'The reflection of the City lights dances on the wet road.', 'She fixes her hair by herself before the mirror shop opens tomorrow.', 'Firelight reflected in the window behind them.', 'Pale window light reflects softly on her face.'])
      expect({ prompt, hit: isReflectionShot({ prompt }) }).toEqual({ prompt, hit: false })
    // 사람이 아닌 것의 "silhouette · body", 창가 자리에 혼자 앉은 사람, 얼굴 둘레의 빛은 아니다(11/23 3차 검토).
    for (const prompt of ["The skyline's silhouette reflected in the river.", "The car's body reflected in the shop window.", 'Mina sits by herself in the window seat.', "Seoul Tower's reflection shimmers in the river.", 'Pale window light reflects softly around her face.', 'He glances into the rearview mirror at the sedan.', 'Tears on her face reflected in the candlelight.'])
      expect({ prompt, hit: isReflectionShot({ prompt }) }).toEqual({ prompt, hit: false })
    for (const prompt of ['Her face reflects in the dark window.', 'His eyes reflect in the mirror.', 'He looks into the mirror.', 'Her face appears in the mirror.', "Elena's face is reflected in the glass."])
      expect({ prompt, hit: isReflectionShot({ prompt }) }).toEqual({ prompt, hit: true })
    // 거울 속 자신에게 하는 다른 동작, 호수에 비친 얼굴, 이름이 성씨로 끝나는 사람도 알아보고, 물에 뜬 몸 · 거울 같은 호수 · 거울 공은 아니다(11/23 4차 검토).
    for (const prompt of ['She smiles at herself in the mirror.', 'He talks to himself in the mirror.', 'Her face is reflected in the still lake.', 'His face is mirrored in the pond.', "Elena's silhouette is reflected in the window.", "The mirror reflects Elena's full figure.", "Mina Park's reflection stares back from the window."])
      expect({ prompt, hit: isReflectionShot({ prompt }) }).toEqual({ prompt, hit: true })
    for (const prompt of ['His body floats in the water.', 'Her silhouette appears in the window.', 'She gazes at the mirror-still lake.', 'The tourists look at the mirror ball above the dance floor.', 'She watches the rain by herself in the window seat.'])
      expect({ prompt, hit: isReflectionShot({ prompt }) }).toEqual({ prompt, hit: false })
    // 이름은 낱말로 견준다 — "skyline" 속의 Sky, "Han River"의 Han 은 그 사람이 아니다.
    expect(isReflectionShot({ prompt: 'A reflection of the skyline trembles in the glass.' }, ['Sky'])).toBe(false)
    expect(isReflectionShot({ prompt: 'Lights dance on the reflection of the Han River.' }, ['Han'])).toBe(false)
    expect(isReflectionShot({ prompt: 'A reflection of Han trembles in the bowl.' }, ['Han'])).toBe(true)
    // 인물 이름을 알면 "Okhwa 의 비친 모습"도 그 사람이다.
    expect(isReflectionShot({ prompt: 'A reflection of Okhwa trembles in the bowl.' }, ['Okhwa'])).toBe(true)
    expect(isReflectionShot({ prompt: 'A reflection of Seoul Tower shimmers in the river.' }, ['Okhwa'])).toBe(false)
  })

  it('그렇게 더한 인물의 시트를 붙이고, 시트가 없으면 빠진 시트로 알린다', () => {
    // 왜: 시트 없이 그리면 얼굴을 지어낸다 — 없으면 막고 알리는 것이 9/2 약속이다.
    const lookup: ReferenceLookup = {
      characterById: new Map([['seoyun', { name: 'Seoyun' }], ['dohyun', { name: 'Dohyun' }]]),
      sheetByPair: new Map<string, string | null>([[pairKey('seoyun', 'current'), 'https://x/s.png'], [pairKey('dohyun', 'current'), 'https://x/d.png']]),
      defaultKeyById: new Map([['seoyun', 'current'], ['dohyun', 'current']]),
    }
    const shot = {
      shot_id: 's', characters: ['seoyun'], character_appearance_keys: { seoyun: 'current' }, prompt: 'Seoyun waits. Dohyun steps into view.',
      static_spec: { character_blocking: [{ character_id: 'seoyun', pose: 'standing' }, { character_id: 'dohyun', pose: 'stepping out', position_in_frame: 'right_third' }], screen_layout: { characters: [{ character_id: 'dohyun', start: { in_frame: true } }] } },
    }
    const photo = { photo: true }
    expect(planShotCharacterRefs(shot, lookup, photo).characterRefs.map((r) => r.characterId)).toEqual(['dohyun', 'seoyun'])
    // 실사 그림체가 아니면 지금처럼 인물 목록에 있는 사람만이고, 이름 · 겉모습 칸도 더하지 않는다.
    expect(planShotCharacterRefs(shot, lookup).characterRefs).toEqual([expect.objectContaining({ characterId: 'seoyun' })])
    expect(Object.keys(planShotCharacterRefs(shot, lookup).characterRefs[0])).not.toContain('look')
    // 겉모습 글은 그 샷의 모습(없으면 기본 모습)에서 첫 마디만 — 없으면 null.
    expect(planShotCharacterRefs(shot, { ...lookup, lookByPair: new Map([[pairKey('dohyun', 'current'), 'A 26-year-old man in a navy coat. He smiles.']]) }, photo).characterRefs.map((r) => r.look)).toEqual(['a 26-year-old man in a navy coat', null])
    const noSheet = { ...lookup, sheetByPair: new Map<string, string | null>([[pairKey('seoyun', 'current'), 'https://x/s.png']]) }
    expect(planShotCharacterRefs(shot, noSheet, photo).missing.map((m) => m.characterId)).toEqual(['dohyun'])
  })
})

describe('샷 글과 주의가 러프와 다투지 않기', () => {
  const notes = [
    { constraint_target: 'visual', category: 'continuity', constraint: 'Okhwa (okhwa) is OFF-SCREEN in this shot, not inside the frame at all: do not draw Okhwa anywhere in START or END.' },
    { constraint_target: 'visual', category: 'continuity', constraint: 'Continuity: during this shot Gyeyeon (gyeyeon) sits down (standing → sitting) — show the change between START and END.' },
    { constraint_target: 'visual', category: 'action_budget', constraint: 'Gyeyeon must be shown either seated at the table or walking out of frame — not both.' },
    { constraint_target: 'visual', category: 'continuity', constraint: 'The skyway stays visible in the background.' },
    { constraint_target: 'report_only', category: 'continuity', constraint: 'hidden' },
  ]

  it('자리 글과 다른 자세에서 시작하는 움직임 주의와 동작량 주의는 싣지 않고, 나머지 움직임 주의는 싣는다', () => {
    // 왜: 시브셀러 샷 8 · 27 은 이미 앉은 사람에게 "앉는다", 일어선 사람에게 "앉은 자세에서"가 실려 러프와 달라졌다.
    //   모두 빼면 나무 인형의 앞뒤를 모르는 모델이 샷 4 의 "카메라 쪽으로 걸어온다"를 놓친다(11/23 시험: 끝 칸에서 뒤돌아 서 있음).
    const pose = (text: string) => ({ character_blocking: [{ character_id: 'gyeyeon', pose: text }] })
    expect(stillConstraints(notes, [], pose('seated quietly at low table'))).toEqual([notes[0].constraint, notes[3].constraint])
    expect(stillConstraints(notes, [], pose('standing by the table'))).toEqual([notes[0].constraint, notes[1].constraint, notes[3].constraint])
    const walk = { constraint_target: 'visual', category: 'continuity', constraint: 'Continuity: during this shot Gyeyeon (gyeyeon) walks toward the camera — show the change between START and END.' }
    expect(stillConstraints([walk], [], pose('standing on porch edge'))).toEqual([walk.constraint])
    const bow = { constraint_target: 'visual', category: 'continuity', constraint: 'Continuity: during this shot Seong-gi (seong_gi) shifts from sitting to kneeling (sitting → kneeling) — show the change between START and END.' }
    expect(stillConstraints([bow], [], { character_blocking: [{ character_id: 'seong_gi', pose: 'Standing up abruptly from wooden bench, starting to bow forward' }] })).toEqual([])
    // 자리 글이 없으면 어긋나는지 알 수 없다 — 싣는다(지금 그대로).
    expect(stillConstraints([bow], [], null)).toEqual([bow.constraint])
  })

  it('걷거나 뛰는 자리 글은 선 자세로 본다 — 앉고 눕는 움직임 주의를 버리지 않는다', () => {
    // 왜: "의자로 걸어간다"에서 시작하는 사람의 "앉는다" 주의까지 자세가 다르다고 버렸다(11/23 검토). 걷는 사람도 서 있다.
    const pose = (text: string) => ({ character_blocking: [{ character_id: 'gyeyeon', pose: text }] })
    const note = (from: string, to: string) => ({ constraint_target: 'visual', category: 'continuity', constraint: `Continuity: during this shot Gyeyeon (gyeyeon) moves (${from} → ${to}) — show the change between START and END.` })
    for (const [text, from, to] of [['walking toward the chair', 'standing', 'sitting'], ['running down the hall', 'standing', 'lying'], ['standing by the door', 'walking', 'sitting']]) {
      expect(stillConstraints([note(from, to)], [], pose(text))).toEqual([note(from, to).constraint])
    }
    expect(stillConstraints([note('walking', 'sitting')], [], pose('seated at the table'))).toEqual([])
  })

  it('이 샷의 인물로 본 사람을 그리지 말라는 주의는 싣지 않는다', () => {
    // 왜: 지하철 샷 9 — 인물로 보고 시트를 붙이면서 "그리지 마라"를 함께 실으면 다시 어긋난다.
    expect(stillConstraints(notes, ['okhwa'], { character_blocking: [{ character_id: 'gyeyeon', pose: 'seated' }] })).toEqual([notes[3].constraint])
  })

  it('앞 샷 글은 문장 중간에서 자르지 않고 문장 단위로 인용한다', () => {
    // 왜: 앞 샷 인용 15개가 모두 110자에서 문장 중간("silve", "conver")에 끊겼다.
    const text = 'A wide angle shot inside an empty late-night subway car. Cold fluorescent lights illuminate long rows of silver metal seats and overhead hanging handles. Dark glass windows show the tunnel.'
    expect(quotePreviousShot(text, 180)).toBe('A wide angle shot inside an empty late-night subway car. Cold fluorescent lights illuminate long rows of silver metal seats and overhead hanging handles.')
    expect(quotePreviousShot('짧은 글')).toBe('짧은 글')
    const oneLong = `One very long sentence ${'that keeps going without any stop '.repeat(14)}end`
    const cut = quotePreviousShot(oneLong)
    expect(cut.endsWith('…')).toBe(true)
    expect(oneLong.startsWith(cut.slice(0, -1))).toBe(true)
    expect(/\s/.test(oneLong[cut.length - 1])).toBe(true)
  })

  it('한국어로 저장된 시간대는 영어로 바꿔 싣고, 영어 값은 그대로 둔다', () => {
    // 왜: 영어 지시문 속 "time of day: 밤"은 모델이 읽지 못하거나 글자로 그릴 수 있다.
    expect(englishTimeOfDay('밤')).toBe('night')
    expect(englishTimeOfDay('새벽')).toBe('dawn')
    expect(englishTimeOfDay('새벽 2시')).toBe('late night')
    expect(englishTimeOfDay('아침노을')).toBe('sunrise')
    expect(englishTimeOfDay('저녁노을')).toBe('dusk')
    expect(englishTimeOfDay('해 질 녘')).toBe('dusk')
    expect(englishTimeOfDay('늦은 오후')).toBe('late afternoon')
    expect(englishTimeOfDay('Night')).toBe('Night')
    expect(englishTimeOfDay('현대, 어떤 날의 오후')).toBe('afternoon')
    // 모르는 말은 원문 그대로(지금과 같다) — 시간대를 잃는 것보다 낫다.
    expect(englishTimeOfDay('알 수 없는 때')).toBe('알 수 없는 때')
    expect(englishTimeOfDay(null)).toBeNull()
  })

  it('화살표와 움직임 표시는 가운데 칸에만 있고, 간판 · 화면의 글자 모양도 그리지 말라고 적는다', () => {
    // 왜: 지하철 샷 10 은 러프 끝 칸의 흔들림 표시가, 시브셀러 샷 19 는 간판의 글자 모양이 실사에 남았다 — 시작 · 끝 칸은 영상에 들어간다.
    //   11/23 시험: 맨 끝 줄에만 적으니 흔들림 표시가 또 남았다 — 시작 · 끝 칸 줄에도 적고, 러프에 그려져 있어도 빼라고 한다.
    for (const line of strip().split('\n').filter((l) => /^- (Top|Bottom) panel:/.test(l))) expect(line).toMatch(/no arrows or marks drawn on it/)
    expect(grid()).toMatch(/Rows 1 and 3 have no arrows or marks drawn on them/)
    for (const prompt of [strip(), grid()]) {
      expect(prompt).toMatch(/if a pencil START or END panel has arrows, motion lines, shake marks or speed marks, they are annotations: leave them out/i)
      expect(prompt).toMatch(/signs and screens carry no lettering or letter-like shapes/)
    }
  })
})

describe('끝 칸과 멈춘 샷', () => {
  it('끝 칸이 시작 칸보다 가깝거나 멀면 그 차이를 지키라고 적는다 (한 샷 · 네 샷)', () => {
    // 왜: "당기거나 밀지 마라"만 있어 다가가는 샷의 끝 칸이 시작 칸과 같은 크기로 나왔다(11/23 시험: 지하철 샷 1 · 시브셀러 샷 7).
    expect(strip()).toMatch(/If reference panel 3 is framed closer or wider than reference panel 1, keep that difference/)
    expect(grid()).toMatch(/If a column's reference row 3 is framed closer or wider than its row 1, keep that difference/)
  })

  it('러프가 멈춘 샷이면 세 칸이 같은 그림이고 화살표가 없다고 적고, 샷 설명의 동작으로 사람을 더하거나 빼지 말라고 한다', () => {
    // 왜: 설계 없는 샷의 러프는 늘 멈춘 그림이다 — 우산 샷 2 · 4 는 없던 화살표가 생기고, 샷 2 는 시작 칸에서 사람이 빠졌다(11/23 시험).
    const line = strip({ staticHold: true })
    expect(line).toMatch(/This rough is a static hold: the three pencil panels show the same moment/)
    expect(line).toMatch(/no arrows anywhere/)
    expect(line).toMatch(/do not add, remove or move anyone for it/)
    // 같은 지시문 안에서 "시작 칸 상태를 되풀이하지 마라" · "화살표를 그려라"와 다투지 않는다.
    expect(line).not.toMatch(/never repeat the top panel's state|direction ARROWS from reference panel 2/)
    expect(line).toMatch(/- Middle panel: the exact same image as the top panel, with nothing drawn on it\./)
    expect(line).toMatch(/- Bottom panel: .* the same picture as the top panel/)
    expect(strip()).not.toMatch(/static hold: the three pencil panels/)
    expect(grid({ staticColumns: [true, false] })).toMatch(/Column 1 is a static hold: its three rows show the same moment/)
    expect(grid({ staticColumns: [true, false] })).not.toMatch(/Column 2 is a static hold/)
  })

  it('설계가 없는 샷만, 그리고 사람이 연출 장을 고치지 않은 샷만 멈춘 러프로 본다', () => {
    // 왜: 설계가 있으면 러프에 움직임이 그려져 있고, 사람이 화살표를 그려 넣었으면 그 화살표가 이긴다.
    const rough = { generatedAt: 1000, frames: { start: 'a.png?v=900', direction: 'b.png?v=950', end: 'c.png?v=940' } }
    expect(roughIsStaticHold({ dynamic_spec: null, design_ref: null, rough_storyboard: rough })).toBe(true)
    expect(roughIsStaticHold({ dynamic_spec: { camera_motion: { type: 'static' } }, design_ref: null, rough_storyboard: rough })).toBe(false)
    expect(roughIsStaticHold({ dynamic_spec: null, design_ref: 'shot_3', rough_storyboard: rough })).toBe(false)
    expect(roughIsStaticHold({ dynamic_spec: null, design_ref: null, rough_storyboard: { ...rough, frames: { ...rough.frames, direction: 'b.png?v=2000' } } })).toBe(false)
    expect(roughIsStaticHold({ dynamic_spec: null, design_ref: null, rough_storyboard: { ...rough, directionRead: { en: 'She walks.' } } })).toBe(false)
    expect(roughIsStaticHold({ dynamic_spec: null, design_ref: null, rough_storyboard: null })).toBe(false)
  })

  it('사람이 더한 샷이 아니거나, 러프를 그린 뒤 한 장이라도 다시 저장했으면 멈춘 러프로 보지 않는다', () => {
    // 왜: 화살표를 저장하거나 한 장만 다시 그리면 그림 주소의 시각과 러프 시각이 같이 올라가, 고친 것을 못 알아보고 사람이 그린 화살표를 지우라고 적었다(11/23 검토).
    const t = 1_794_863_000_000
    const drawn = { generatedAt: t + 1400, frames: { start: `a.png?v=${t}`, direction: `b.png?v=${t - 22}`, end: `c.png?v=${t + 600}` } }
    const added = { source: 'manual', dynamic_spec: null, static_spec: null, design_ref: null }
    expect(roughIsStaticHold({ ...added, rough_storyboard: drawn })).toBe(true)
    const later = t + 600_000
    for (const frame of ['start', 'direction', 'end'] as const) {
      expect(roughIsStaticHold({ ...added, rough_storyboard: { ...drawn, generatedAt: later, frames: { ...drawn.frames, [frame]: `x.png?v=${later - 300}` } } })).toBe(false)
    }
    // 옛 작가 길의 샷은 설계 칸이 비어 있어도 러프에 움직임이 그려져 있다.
    expect(roughIsStaticHold({ ...added, source: 'pipeline', rough_storyboard: drawn })).toBe(false)
    expect(roughIsStaticHold({ ...added, static_spec: { engine: 'writer-v2', camera: 'slow pan left' }, rough_storyboard: drawn })).toBe(false)
    for (const file of ['generate-storyboard', 'generate-storyboard-batch']) expect(read(`src/app/api/director/${file}/route.ts`)).toMatch(/\.select\('shot_id, scene_id, [^']*\bsource\b/)
  })

  it('네 샷 시트에 멈춘 칸이 있으면 "첫 행을 되풀이하지 마라"에서 그 칸을 뺀다', () => {
    // 왜: 같은 지시문이 "첫 행을 셋째 행에 되풀이하지 마라"와 "이 칸은 세 행이 같은 순간이다"를 함께 말했다(11/23 검토).
    expect(grid({ staticColumns: [false, true] })).toContain("Never repeat that column's row 1 state in row 3 (except in a static-hold column)")
    expect(grid({ staticColumns: [false, false] })).not.toContain('except in a static-hold column')
    expect(grid()).not.toContain('except in a static-hold column')
  })
})

describe('시네 줄', () => {
  it('시네 줄에 마침표가 겹치지 않는다', () => {
    // 왜: 설계 글이 마침표로 끝나 "…emptiness.. Lighting:"처럼 두 번 붙었다.
    const line = realCineLine({ shot_type: 'WS', camera_angle: 'eye_level', lens_mm: 35, depth_of_field: 'deep', framing: { focal_point: 'The aisle leading into emptiness.' }, texture_notes: 'Cold metal seats.', color_grading_intent: 'Desaturated blues.', lighting: { quality: 'diffused', key_direction: 'top' } })
    expect(line).toContain('sharpest on The aisle leading into emptiness. Lighting')
    expect(line).not.toMatch(/\.\./)
  })
})

describe('샷 설계의 빛 · 초점 · 렌즈 줄', () => {
  it('설계의 칸 모양이 이상하면 줄 없이 그리고, 보여 줄 값이 없는 설계는 싣지 않는다', () => {
    // 왜: 설계는 모델이 쓴 글이다 — 목록 칸에 글자가 들어오면 요청이 500 으로 끊겼고, 다른 엔진의 설계는 "unspecified lens"라는 잡음이 실렸다(11/23 검토).
    expect(realCineLine({ shot_type: 'MS', lens_mm: 50, palette_emphasis: 'teal' })).toBeNull()
    expect(realCineLine({ engine: 'writer-v2', previz: 'x' })).toBeNull()
    expect(realCineLine({ shot_type: 'CU', lens_mm: 85, lighting: { color_temp_kelvin: 3200 } })).toMatch(/85mm/)
    expect(realCineLine({ shot_type: 'WS' })).not.toMatch(/unspecified/)
    expect(realCineLine({ lighting: {} })).toBeNull()
    expect(realCineLine(null)).toBeNull()
  })
})

describe('두 실사 길이 같은 규칙을 쓰는지', () => {
  it('한 샷 · 네 샷 길 모두 실사 그림체일 때만 이 지시문을 쓰고, 다른 그림체는 지금 지시문을 쓴다', () => {
    // 왜: 오너가 실사만 "2 모두 적용", 일본 멜로는 "1 이전"으로 정했다 — 나머지 그림체도 지금 그대로다. 한 길만 바뀌면 같은 씬에서 그림이 갈린다.
    const single = read('src/app/api/director/generate-storyboard/route.ts')
    const batch = read('src/app/api/director/generate-storyboard-batch/route.ts')
    for (const src of [single, batch]) {
      expect(src).toMatch(/const photoLook = anchor \? null : await resolvePhotoLook\(project\)/)
      expect(src).toMatch(/englishTimeOfDay\(/)
      expect(src).toMatch(/stillCharacterLabel\(/)
      expect(src).toMatch(/isReflectionShot\(/)
      expect(src).toMatch(/roughIsStaticHold\(/)
    }
    expect(single).toMatch(/photoLook\s*\? buildPhotoStripPrompt\([\s\S]{0,1400}: buildRealStripPrompt\(/)
    expect(batch).toMatch(/photoLook\s*\? buildPhotoGridPrompt\([\s\S]{0,1400}: buildRealGridPrompt\(/)
    expect(single).toMatch(/quotePreviousShot\(prevText\)/)
    expect(single).toMatch(/stillConstraints\(/)
    expect(single).toMatch(/isReflectionShot\([^\n]*characterRefLabels/)
    expect(batch).toMatch(/isReflectionShot\(s, \[\.\.\.castNames\.values\(\)\]\.flat\(\)\)/)
  })
})
