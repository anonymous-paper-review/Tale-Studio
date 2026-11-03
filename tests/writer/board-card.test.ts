// Storyboard 카드와 씬 머리에 보이는 글(칩 · 대사 한 줄 · 인물 이름 표시 · 씬 이름 · 컷 수와 초)을 무엇으로 정하는지 검사한다
import { describe, expect, it } from 'vitest'
import {
  cardDialogue,
  mentionSegments,
  sceneHeadTitle,
  shotCardChips,
  shotStageDesign,
} from '@/lib/writer/board-card'
import { sceneStats, sceneStatsLabel } from '@/lib/writer/board-summary'

const manifest = { scenes: [{ sceneId: 'sc_a' }, { sceneId: 'sc_b' }, { sceneId: 'sc_c' }] }
const shots = [
  { shotId: 'a1', sceneId: 'sc_a', durationSeconds: 2.5 },
  { shotId: 'a2', sceneId: 'sc_a', durationSeconds: 3 },
  { shotId: 'b1', sceneId: 'sc_b', durationSeconds: 4.4 },
]

describe('씬 머리', () => {
  // 왜: v3 시안 S1 씬 머리 "3컷 · 7초" — 화면 머리 "씬 2 · 샷 6 · 16초"와 같은 셈(샷 길이 합을 반올림)이어야 씬마다 센 값이 머리와 어긋나지 않는다.
  it('씬 머리의 컷 수와 초는 그 씬 샷의 수와 샷 길이 합이고, 초는 화면 머리와 같이 반올림한다', () => {
    const stats = sceneStats(manifest, shots)
    expect(stats.get('sc_a')).toEqual({ shots: 2, seconds: 6 })
    expect(stats.get('sc_b')).toEqual({ shots: 1, seconds: 4 })
    expect(stats.get('sc_c')).toEqual({ shots: 0, seconds: 0 })
    expect(sceneStatsLabel({ shots: 2, seconds: 6 }, 'ko')).toBe('2컷 · 6초')
    expect(sceneStatsLabel({ shots: 2, seconds: 6 }, 'en')).toBe('2 cuts · 6s')
  })

  // 왜: v3 시안 "회사 복도 자판기 앞 · 낮" — 씬의 장소 칸은 id(vending_machine_corridor)라 그대로 보이면 안 된다(#id-leak). 모르는 id 는 지어내지 않고 그대로 둔다.
  it('씬 머리 이름은 장소 이름과 때를 " · "로 잇고, 장소 id 는 Artist 목록의 이름으로 바꾼다', () => {
    const entities = [{ id: 'vending_machine_corridor', name: '복도 끝 자판기 구역' }]
    expect(sceneHeadTitle({ location: 'vending_machine_corridor', timeOfDay: '밤' }, entities)).toBe('복도 끝 자판기 구역 · 밤')
    expect(sceneHeadTitle({ location: 'rooftop', timeOfDay: ' ' }, entities)).toBe('rooftop')
    expect(sceneHeadTitle({ location: '', timeOfDay: '낮' }, entities)).toBe('낮')
    expect(sceneHeadTitle({ location: '', timeOfDay: '' }, entities)).toBe('')
  })
})

describe('카드 칩', () => {
  const design = { cameraAngle: 'low_angle', cameraMotion: 'dolly_in', colorTempK: 5500 }

  // 왜: 리드 지시(11/3) "칩 값은 제품 데이터에 있는 것만" — 앵글 · 움직임 · 색온도는 러프가 따르는 무대 설계(파이프라인)에만 있다.
  //   직접 더한 샷 · 옛 프로젝트에는 무대 설계가 없어 지어내지 않는다. 연출 메모는 제품에 칸이 없어 만들지 않는다.
  it('카드 칩은 샷 크기를 늘 보이고, 앵글 · 움직임 · 색온도는 러프가 따르는 무대 설계 값이 있을 때만 보인다', () => {
    expect(shotCardChips({ shotType: 'MS', stageDesign: null }, 'ko')).toEqual([{ kind: 'size', label: 'MS' }])
    expect(shotCardChips({ shotType: 'MS' }, 'ko')).toEqual([{ kind: 'size', label: 'MS' }])
    expect(shotCardChips({ shotType: 'MS', stageDesign: design }, 'ko')).toEqual([
      { kind: 'size', label: 'MS' },
      { kind: 'angle', label: '로우 앵글' },
      { kind: 'motion', label: '달리 인' },
      { kind: 'temperature', label: '◐ 5500K' },
    ])
    expect(shotCardChips({ shotType: 'CU', stageDesign: { cameraAngle: null, cameraMotion: null, colorTempK: 3200 } }, 'en')).toEqual([
      { kind: 'size', label: 'CU' },
      { kind: 'temperature', label: '◐ 3200K' },
    ])
  })

  // 왜: 무대 설계의 앵글은 eye_level · low · high · dutch · overhead 같은 자유 글이다 — 짧은 이름으로 보이되, 모르는 글은 칩을 만들지 않는다(틀린 이름은 안 보이는 것보다 나쁘다).
  it('무대 설계 앵글은 아이레벨 · 하이 앵글 · 로우 앵글처럼 짧은 이름으로 보이고, 모르는 앵글은 칩을 만들지 않는다', () => {
    const angle = (cameraAngle: string, locale: 'ko' | 'en' = 'ko') =>
      shotCardChips({ shotType: 'MS', stageDesign: { cameraAngle, cameraMotion: null, colorTempK: null } }, locale).find((chip) => chip.kind === 'angle')?.label
    expect(angle('eye_level')).toBe('아이레벨')
    expect(angle('high_angle')).toBe('하이 앵글')
    expect(angle('low')).toBe('로우 앵글')
    expect(angle('overhead')).toBe('버드아이')
    expect(angle('dutch')).toBe('더치 앵글')
    expect(angle('eye_level', 'en')).toBe('Eye-level')
    expect(angle('sideways')).toBeUndefined()
  })

  // 왜: 움직임 이름은 파이프라인 어휘(motion-vocabulary)를 한 번 정규화한 뒤 보인다 — pan_right 같은 목록 밖 값도 팬으로 읽고, 끝내 모르는 값은 칩을 만들지 않는다.
  it('무대 설계 카메라 움직임은 고정 · 달리 인 · 팬처럼 보이고, 모르는 움직임은 칩을 만들지 않는다', () => {
    const motion = (cameraMotion: string, locale: 'ko' | 'en' = 'ko') =>
      shotCardChips({ shotType: 'MS', stageDesign: { cameraAngle: null, cameraMotion, colorTempK: null } }, locale).find((chip) => chip.kind === 'motion')?.label
    expect(motion('static')).toBe('고정')
    expect(motion('dolly_in')).toBe('달리 인')
    expect(motion('dolly_out')).toBe('달리 아웃')
    expect(motion('pan_right')).toBe('팬')
    expect(motion('tracking')).toBe('트래킹')
    expect(motion('handheld_drift')).toBe('핸드헬드')
    expect(motion('dolly_in', 'en')).toBe('Dolly in')
    expect(motion('teleport')).toBeUndefined()
  })

  // 왜: 시안 칩 "◐ 5600K" — 색온도는 숫자라 번역하지 않는다. 0 이하 · 숫자 아님은 값이 없는 것이다.
  it('색온도는 무대 설계 조명 켈빈을 "◐ 5500K"로 보이고, 값이 없거나 0 이하면 칩을 만들지 않는다', () => {
    const temperature = (colorTempK: number | null) =>
      shotCardChips({ shotType: 'MS', stageDesign: { cameraAngle: null, cameraMotion: null, colorTempK } }, 'ko').find((chip) => chip.kind === 'temperature')?.label
    expect(temperature(5500)).toBe('◐ 5500K')
    expect(temperature(0)).toBeUndefined()
    expect(temperature(null)).toBeUndefined()
  })

  // 왜: 샷 고치기 팝업 머리는 카메라 값(pan)으로 앵글을 부른다 — 채팅이 "하이 앵글로" 바꾼 샷의 카드가 무대 설계 "아이레벨"을 보이면
  //   같은 샷이 두 이름을 갖는다(개발 DB sh_01_01 실측). Director 가 들어올 때 빈 카메라 · 조명만 무대 설계로 채우는 규칙(shot-config-from-design)과 같은 순서다.
  it('사람이 카메라 · 조명을 정한 샷은 앵글 · 색온도 칩에 그 값을 보이고, 정하지 않은 샷은 무대 설계 값을 보인다', () => {
    const flat = { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }
    const unset = { position: 'front' as const, brightness: 50, colorTemp: 5000 }
    const chips = (camera: typeof flat, lighting: typeof unset, stageDesign: typeof design | null = design) =>
      shotCardChips({ shotType: 'MS', stageDesign, camera, lighting }, 'ko').map((chip) => chip.label)
    expect(chips(flat, unset)).toEqual(['MS', '로우 앵글', '달리 인', '◐ 5500K'])
    expect(chips({ ...flat, pan: -5 }, unset)).toEqual(['MS', '하이 앵글', '달리 인', '◐ 5500K'])
    expect(chips(flat, { ...unset, colorTemp: 3200 })).toEqual(['MS', '로우 앵글', '달리 인', '◐ 3200K'])
    // 직접 더한 샷(무대 설계 없음) — 샷 추가 창에서 고른 앵글 · 색온도.
    expect(chips({ ...flat, pan: 5 }, { ...unset, colorTemp: 5600 }, null)).toEqual(['MS', '로우 앵글', '◐ 5600K'])
    expect(chips(flat, unset, null)).toEqual(['MS'])
  })

  // 왜: 보드가 샷을 불러올 때 shots.static_spec(앵글 · 조명) · dynamic_spec(카메라 움직임)에서 칩 값만 읽는다. 저장하지 않는다(읽기만).
  it('무대 설계가 저장된 샷을 불러오면 앵글 · 움직임 · 색온도를 읽고, 없으면 비워 둔다', () => {
    expect(
      shotStageDesign(
        { camera_angle: 'eye_level', lighting: { color_temp_kelvin: 5500 } },
        { camera_motion: { type: 'static', speed: 'slow' } },
      ),
    ).toEqual({ cameraAngle: 'eye_level', cameraMotion: 'static', colorTempK: 5500 })
    expect(shotStageDesign({ camera_angle: 'low_angle' }, null)).toEqual({ cameraAngle: 'low_angle', cameraMotion: null, colorTempK: null })
    expect(shotStageDesign(null, null)).toBeNull()
    expect(shotStageDesign({}, {})).toBeNull()
    expect(shotStageDesign('broken', 42)).toBeNull()
  })
})

describe('카드 대사 한 줄', () => {
  const names = new Map([['min_ho', '민호']])
  const line = (characterId: string | null, text: string) => ({ characterId, text, emotion: '', delivery: '', durationHint: 1 })

  // 왜: v3 시안 S1 카드 '민호 "...또 안 나와?"' — 대사 탭과 같은 화자 이름(내레이션은 V.O.)을 쓴다. 빈 줄은 건너뛰고, 더 있으면 몇 줄 더인지 붙인다.
  it('카드에는 첫 대사 한 줄을 이름과 대사로 보이고, 더 있으면 남은 줄 수를 붙이며, 화자가 없으면 V.O.라 적는다', () => {
    expect(cardDialogue([line('min_ho', '또 안 나와?')], names)).toEqual({ speaker: '민호', text: '또 안 나와?', more: 0 })
    expect(cardDialogue([line(null, '  '), line(null, '그날 밤.'), line('min_ho', '응?')], names)).toEqual({ speaker: 'V.O.', text: '그날 밤.', more: 1 })
    expect(cardDialogue([line('su_jin', '여기야.')], names)).toEqual({ speaker: 'su_jin', text: '여기야.', more: 0 })
    expect(cardDialogue([], names)).toBeNull()
    expect(cardDialogue([line('min_ho', ' ')], names)).toBeNull()
  })
})

describe('카드 글의 인물 이름', () => {
  // 왜: v3 시안 S1 "@민호가 자판기 버튼을 누른다" — 우리 샷 글에는 @가 없어, Artist 목록의 인물 이름에 멘션 색만 입힌다(글은 한 글자도 바꾸지 않는다).
  //   "민호 엄마"가 "민호"로 반만 잡히지 않게 긴 이름부터 잡고, 영어 이름은 다른 낱말 속(Ann → Announcement)에서 잡지 않는다.
  it('카드 글에서 인물 이름은 멘션으로 표시하고, 긴 이름을 먼저 잡으며 영어 이름은 다른 낱말 속에서 잡지 않는다', () => {
    const korean = mentionSegments('민호가 민호 엄마를 본다', ['민호', '민호 엄마'])
    expect(korean).toEqual([
      { text: '민호', mention: true },
      { text: '가 ', mention: false },
      { text: '민호 엄마', mention: true },
      { text: '를 본다', mention: false },
    ])
    expect(korean.map((part) => part.text).join('')).toBe('민호가 민호 엄마를 본다')
    expect(mentionSegments('Ann reads an Announcement', ['Ann'])).toEqual([
      { text: 'Ann', mention: true },
      { text: ' reads an Announcement', mention: false },
    ])
    expect(mentionSegments('아무도 없다', [])).toEqual([{ text: '아무도 없다', mention: false }])
    expect(mentionSegments('', ['민호'])).toEqual([])
  })
})
