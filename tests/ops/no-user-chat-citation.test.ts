// 코드 · 시험 · 주석에 바우처를 쓴 사용자의 채팅을 출처로 적거나 인용하지 않는다 (오너 지시 2026-11-14 — 실사용자의 글은 시험 · 코드 · 커밋 · 스크린샷에 쓰지 않고 예문은 새로 짓는다)
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
// 이 파일 자신이 걸리지 않게 낱말을 나눠 적는다.
const CITATION = new RegExp(['바우처', '\\s*(?:사용자|계정|유저)'].join('') + '|' + ['voucher', '\\s+(?:user|account)'].join(''), 'i')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === 'node_modules' || name === '.next' ? [] : sourceFiles(full)
    return /\.(?:ts|tsx|mjs|js|css|md)$/.test(name) ? [full] : []
  })
}

describe('사용자 채팅 인용 금지', () => {
  it('코드 · 시험 · 주석 어디에도 바우처를 쓴 사람의 채팅을 출처로 적거나 인용하지 않는다', () => {
    // 왜: 실제 사용자의 글이 시험 이름(원장에도 찍힌다)이나 주석으로 남으면 그 사용자의 말이 저장소에 영구히 남는다 — 예문은 새로 짓고 출처는 "11/14 채팅 점검" 정도로만 적는다.
    //   한계: 출처를 밝히는 낱말(바우처 + 사용자 · 계정 · 유저)만 잡는다 — 사용자가 친 글을 그대로 옮긴 예문은 이 시험이 못 잡는다(예문을 새로 짓는 것은 사람이 본다).
    const found: string[] = []
    for (const file of [...sourceFiles(join(ROOT, 'src')), ...sourceFiles(join(ROOT, 'tests'))]) {
      readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        if (CITATION.test(line)) found.push(`${file.slice(ROOT.length + 1)}:${index + 1}`)
      })
    }
    expect(found).toEqual([])
  })
})
