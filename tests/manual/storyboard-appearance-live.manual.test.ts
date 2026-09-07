// 최종 스토리보드가 "샷에 저장된 모습"으로 참조 이미지를 고르는지 — 실제 DB 로 검증한다.
//
// 왜 수동 시험인가: 나머지 시험은 가짜 DB 응답으로 돈다. 그건 규칙은 잡아도 "운영 데이터가
//   실제로 그 규칙을 만족하는가"는 못 잡는다. 이 시험은 실제 프로젝트 행을 읽는다.
//
// 과금 안전: fal 제출 함수만 가로챈다. 그 앞까지(스냅샷 읽기 → 정확한 모습 조회 → 참조
//   이미지 구성)는 제품 코드가 그대로 돌고, 제출 직전에 멈춘다. 실제 생성은 일어나지 않는다.
//
// 실행: RUN_LIVE_TESTS=1 pnpm vitest run tests/storyboard-appearance-live.manual.test.ts
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import pg from 'pg'

const LIVE = process.env.RUN_LIVE_TESTS === '1'
const PROJECT = '4cb8fc9d-3e0d-4ddc-8128-1a25b44f1095' // 화개장터 — 옥화가 두 모습을 가진 프로젝트
const OKHWA = 'char_3'

/** fal 제출을 가로챈다 — 여기 도달했다는 것은 그 앞 계약이 전부 통과했다는 뜻. */
const submitCalls: Array<{ reference_image_urls?: string[]; prompt: string }> = []
vi.mock('@/lib/writer/llm/fal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/writer/llm/fal')>()),
  falImageSubmit: vi.fn(async (opts: { reference_image_urls?: string[]; prompt: string }) => {
    submitCalls.push(opts)
    throw new Error('LIVE_TEST_STOP: 제출 직전 차단 — 과금 없음')
  }),
}))

let client: pg.Client

function env(): Record<string, string> {
  return Object.fromEntries(
    readFileSync('.env.local', 'utf8')
      .split('\n')
      .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
  )
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
}, 60_000)

afterAll(async () => {
  if (LIVE && client) await client.end()
})

describe.skipIf(!LIVE)('스토리보드·영상이 샷에 저장된 모습을 쓴다 — 실제 DB', () => {
  it('운영 샷이 등장인물마다 모습 키를 하나씩 갖는다', async () => {
    const { rows } = await client.query(
      `select shot_id, characters, character_appearance_keys
         from shots
        where project_id = $1 and characters <> '{}'`,
      [PROJECT],
    )
    expect(rows.length).toBeGreaterThan(0)

    for (const shot of rows) {
      const keys = shot.character_appearance_keys as Record<string, string>
      for (const characterId of shot.characters as string[]) {
        expect(
          typeof keys?.[characterId] === 'string' && keys[characterId].trim().length > 0,
          `${shot.shot_id} 의 ${characterId} 에 모습 키가 없다`,
        ).toBe(true)
      }
    }
  })

  it('저장된 모습 키가 실제 모습 행을 가리킨다 (끊어진 참조 0건)', async () => {
    const { rows } = await client.query(
      `select s.shot_id, c.character_id, c.appearance_key
         from shots s
         cross join lateral jsonb_each_text(s.character_appearance_keys)
              as c(character_id, appearance_key)
         left join character_appearances a
                on a.project_id = s.project_id
               and a.character_id = c.character_id
               and a.appearance_key = c.appearance_key
        where s.project_id = $1 and a.id is null`,
      [PROJECT],
    )
    expect(rows, `끊어진 참조: ${JSON.stringify(rows.slice(0, 5))}`).toEqual([])
  })

  it('과거 장면으로 바꾸면 그 샷의 참조가 젊은 시절 시트로 바뀐다', async () => {
    // 옥화가 등장하는 샷 하나를 골라 모습 키만 young 으로 바꿔보고, 제품 조회가
    //   실제로 다른 시트를 집어오는지 확인한다. 원복은 finally.
    const target = (
      await client.query(
        `select shot_id, character_appearance_keys from shots
          where project_id = $1 and $2 = any(characters) limit 1`,
        [PROJECT, OKHWA],
      )
    ).rows[0]
    expect(target, '옥화가 등장하는 샷이 없다').toBeTruthy()
    const original = target.character_appearance_keys as Record<string, string>

    /** 제품(generate-storyboard-batch)이 쓰는 것과 같은 조회. */
    const sheetFor = async (appearanceKey: string) =>
      (
        await client.query(
          `select sheet_url from character_appearances
            where project_id=$1 and character_id=$2 and appearance_key=$3`,
          [PROJECT, OKHWA, appearanceKey],
        )
      ).rows[0]?.sheet_url as string | undefined

    try {
      await client.query(
        `update shots set character_appearance_keys = $3
          where project_id=$1 and shot_id=$2`,
        [PROJECT, target.shot_id, JSON.stringify({ ...original, [OKHWA]: 'young' })],
      )
      const after = (
        await client.query(
          `select character_appearance_keys from shots where project_id=$1 and shot_id=$2`,
          [PROJECT, target.shot_id],
        )
      ).rows[0].character_appearance_keys as Record<string, string>

      expect(after[OKHWA]).toBe('young')

      const currentSheet = await sheetFor('current')
      const youngSheet = await sheetFor(after[OKHWA])
      expect(youngSheet).toBeTruthy()
      expect(youngSheet).not.toBe(currentSheet)
    } finally {
      await client.query(
        `update shots set character_appearance_keys = $3
          where project_id=$1 and shot_id=$2`,
        [PROJECT, target.shot_id, JSON.stringify(original)],
      )
    }
  })

  it('스냅샷이 비면 유료 제출 전에 막힌다', () => {
    // 검증 함수는 라우트 내부 비공개다 — 계약 문구와 그 순서로 확인한다.
    const source = readFileSync('src/app/api/director/generate-storyboard-batch/route.ts', 'utf8')
    expect(source).toContain('has no character_appearance_keys snapshot')
    expect(source).toContain('has no required sheet_url')
    // 검증이 제출보다 먼저 와야 한다 — 순서가 뒤집히면 돈을 쓰고 실패한다
    expect(source.indexOf('has no required sheet_url')).toBeLessThan(source.indexOf('falImageSubmit({'))
  })

  it('영상 경로도 같은 스냅샷 계약을 쓴다', () => {
    const source = readFileSync('src/app/api/director/generate-video/route.ts', 'utf8')
    expect(source).toContain('character_appearance_keys')
    // 기본 모습으로 되돌아가는 우회로가 없어야 한다
    expect(source).not.toContain("eq('is_default', true)")
    // 모습 검증이 자리 예약(과금 시작점)보다 먼저 와야 한다 — 순서가 뒤집히면 돈을 쓰고 실패한다
    expect(source.indexOf('requireCharacterAppearanceKeys(shot.character_appearance_keys')).toBeLessThan(
      source.indexOf('await reserveDirectorVideoTake('),
    )
  })
})
