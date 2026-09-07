// 장면의 행동과 검수 안내를 화면에 정확히 보여주고, 나눠진 컷에도 필요한 주의를 이어 준다 (#p2-wiring 2026-08-04)
// shotCheck 배선 수정(#p2-wiring 2026-08-04) 회귀 — 진단: lab/previz-quality/REPORT.md
//
// 계약:
//   1. 표시문 소스(W3): S.character_action 은 데쿠파주 구체 액션(beat native→en) →
//      motion_prompt(EN) → dramatic_purpose(최후 폴백) 순 — "충격을 안긴다"류 추상 의도문이
//      카드 표시·생성 폴백을 차지하던 결함의 재발 방지.
//   2. provenance(W1): 조립 아이템은 design_ref(=v4 shot_id)와 static_spec 원본을 지닌다 —
//      분할·리넘버 뒤 러프보드 spec 조인의 근거 (id 오프셋 결함: scene_2 +1, scene_3 +2 실측).
//   3. 채널1(W4): CRITICAL/WARNING+constraint_target=visual 이슈만 check_notes 로 부착되고, 분할 자식은
//      _splitFrom(부모 id)으로도 매칭된다. INFO·text/report_only·target 누락은 생성 프롬프트를 오염시키지 않는다.
import { describe, it, expect } from 'vitest'
import {
  assembleShotsFromDesigns,
  attachCheckNotes,
  buildSplitChildren,
} from '@/lib/writer/pipeline/stages/c_application_2'
import { parseCheckConstraints, appendCheckConstraints } from '@/lib/writer/check-notes'
import { writerShotIdToMain } from '@/lib/writer/adapters'
import type { Scenes, ShotDesign, ValidationIssue } from '@/lib/writer/types/pipeline'

function makeDesign(overrides: {
  shotId: string
  motionPrompt?: string
  dramaticPurpose?: string
}): ShotDesign {
  return {
    intent: {
      shot_id: overrides.shotId,
      scene_id: 'scene_1',
      duration_seconds: 4,
      dramatic_purpose: overrides.dramaticPurpose ?? '관객에게 충격을 안긴다.',
      shot_position_in_scene: 'middle',
    },
    static_spec: {
      shot_id: overrides.shotId,
      shot_type: 'MS',
      camera_angle: 'eye_level',
      first_frame_prompt: `first frame of ${overrides.shotId}`,
      character_blocking: [],
      prop_placement: [],
    },
    dynamic_spec: {
      shot_id: overrides.shotId,
      motion_prompt: overrides.motionPrompt ?? '',
      camera_motion: { type: 'static' },
      character_motion: [],
      environmental_change: [],
      gaze_arc: [],
    },
  } as unknown as ShotDesign
}

const SCENES = {
  scenes: [
    {
      scene_id: 'scene_1',
      purpose: 'discovery',
      emotion_beat: { start: 'calm', end: 'shock' },
      location: 'ruins',
      scene_actions: [],
    },
  ],
} as unknown as Scenes

describe('assembleShotsFromDesigns — 화면에 보여줄 행동을 올바른 순서로 고르기 (W1·W3)', () => {
  it('장면에 적힌 실제 행동이 있으면 화면에 그 행동을 먼저 보여준다', () => {
    const beats = new Map([
      ['shot_1', { en: 'The girl stuffs blueprints into her vest.', native: '소녀가 도면을 조끼에 넣는다.' }],
    ])
    const [item] = assembleShotsFromDesigns([makeDesign({ shotId: 'shot_1' })], SCENES, beats)
    expect(item.S.character_action).toBe('소녀가 도면을 조끼에 넣는다.')
  })

  it('실제 행동이 없으면 다른 행동 설명을 차례로 사용하고, 마지막에 장면 목적을 보여준다', () => {
    const beats = new Map([['shot_1', { en: 'She digs through the sand.' }]])
    const designs = [
      makeDesign({ shotId: 'shot_1' }),
      makeDesign({ shotId: 'shot_2', motionPrompt: 'She crawls into the dark gap.' }),
      makeDesign({ shotId: 'shot_3', dramaticPurpose: '긴장감을 조성한다.' }),
    ]
    const items = assembleShotsFromDesigns(designs, SCENES, beats)
    expect(items[0].S.character_action).toBe('She digs through the sand.')
    expect(items[1].S.character_action).toBe('She crawls into the dark gap.')
    expect(items[2].S.character_action).toBe('긴장감을 조성한다.')
  })

  it('컷을 나눠도 원래 설계와 화면 원본을 함께 보존한다', () => {
    const [item] = assembleShotsFromDesigns([makeDesign({ shotId: 'shot_7' })], SCENES)
    expect(item.design_ref).toBe('shot_7')
    expect(item.static_spec?.first_frame_prompt).toBe('first frame of shot_7')
  })
})

describe('attachCheckNotes — 화면 주의사항을 필요한 컷에 붙이기 (W4)', () => {
  const baseShots = () => {
    const [a, b] = assembleShotsFromDesigns(
      [makeDesign({ shotId: 'shot_1' }), makeDesign({ shotId: 'shot_2' })],
      SCENES,
    )
    return [a, { ...b, shot_id: 'shot_2b', _splitFrom: 'shot_2' }]
  }
  const issues: ValidationIssue[] = [
    {
      category: 'continuity',
      severity: 'CRITICAL',
      location: 'shot_1',
      message: '소품 상태 모순',
      constraint: 'The blueprints are tucked inside her vest, not held in her hands.',
      constraint_target: 'visual',
    },
    {
      category: 'continuity',
      severity: 'WARNING',
      location: 'shot_2',
      message: '공간 관계 모순',
      constraint: 'The hunters remain on the ground level, below the girl.',
      constraint_target: 'visual',
    },
    { category: 'verisimilitude', severity: 'INFO', location: 'shot_1', message: '미세 개선', constraint: 'ignored' },
    { category: 'action_budget', severity: 'WARNING', location: 'shot_1', message: 'constraint 없음' },
  ]

  it('중요하거나 주의가 필요한 시각 안내만 붙이고, 정보용·글 전용 안내는 제외한다', () => {
    const [a] = attachCheckNotes(baseShots(), issues)
    expect(a.check_notes).toHaveLength(1)
    expect(a.check_notes?.[0].constraint).toMatch(/tucked inside her vest/)
  })
  it('글 내용 전용 안내는 검수 보고서에만 남기고 화면 주의사항에는 붙이지 않는다', () => {
    const [a] = attachCheckNotes(baseShots(), [
      {
        category: 'verisimilitude',
        severity: 'WARNING',
        location: 'shot_1',
        message: '대명사 표기 교정',
        constraint_target: 'text',
        constraint: 'Journey is male; all pronoun references in this shot must use he/his/him.',
      },
    ])
    expect(a.check_notes).toBeUndefined()
  })

  it('나뉜 컷은 원래 컷의 주의사항을 이어받는다', () => {
    const [, child] = attachCheckNotes(baseShots(), issues)
    expect(child.shot_id).toBe('shot_2b')
    expect(child.check_notes?.[0].constraint).toMatch(/ground level/)
  })

  it('관련된 주의사항이 없으면 컷 내용을 그대로 둔다', () => {
    const shots = baseShots()
    const out = attachCheckNotes(shots, [])
    expect(out[0].check_notes).toBeUndefined()
  })

  it('F1: 나누기 전 컷의 동작 제한은 나뉜 컷에 이어 주지 않는다 (나누기가 곧 수정)', () => {
    const [a] = assembleShotsFromDesigns([makeDesign({ shotId: 'shot_9' })], SCENES)
    const child = { ...a, shot_id: 'shot_9b', _splitFrom: 'shot_9' }
    const out = attachCheckNotes([child], [
      {
        category: 'action_budget',
        severity: 'CRITICAL',
        location: 'shot_9',
        message: '액션 2개',
        constraint: 'Show only one major action: either A or B.',
        constraint_target: 'visual',
      },
      {
        category: 'continuity',
        severity: 'WARNING',
        location: 'shot_9',
        message: '소품 상태',
        constraint: 'The canteen stays in her left hand.',
        constraint_target: 'visual',
      },
    ])
    expect(out[0].check_notes).toHaveLength(1)
    expect(out[0].check_notes?.[0].category).toBe('continuity')
  })
})

describe('buildSplitChildren — 나뉜 컷마다 내용을 알맞게 나누기 (F2)', () => {
  const parent = () => {
    const [p] = assembleShotsFromDesigns([makeDesign({ shotId: 'shot_3' })], SCENES)
    return p
  }
  const newShots = () =>
    [
      { shot_id: 'shot_3a', video_generation: { motion_prompt: 'She shakes the canteen at her ear.' } },
      { shot_id: 'shot_3b', video_generation: { motion_prompt: 'She reaches into the broken window.' } },
    ] as never[]

  it('나뉜 컷은 첫 컷만 원래 설계를 갖고, 뒤 컷은 필요한 부분만 이어받는다 (#split-inherit: 훔치지도 굶기지도 않는다)', () => {
    const [c1, c2] = buildSplitChildren(parent(), 'shot_3', newShots())
    expect(c1.design_ref).toBe('shot_3')
    expect(c1.static_spec).toBeTruthy()
    expect(c1.static_spec?.first_frame_prompt).toBe('first frame of shot_3') // 첫째 = 부모 START 그대로
    expect(c2.design_ref).toBeUndefined() // provenance 는 여전히 첫째 전속 — 조인 훔침 방지 유지
    // 둘째: 시간 무관 채널은 상속, 시간 의존 채널은 걷힘 — 같은-그림(F2) 우려 필드만 정확히 비운다.
    expect(c2.static_spec).toBeTruthy()
    expect(c2.static_spec?.shot_type).toBe('MS')
    expect(c2.static_spec?.camera_angle).toBe('eye_level')
    expect(c2.static_spec?.first_frame_prompt).toBe('')
    expect(c2.static_spec?.framing?.focal_point).toBe('')
  })

  it('자동 생성 결과에 설계 표시가 섞여도 정해진 기준을 따른다 (실측 92948d6f)', () => {
    const echoed = newShots().map((ns) => ({
      ...(ns as object),
      design_ref: 'shot_3',
      static_spec: { shot_id: 'shot_3', shot_type: 'MS' },
    })) as never[]
    const [c1, c2] = buildSplitChildren(parent(), 'shot_3', echoed)
    expect(c1.design_ref).toBe('shot_3')
    expect(c2.design_ref).toBeUndefined()
    // 에코된 static_spec 은 무시되고, 시스템이 파생한 부분 상속본이 앉는다(부모 값 기반).
    expect(c2.static_spec?.camera_angle).toBe('eye_level')
    expect(c2.static_spec?.first_frame_prompt).toBe('')
  })

  it('나뉜 컷은 각자 자기 동작을 화면에 보여준다 (T4)', () => {
    const [c1, c2] = buildSplitChildren(parent(), 'shot_3', newShots())
    expect(c1.S.character_action).toBe('She shakes the canteen at her ear.')
    expect(c2.S.character_action).toBe('She reaches into the broken window.')
    expect(c1._splitFrom).toBe('shot_3')
  })

  it('S2: 둘째 컷은 자기 설명이 없으면 이전 컷의 전체 화면과 동작을 물려받지 않고 비워 둔다 (부모의 전체 화면과 동작은 자식에 거짓)', () => {
    const noDelta = [{ shot_id: 'shot_3a' }, { shot_id: 'shot_3b' }] as never[]
    const [c1, c2] = buildSplitChildren(parent(), 'shot_3', noDelta)
    // 첫째는 종전대로 부모 병합(부모의 START = 첫째의 START — 참)
    expect(c1.first_frame_generation.composition_prompt).toBe(
      parent().first_frame_generation.composition_prompt,
    )
    // 둘째는 비움 + 정체성(base_assets)만 유지
    expect(c2.first_frame_generation.composition_prompt).toBe('')
    expect(c2.first_frame_generation.base_assets).toEqual(
      parent().first_frame_generation.base_assets,
    )
    expect(c2.video_generation.motion_prompt).toBe('')
  })

  it('S3: 둘째 컷은 카메라와 환경은 이어 가고, 인물 동작과 시선은 자기 움직임만 보여준다', () => {
    const [, c2] = buildSplitChildren(parent(), 'shot_3', newShots())
    expect(c2.dynamic_spec).toBeTruthy()
    expect(c2.dynamic_spec?.camera_motion?.type).toBe('static') // 분할 경계를 넘는 연속 무빙 유지
    expect(c2.dynamic_spec?.character_motion).toEqual([]) // 부모 동사(샷 전체 모션)는 자식 몫 아님
    expect(c2.dynamic_spec?.gaze_arc).toBeUndefined()
    expect(c2.dynamic_spec?.motion_prompt).toBe('She reaches into the broken window.')
  })

  it('S3: 화면 전환은 첫 컷에 들어오고 마지막 컷에서 나간다', () => {
    const p = parent()
    p.dynamic_spec = {
      ...(p.dynamic_spec as object),
      transition_in: 'fade',
      transition_out: 'dissolve',
    } as typeof p.dynamic_spec
    const three = [
      { shot_id: 'a' }, { shot_id: 'b' }, { shot_id: 'c' },
    ] as never[]
    const [c1, c2, c3] = buildSplitChildren(p, 'shot_3', three)
    expect(c1.dynamic_spec?.transition_in).toBe('fade')
    expect(c1.dynamic_spec?.transition_out).toBeUndefined() // 부모의 퇴장은 막내 몫
    expect(c2.dynamic_spec?.transition_in).toBeUndefined()
    expect(c2.dynamic_spec?.transition_out).toBeUndefined()
    expect(c3.dynamic_spec?.transition_in).toBeUndefined()
    expect(c3.dynamic_spec?.transition_out).toBe('dissolve')
  })

  it('S1: 둘째 컷의 자세는 자기 동작에 맞추고 부모의 순간 자세를 물려받지 않는다', () => {
    const p = parent()
    p.static_spec = {
      ...(p.static_spec as object),
      character_blocking: [
        { character_id: 'char', position_in_frame: 'center', pose: 'kneeling over blueprint', gaze: 'down', asset_version: 'v1' },
      ],
    } as typeof p.static_spec
    const [, c2] = buildSplitChildren(p, 'shot_3', newShots())
    expect(c2.static_spec?.character_blocking?.[0].character_id).toBe('char')
    expect(c2.static_spec?.character_blocking?.[0].position_in_frame).toBe('center')
    expect(c2.static_spec?.character_blocking?.[0].pose).toBe('She reaches into the broken window.')
  })
})

describe('writerShotIdToMain — 컷 번호 형식 통일 (#id-unify)', () => {
  it('한 자리 컷 번호도 같은 규칙으로 정리한다', () => {
    expect(writerShotIdToMain('shot_1', 'scene_1')).toBe('sh_01_01')
    expect(writerShotIdToMain('shot_9', 'scene_1')).toBe('sh_01_09')
    expect(writerShotIdToMain('shot_10', 'scene_2')).toBe('sh_02_10')
    expect(writerShotIdToMain('sh_02_10', 'scene_2')).toBe('sh_02_10') // 이미 메인 포맷 — 멱등
  })
})

describe('parseCheckConstraints / appendCheckConstraints — 저장된 주의사항을 안전하게 읽기', () => {
  it('정상적으로 저장된 주의사항에서 필요한 문장만 골라낸다', () => {
    const value = [
      { category: 'continuity', severity: 'CRITICAL', constraint_target: 'visual', constraint: 'Keep the vest closed.' },
      { category: 'continuity', severity: 'WARNING', constraint_target: 'visual', constraint: '  ' },
      { category: 'continuity', severity: 'WARNING', constraint_target: 'text', constraint: 'Use he/him.' },
      { bogus: true },
      null,
    ]
    expect(parseCheckConstraints(value)).toEqual(['Keep the vest closed.'])
  })

  it('읽을 수 없는 주의사항은 비워 두고 원래 안내 문장은 그대로 둔다', () => {
    expect(parseCheckConstraints(null)).toEqual([])
    expect(parseCheckConstraints('garbage')).toEqual([])
    expect(appendCheckConstraints('base prompt', null)).toBe('base prompt')
  })

  it('주의사항이 있으면 안내문 끝에 한 줄로 덧붙인다', () => {
    const out = appendCheckConstraints('base prompt', [
      { category: 'continuity', severity: 'CRITICAL', constraint_target: 'visual', constraint: 'A.' },
      { category: 'continuity', severity: 'WARNING', constraint_target: 'visual', constraint: 'B.' },
    ])
    expect(out).toBe('base prompt\nContinuity constraints: A.; B.')
  })
})
