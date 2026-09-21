// DB 구조를 바꾸고 타입 파일을 다시 만들지 않으면 커밋 전에 걸린다
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const MIGRATIONS = join(ROOT, 'supabase/migrations')
const TYPES = join(ROOT, 'src/types/database.ts')

/**
 * 마이그레이션이 만든 뒤 지운 테이블 — 타입 파일에 없는 게 정상이다.
 * 지우는 마이그레이션을 넣으면 여기에 추가한다.
 */
const DROPPED_TABLES: readonly string[] = []

function tablesCreatedByMigrations(): Set<string> {
  const created = new Set<string>()
  const dropped = new Set<string>()

  for (const file of readdirSync(MIGRATIONS).sort()) {
    if (!file.endsWith('.sql')) continue
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8')

    for (const match of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi,
    )) {
      created.add(match[1].toLowerCase())
    }
    for (const match of sql.matchAll(
      /drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi,
    )) {
      dropped.add(match[1].toLowerCase())
    }
  }

  for (const name of dropped) created.delete(name)
  for (const name of DROPPED_TABLES) created.delete(name)
  return created
}

function tablesInGeneratedTypes(): Set<string> {
  const source = readFileSync(TYPES, 'utf8')
  const tablesBlock = source.slice(source.indexOf('Tables: {'))
  const names = new Set<string>()

  for (const match of tablesBlock.matchAll(/^ {6}([a-z_][a-z0-9_]*): \{$/gm)) {
    names.add(match[1])
  }
  return names
}

describe('DB 구조와 타입 파일은 같은 것을 가리킨다', () => {
  it('마이그레이션이 만든 표는 모두 타입 파일에 있다', () => {
    const missing = [...tablesCreatedByMigrations()]
      .filter((table) => !tablesInGeneratedTypes().has(table))
      .sort()

    expect(
      missing,
      missing.length === 0
        ? ''
        : `타입 파일에 없는 표 ${missing.length}개: ${missing.join(', ')}\n` +
          `→ pnpm db:types 로 다시 만들어라.`,
    ).toEqual([])
  })

  it('타입 파일은 자동 생성물 표식을 갖고 있다', () => {
    const source = readFileSync(TYPES, 'utf8')

    // 손으로 고치면 다음 재생성에서 지워진다 — 생성물임을 검사로 못박는다.
    expect(source).toMatch(/__InternalSupabase/)
    expect(source).toMatch(/PostgrestVersion/)
  })

  it('타입을 다시 만드는 명령이 package.json 에 있다', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }

    expect(pkg.scripts?.['db:types']).toBeTruthy()
  })
})
