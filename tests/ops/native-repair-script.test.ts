// 샷 화면 설명 고치기 스크립트(scripts/ops/plan-native-repair.mts)가 행 목록 JSON 을 읽어 고칠 목록 JSON 을 쓰고, 입력이 잘못되면 아무것도 쓰지 않고 오류로 끝난다
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const md5 = (text: string) => createHash('md5').update(text).digest('hex')

// 새로 지은 예문 — 운영 프로젝트 글이 아니다.
const KO = '소녀가 빗속에서 우산을 접고 문 앞에 선다.'
const EN = 'A girl folds her umbrella in the rain and stops at the door.'
const EDITED = '소녀가 우산을 접지 못하고 문 앞에 멈춘다.'

const fixable = { id: 'row-fix', shot_id: 'sh_02_01', scene_id: 'sc_02', action_description: EN, action_description_native: KO, i18n_provenance: { action_description: md5(KO) } }
const alreadyEnglish = { id: 'row-ok', shot_id: 'sh_01_01', scene_id: 'sc_01', action_description: EN, action_description_native: EN, i18n_provenance: { action_description: md5(EN) } }
const edited = { id: 'row-edited', shot_id: 'sh_03_01', scene_id: 'sc_03', action_description: EN, action_description_native: EDITED, i18n_provenance: { action_description: md5(KO) } }

/** 스크립트를 실제로 돌린다 — package.json 의 media:plan 과 같은 방식(node + @/ 별칭 훅). 파일은 시험마다 새 임시 폴더에 둔다. */
function setup(input: unknown, raw?: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'native-repair-'))
  const inFile = path.join(dir, 'rows.json')
  const outFile = path.join(dir, 'plan.json')
  writeFileSync(inFile, raw ?? JSON.stringify(input))
  const run = (...extra: string[]) =>
    spawnSync(process.execPath, ['--import', './tests/fixtures/alias-hook.mjs', 'scripts/ops/plan-native-repair.mts', inFile, outFile, ...extra], {
      cwd: process.cwd(),
      encoding: 'utf8',
    })
  return { inFile, outFile, run }
}

describe('샷 화면 설명 고치기 스크립트', () => {
  it('프로젝트 언어와 행 목록이 든 JSON 을 읽으면 고칠 목록 JSON 파일을 쓴다', () => {
    // 왜: 리드가 운영에서 뽑은 행을 파일로 넘기면 고칠 목록이 파일로 나온다 — 운영 DB 에 직접 붙지 않고 사람이 목록을 눈으로 보고 넣는다.
    const { outFile, run } = setup({ locale: 'en', rows: [fixable, alreadyEnglish, edited] })
    const result = run()
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(readFileSync(outFile, 'utf8'))).toEqual([
      { id: 'row-fix', action_description_native: EN, i18n_provenance: { action_description: md5(KO), action_description_native: md5(EN) } },
    ])
  })

  it('고치지 않은 행은 이유와 함께 화면에 알린다', () => {
    // 왜: 목록에서 빠진 행이 "고칠 것이 없어서"인지 "사람이 고쳤을 수 있어서"인지 눈으로 가려야 리드가 다음 판단(풀어서 고치기 · 그대로 두기)을 한다.
    const { run } = setup({ locale: 'en', rows: [fixable, alreadyEnglish, edited] })
    const result = run()
    expect(result.stdout).toContain('sh_03_01')
    expect(result.stdout).toContain('maybe-edited')
    expect(result.stdout).toContain('sh_01_01')
    expect(result.stdout).toContain('already-english')
  })

  it('행 목록만 든 JSON 이면 --locale 로 프로젝트 언어를 받는다', () => {
    // 왜: 리드가 행을 그대로 뽑은 배열(프로젝트 언어는 따로 아는 값)도 넘길 수 있어야 한다.
    const { outFile, run } = setup([fixable])
    const result = run('--locale', 'en')
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(readFileSync(outFile, 'utf8'))).toHaveLength(1)
  })

  it('프로젝트 언어를 알 수 없으면 아무것도 쓰지 않고 오류로 끝난다', () => {
    // 왜: 언어를 모르고 고치면 한국어 프로젝트의 정상 글을 영어로 바꿀 수 있다 — 추측하지 않는다.
    const { outFile, run } = setup([fixable])
    const result = run()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('[no-locale]')
    expect(existsSync(outFile)).toBe(false)
  })

  it('입력이 JSON 이 아니거나 행 모양이 틀리면 아무것도 쓰지 않고 오류로 끝난다', () => {
    // 왜: 깨진 입력으로 만든 목록은 운영에 넣는 순간 잘못된 행을 갱신한다 — 첫 틀린 자리에서 멈춘다.
    const broken = setup(null, '{ not json')
    const brokenResult = broken.run('--locale', 'en')
    expect(brokenResult.status).toBe(1)
    expect(brokenResult.stderr).toContain('[bad-json]')
    expect(existsSync(broken.outFile)).toBe(false)

    const noId = setup({ locale: 'en', rows: [{ ...fixable, id: undefined }] })
    const result = noId.run()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('[bad-row]')
    expect(result.stderr).toContain('rows[0]')
    expect(existsSync(noId.outFile)).toBe(false)
  })

  it('JSON 의 프로젝트 언어와 --locale 이 다르면 아무것도 쓰지 않고 오류로 끝난다', () => {
    // 왜: 어느 쪽이 맞는지 모르는 채 고치면 한국어 프로젝트를 영어로 바꿀 수 있다 — 둘이 다르면 추측하지 않고 멈춘다.
    const { outFile, run } = setup({ locale: 'ko', rows: [fixable] })
    const result = run('--locale', 'en')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('[locale-mismatch]')
    expect(existsSync(outFile)).toBe(false)
  })

  it('입력 파일과 같은 자리에는 결과를 쓰지 않는다', () => {
    // 왜: 입력 행 파일이 "고치기 전" 값의 유일한 사본이다 — 결과가 그 위에 덮이면 되돌릴 근거가 사라진다.
    const { inFile } = setup({ locale: 'en', rows: [fixable] })
    const before = readFileSync(inFile, 'utf8')
    const result = spawnSync(process.execPath, ['--import', './tests/fixtures/alias-hook.mjs', 'scripts/ops/plan-native-repair.mts', inFile, inFile], { cwd: process.cwd(), encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('[same-path]')
    expect(readFileSync(inFile, 'utf8')).toBe(before)
  })

  it('--allow-unproven 이면 원문 해시 확인 없이 고친다', () => {
    // 왜: skipped 목록을 눈으로 확인한 리드가 "이 행들은 괜찮다"고 정했을 때 쓰는 열쇠다 — 기본은 막힌 쪽이라 옵션을 줘야만 풀린다.
    const { outFile, run } = setup({ locale: 'en', rows: [edited] })
    expect(run().status).toBe(0)
    expect(JSON.parse(readFileSync(outFile, 'utf8'))).toEqual([])
    expect(run('--allow-unproven').status).toBe(0)
    expect(JSON.parse(readFileSync(outFile, 'utf8'))).toHaveLength(1)
  })
})
