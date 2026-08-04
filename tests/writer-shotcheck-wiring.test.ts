// shotCheck 배선 수정(#p2-wiring 2026-08-04) 회귀 — 진단: lab/previz-quality/REPORT.md
//
// 계약:
//   1. 표시문 소스(W3): S.character_action 은 데쿠파주 구체 액션(beat native→en) →
//      motion_prompt(EN) → dramatic_purpose(최후 폴백) 순 — "충격을 안긴다"류 추상 의도문이
//      카드 표시·생성 폴백을 차지하던 결함의 재발 방지.
//   2. provenance(W1): 조립 아이템은 design_ref(=v4 shot_id)와 static_spec 원본을 지닌다 —
//      분할·리넘버 뒤 러프보드 spec 조인의 근거 (id 오프셋 결함: scene_2 +1, scene_3 +2 실측).
//   3. 채널1(W4): CRITICAL/WARNING+constraint 이슈만 check_notes 로 부착되고, 분할 자식은
//      _splitFrom(부모 id)으로도 매칭된다. INFO·constraint 부재는 생성 프롬프트를 오염시키지 않는다.
import { describe, it, expect } from 'vitest'
import {
  assembleShotsFromDesigns,
  attachCheckNotes,
  buildSplitChildren,
} from '@/lib/writer/pipeline/stages/c_application_2'
import { parseCheckConstraints, appendCheckConstraints } from '@/lib/writer/check-notes'
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

describe('assembleShotsFromDesigns — 표시문 소스 랭킹 + provenance (W1·W3)', () => {
  it('데쿠파주 beat native 가 최우선으로 character_action 이 된다', () => {
    const beats = new Map([
      ['shot_1', { en: 'The girl stuffs blueprints into her vest.', native: '소녀가 도면을 조끼에 넣는다.' }],
    ])
    const [item] = assembleShotsFromDesigns([makeDesign({ shotId: 'shot_1' })], SCENES, beats)
    expect(item.S.character_action).toBe('소녀가 도면을 조끼에 넣는다.')
  })

  it('native 부재 시 beat EN, beat 부재 시 motion_prompt, 최후에만 dramatic_purpose', () => {
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

  it('design_ref 와 static_spec 원본이 아이템에 부착된다', () => {
    const [item] = assembleShotsFromDesigns([makeDesign({ shotId: 'shot_7' })], SCENES)
    expect(item.design_ref).toBe('shot_7')
    expect(item.static_spec?.first_frame_prompt).toBe('first frame of shot_7')
  })
})

describe('attachCheckNotes — 채널1 부착 규칙 (W4)', () => {
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
    },
    {
      category: 'continuity',
      severity: 'WARNING',
      location: 'shot_2',
      message: '공간 관계 모순',
      constraint: 'The hunters remain on the ground level, below the girl.',
    },
    { category: 'verisimilitude', severity: 'INFO', location: 'shot_1', message: '미세 개선', constraint: 'ignored' },
    { category: 'action_budget', severity: 'WARNING', location: 'shot_1', message: 'constraint 없음' },
  ]

  it('CRITICAL/WARNING+constraint 만 부착되고 INFO·constraint 부재는 제외된다', () => {
    const [a] = attachCheckNotes(baseShots(), issues)
    expect(a.check_notes).toHaveLength(1)
    expect(a.check_notes?.[0].constraint).toMatch(/tucked inside her vest/)
  })

  it('분할 자식은 _splitFrom(부모 id)으로 부모의 제약을 상속한다', () => {
    const [, child] = attachCheckNotes(baseShots(), issues)
    expect(child.shot_id).toBe('shot_2b')
    expect(child.check_notes?.[0].constraint).toMatch(/ground level/)
  })

  it('매칭 이슈가 없으면 샷은 그대로다', () => {
    const shots = baseShots()
    const out = attachCheckNotes(shots, [])
    expect(out[0].check_notes).toBeUndefined()
  })

  it('F1: 분할 부모의 action_budget 제약은 자식에게 상속되지 않는다 (분할이 곧 수정)', () => {
    const [a] = assembleShotsFromDesigns([makeDesign({ shotId: 'shot_9' })], SCENES)
    const child = { ...a, shot_id: 'shot_9b', _splitFrom: 'shot_9' }
    const out = attachCheckNotes([child], [
      {
        category: 'action_budget',
        severity: 'CRITICAL',
        location: 'shot_9',
        message: '액션 2개',
        constraint: 'Show only one major action: either A or B.',
      },
      {
        category: 'continuity',
        severity: 'WARNING',
        location: 'shot_9',
        message: '소품 상태',
        constraint: 'The canteen stays in her left hand.',
      },
    ])
    expect(out[0].check_notes).toHaveLength(1)
    expect(out[0].check_notes?.[0].category).toBe('continuity')
  })
})

describe('buildSplitChildren — 분할 형제 개별화 (F2)', () => {
  const parent = () => {
    const [p] = assembleShotsFromDesigns([makeDesign({ shotId: 'shot_3' })], SCENES)
    return p
  }
  const newShots = () =>
    [
      { shot_id: 'shot_3a', video_generation: { motion_prompt: 'She shakes the canteen at her ear.' } },
      { shot_id: 'shot_3b', video_generation: { motion_prompt: 'She reaches into the broken window.' } },
    ] as never[]

  it('design_ref/static_spec 은 첫 자식만 상속한다 — 형제가 같은 스펙으로 같은 그림을 그리는 결함 방지', () => {
    const [c1, c2] = buildSplitChildren(parent(), 'shot_3', newShots())
    expect(c1.design_ref).toBe('shot_3')
    expect(c1.static_spec).toBeTruthy()
    expect(c2.design_ref).toBeUndefined()
    expect(c2.static_spec).toBeUndefined()
  })

  it('모델이 new_shots 에 design_ref 를 에코해도 무시된다 — provenance 는 시스템 소유 (실측 92948d6f)', () => {
    const echoed = newShots().map((ns) => ({
      ...(ns as object),
      design_ref: 'shot_3',
      static_spec: { shot_id: 'shot_3', shot_type: 'MS' },
    })) as never[]
    const [c1, c2] = buildSplitChildren(parent(), 'shot_3', echoed)
    expect(c1.design_ref).toBe('shot_3')
    expect(c2.design_ref).toBeUndefined()
    expect(c2.static_spec).toBeUndefined()
  })

  it('S 누락 자식은 자기 모션 서술로 표시문이 개별화된다 (T4)', () => {
    const [c1, c2] = buildSplitChildren(parent(), 'shot_3', newShots())
    expect(c1.S.character_action).toBe('She shakes the canteen at her ear.')
    expect(c2.S.character_action).toBe('She reaches into the broken window.')
    expect(c1._splitFrom).toBe('shot_3')
  })
})

describe('parseCheckConstraints / appendCheckConstraints — DB jsonb 방어 파싱', () => {
  it('정상 배열에서 constraint 문자열만 추출한다', () => {
    const value = [
      { category: 'continuity', severity: 'CRITICAL', constraint: 'Keep the vest closed.' },
      { category: 'continuity', severity: 'WARNING', constraint: '  ' },
      { bogus: true },
      null,
    ]
    expect(parseCheckConstraints(value)).toEqual(['Keep the vest closed.'])
  })

  it('배열이 아니거나 깨진 값은 빈 배열 — 프롬프트는 원문 유지', () => {
    expect(parseCheckConstraints(null)).toEqual([])
    expect(parseCheckConstraints('garbage')).toEqual([])
    expect(appendCheckConstraints('base prompt', null)).toBe('base prompt')
  })

  it('제약이 있으면 프롬프트 꼬리에 한 줄로 첨부된다', () => {
    const out = appendCheckConstraints('base prompt', [
      { category: 'continuity', severity: 'CRITICAL', constraint: 'A.' },
      { category: 'continuity', severity: 'WARNING', constraint: 'B.' },
    ])
    expect(out).toBe('base prompt\nContinuity constraints: A.; B.')
  })
})
