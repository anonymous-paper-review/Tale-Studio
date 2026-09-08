// 서버 전용 키를 쓰는 파일을 화면 코드가 실수로 가져다 쓰면 빌드가 실패한다
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')

/** 서버에서만 열려야 하는 파일 — 전권 키(SERVICE_ROLE)나 그에 준하는 비밀을 잡는다. */
const SERVER_ONLY_FILES = ['src/lib/supabase/admin.ts']

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

function isClientFile(source: string): boolean {
  const firstStatement = source.trimStart().slice(0, 40)
  return /^['"]use client['"]/.test(firstStatement)
}

describe('서버 전용 키는 화면 코드로 새지 않는다', () => {
  it('전권 키를 쓰는 파일은 서버에서만 열리도록 표시되어 있다', () => {
    for (const relative of SERVER_ONLY_FILES) {
      const source = readFileSync(join(process.cwd(), relative), 'utf8')

      expect(source, `${relative} 에 server-only 표시가 없다`).toMatch(
        /^import ['"]server-only['"]/m,
      )
    }
  })

  it('화면 코드는 전권 키 파일을 가져다 쓰지 않는다', () => {
    const offenders: string[] = []

    for (const file of walk(SRC)) {
      const source = readFileSync(file, 'utf8')
      if (!isClientFile(source)) continue
      if (/from ['"]@\/lib\/supabase\/admin['"]/.test(source)) {
        offenders.push(file.replace(`${process.cwd()}/`, ''))
      }
    }

    expect(offenders).toEqual([])
  })
})
