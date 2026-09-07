// 회상 장면에서 모습이 실제로 골라지는지 — 운영 DB 에 실데이터를 만들어 검증한다.
//
// 왜 수동 시험인가: 나머지 시험은 전부 가짜 DB 응답으로 돈다. 그건 "코드가 규칙대로 도는가"는
//   잡지만 "실제 저장된 컬럼·제약·인덱스가 그 규칙을 견디는가"는 못 잡는다. 이 시험은
//   실제 테이블에 행을 넣고, 제품 코드가 실제로 쓰는 것과 같은 조회를 돌린다.
//
// 안전: 자기가 만든 행만 지운다(고유 접두사). 실패해도 finally 에서 정리한다.
//   모델·이미지 호출이 없어 과금이 없다.
//
// 실행: RUN_LIVE_TESTS=1 pnpm vitest run tests/appearance-flashback-live.manual.test.ts
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import {
  AppearanceSelectionError,
  resolveCharacterAppearance,
  type CharacterAppearanceCandidate,
} from '@/lib/writer/appearance-selection'
import type { NarrativeTime } from '@/lib/writer/types/pipeline'

const LIVE = process.env.RUN_LIVE_TESTS === '1'
const P = 'g4live'
let client: pg.Client
let projectId: string

function env(): Record<string, string> {
  return Object.fromEntries(
    readFileSync('.env.local', 'utf8')
      .split('\n')
      .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
  )
}

/** 제품(persist_manifest.loadShotAppearanceResolutionData)이 쓰는 것과 같은 조회. */
async function loadResolutionData(pid: string) {
  const appearances = await client.query(
    'select character_id, appearance_key, narrative_time, is_default from character_appearances where project_id=$1',
    [pid],
  )
  const scenes = await client.query(
    'select scene_id, narrative_time from scenes where project_id=$1',
    [pid],
  )
  const overrides = await client.query(
    'select scene_id, character_id, appearance_key from scene_character_appearance_overrides where project_id=$1',
    [pid],
  )
  const byCharacter = new Map<string, CharacterAppearanceCandidate[]>()
  for (const r of appearances.rows) {
    const list = byCharacter.get(r.character_id) ?? []
    list.push({
      appearanceKey: r.appearance_key,
      narrativeTime: r.narrative_time as NarrativeTime | null,
      isDefault: r.is_default === true,
    })
    byCharacter.set(r.character_id, list)
  }
  const overrideByScene = new Map<string, Record<string, string>>()
  for (const r of overrides.rows) {
    const cur = overrideByScene.get(r.scene_id) ?? {}
    cur[r.character_id] = r.appearance_key
    overrideByScene.set(r.scene_id, cur)
  }
  const scenesById = new Map<string, { narrativeTime: NarrativeTime; overrides: Record<string, string> }>()
  for (const r of scenes.rows) {
    scenesById.set(r.scene_id, {
      narrativeTime: r.narrative_time as NarrativeTime,
      overrides: overrideByScene.get(r.scene_id) ?? {},
    })
  }
  return { byCharacter, scenesById }
}

beforeAll(async () => {
  if (!LIVE) return
  const e = env()
  const ref = new URL(e.SUPABASE_URL).hostname.split('.')[0]
  client = new pg.Client({
    host: e.SUPABASE_DB_HOST,
    port: 5432,
    database: 'postgres',
    user: 'postgres.' + ref,
    password: e.SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  // 실제 프로젝트 하나를 빌려 쓴다. 새 프로젝트를 만들면 워크스페이스·소유자까지 얽힌다.
  projectId = (await client.query('select id from projects order by created_at desc limit 1')).rows[0].id

  // 사람 1명 + 과거 모습 2개(어린 시절/젊은 시절) + 현재 = 오너가 물은 "과거가 여럿" 상황.
  await client.query(
    `insert into characters (project_id, character_id, name, role, entity_type, origin)
     values ($1,$2,'라이브 시험 인물','supporting','person','writer')`,
    [projectId, `${P}_char`],
  )
  for (const [key, label, time, isDefault] of [
    ['current', '현재', 'present', true],
    ['young', '젊은 시절', 'past', false],
    ['child', '어린 시절', 'past', false],
  ] as const) {
    await client.query(
      `insert into character_appearances
         (project_id, character_id, appearance_key, label, is_default, narrative_time, appearance)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [projectId, `${P}_char`, key, label, isDefault, time, `${label} 외형`],
    )
  }

  // 회상 장면 2개: 하나는 지정 없음(모호), 하나는 어린 시절 지정.
  for (const [sid, time] of [
    [`${P}_sc_present`, 'present'],
    [`${P}_sc_past_ambiguous`, 'past'],
    [`${P}_sc_past_pinned`, 'past'],
    [`${P}_sc_future`, 'future'],
  ] as const) {
    await client.query(
      `insert into scenes (project_id, scene_id, narrative_summary, location, time_of_day, narrative_time, sort_order, source)
       values ($1,$2,'라이브 시험 장면','시험 장소','night',$3,999,'manual')`,
      [projectId, sid, time],
    )
  }
  await client.query(
    `insert into scene_character_appearance_overrides (project_id, scene_id, character_id, appearance_key)
     values ($1,$2,$3,'child')`,
    [projectId, `${P}_sc_past_pinned`, `${P}_char`],
  )
}, 60_000)

afterAll(async () => {
  if (!LIVE || !client) return
  await client.query('delete from scene_character_appearance_overrides where project_id=$1 and scene_id like $2', [projectId, `${P}%`])
  await client.query('delete from scenes where project_id=$1 and scene_id like $2', [projectId, `${P}%`])
  await client.query('delete from character_appearances where project_id=$1 and character_id like $2', [projectId, `${P}%`])
  await client.query('delete from characters where project_id=$1 and character_id like $2', [projectId, `${P}%`])
  await client.end()
}, 60_000)

describe.skipIf(!LIVE)('회상 장면 모습 선택 — 실제 DB', () => {
  it('과거 모습이 둘이면 지정 없이는 자동 선택하지 않는다', async () => {
    const { byCharacter, scenesById } = await loadResolutionData(projectId)
    const scene = scenesById.get(`${P}_sc_past_ambiguous`)!
    const appearances = byCharacter.get(`${P}_char`)!

    expect(scene.narrativeTime).toBe('past')
    expect(appearances.filter((a) => a.narrativeTime === 'past')).toHaveLength(2)

    try {
      resolveCharacterAppearance(scene.narrativeTime, appearances, scene.overrides[`${P}_char`])
      throw new Error('모호한데도 골랐다')
    } catch (error) {
      expect(error).toBeInstanceOf(AppearanceSelectionError)
      expect((error as AppearanceSelectionError).code).toBe('AMBIGUOUS_APPEARANCE')
    }
  })

  it('그 장면에 모습을 지정하면 지정한 것이 이긴다', async () => {
    const { byCharacter, scenesById } = await loadResolutionData(projectId)
    const scene = scenesById.get(`${P}_sc_past_pinned`)!

    expect(scene.overrides[`${P}_char`]).toBe('child')
    expect(
      resolveCharacterAppearance(scene.narrativeTime, byCharacter.get(`${P}_char`)!, scene.overrides[`${P}_char`]),
    ).toBe('child')
  })

  it('현재 장면은 기본 모습을 고른다', async () => {
    const { byCharacter, scenesById } = await loadResolutionData(projectId)
    const scene = scenesById.get(`${P}_sc_present`)!
    expect(resolveCharacterAppearance(scene.narrativeTime, byCharacter.get(`${P}_char`)!, undefined)).toBe('current')
  })

  it('미래 장면은 맞는 모습이 없어 기본 모습으로 떨어진다', async () => {
    const { byCharacter, scenesById } = await loadResolutionData(projectId)
    const scene = scenesById.get(`${P}_sc_future`)!
    expect(scene.narrativeTime).toBe('future')
    expect(resolveCharacterAppearance(scene.narrativeTime, byCharacter.get(`${P}_char`)!, undefined)).toBe('current')
  })

  it('DB 제약이 "기본 모습은 하나"를 실제로 막는다', async () => {
    await expect(
      client.query(
        `insert into character_appearances (project_id, character_id, appearance_key, label, is_default, narrative_time)
         values ($1,$2,'second_default','두번째 기본',true,'present')`,
        [projectId, `${P}_char`],
      ),
    ).rejects.toThrow()
  })

  it('DB 제약이 없는 모습을 가리키는 지정을 막는다', async () => {
    await expect(
      client.query(
        `insert into scene_character_appearance_overrides (project_id, scene_id, character_id, appearance_key)
         values ($1,$2,$3,'nonexistent_key')`,
        [projectId, `${P}_sc_present`, `${P}_char`],
      ),
    ).rejects.toThrow()
  })

  it('DB 제약이 허용되지 않는 시점 값을 막는다', async () => {
    await expect(
      client.query('update scenes set narrative_time=$3 where project_id=$1 and scene_id=$2', [
        projectId,
        `${P}_sc_present`,
        'flashback',
      ]),
    ).rejects.toThrow()
  })
})
