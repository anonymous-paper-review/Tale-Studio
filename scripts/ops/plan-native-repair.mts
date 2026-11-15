#!/usr/bin/env node
// plan-native-repair.mts — 영어 프로젝트에서 샷 화면 설명(shots.action_description_native)이 한국어 원문으로 저장된 행을 골라,
//   영어 설명(shots.action_description)으로 고칠 목록을 만든다. (2026-11-15 운영 영어 프로젝트 씬 2 · 3 의 샷 19개)
//
// 이 스크립트는 파일만 읽고 쓴다 — 데이터베이스 · 네트워크 · .env · 비밀 값에 닿지 않는다. 운영에 넣는 일은
//   사람이 아래 목록을 눈으로 보고 따로 한다. 판정 규칙은 `src/lib/writer/i18n/native-script.ts` 하나만 안다 —
//   파이프라인 저장 코드(persist_manifest)가 쓰는 규칙과 같은 함수라, 고친 행은 고친 저장 코드가 새로 만든 행과 같다.
//
// 사용:
//   node --import ./tests/fixtures/alias-hook.mjs scripts/ops/plan-native-repair.mts <입력.json> <출력.json> [--locale en] [--allow-unproven]
//
//   입력 JSON — 둘 중 하나:
//     { "locale": "en", "rows": [ { "id", "shot_id", "scene_id", "action_description", "action_description_native", "i18n_provenance" }, ... ] }
//     [ { "id", ... }, ... ]                      ← 행 배열만 주면 --locale 로 프로젝트 언어를 준다
//   출력 JSON — 고칠 행만:
//     [ { "id", "action_description_native", "i18n_provenance" }, ... ]   (id 는 입력의 id 그대로, 운영 갱신의 열쇠)
//   고치지 않은 행과 이유는 화면에만 찍는다. 입력 파일은 "고치기 전" 값의 사본이라 같은 자리에는 쓰지 않는다.
//
//   --allow-unproven  화면 설명이 저장 때의 원문인지(provenance.action_description 해시) 확인하지 않고 고친다.
//                     기본은 확인한다 — 사람이 고친 글을 번역본으로 덮지 않으려는 것이다. 화면에 찍힌
//                     maybe-edited 행을 눈으로 확인한 뒤에만 쓴다.
//
// 오류는 [표지] 로 시작해 stderr 에 찍고 종료 코드 1, 출력 파일은 쓰지 않는다.
// node 가 끝에 찍는 MODULE_TYPELESS_PACKAGE_JSON 경고는 무시해도 된다(제품 .ts 를 type 지정 없이 직접 불러서 나오는 안내이고 동작에는 영향이 없다).

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import {
  reviewNativeScriptRepair,
  type NativeRepairRow,
  type NativeRepairSkipReason,
} from '@/lib/writer/i18n/native-script'

const REASON_TEXT: Record<NativeRepairSkipReason, string> = {
  'not-english-project': '영어 프로젝트가 아니라서 고치지 않아요',
  'empty-native': '화면 설명이 비어 있어요',
  'already-english': '화면 설명이 이미 영어예요(영어 설명과 달라도 건드리지 않아요)',
  'no-english-source': '옮겨 둔 영어 설명이 없어요(비었거나 한국어예요)',
  'maybe-edited': '화면 설명이 저장 때의 원문과 달라요 — 사람이 고쳤을 수 있어요(눈으로 확인한 뒤 --allow-unproven 으로 풀 수 있어요)',
}

const MAX_LISTED = 100

class Failure extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

function readJson(file: string): unknown {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    throw new Failure('read-failed', `입력 파일을 읽지 못했어요: ${error instanceof Error ? error.message : String(error)}`)
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Failure('bad-json', `입력 파일이 JSON 이 아니에요: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 행 하나하나가 모양에 맞는지 본다 — 틀린 첫 자리에서 멈춘다(깨진 입력으로 만든 목록은 운영에서 잘못된 행을 갱신한다). */
function toRows(value: unknown): NativeRepairRow[] {
  if (!Array.isArray(value)) throw new Failure('bad-json', '행 목록(rows)이 배열이 아니에요')
  return value.map((item: unknown, index) => {
    const at = `rows[${index}]`
    if (!isObject(item)) throw new Failure('bad-row', `${at} 는 객체여야 해요`)
    if (!(typeof item.id === 'number' || (typeof item.id === 'string' && item.id !== ''))) {
      throw new Failure('bad-row', `${at}.id 가 없어요(비어 있지 않은 글이나 숫자여야 해요)`)
    }
    for (const key of ['shot_id', 'scene_id', 'action_description', 'action_description_native']) {
      const field = item[key]
      if (field !== undefined && field !== null && typeof field !== 'string') {
        throw new Failure('bad-row', `${at}.${key} 는 글이어야 해요`)
      }
    }
    const provenance = item.i18n_provenance
    if (provenance !== undefined && provenance !== null && !isObject(provenance)) {
      throw new Failure('bad-row', `${at}.i18n_provenance 는 객체여야 해요`)
    }
    return item as unknown as NativeRepairRow
  })
}

function parseCommandLine() {
  try {
    return parseArgs({
      args: process.argv.slice(2),
      allowPositionals: true,
      options: { locale: { type: 'string' }, 'allow-unproven': { type: 'boolean' } },
    })
  } catch (error) {
    throw new Failure('usage', error instanceof Error ? error.message : String(error))
  }
}

function run(): void {
  const parsed = parseCommandLine()
  const [inArg, outArg] = parsed.positionals
  if (!inArg || !outArg || parsed.positionals.length !== 2) {
    throw new Failure('usage', '입력.json 과 출력.json 두 경로가 필요해요 — 사용법은 이 파일 맨 위 주석에 있어요')
  }
  const inFile = path.resolve(inArg)
  const outFile = path.resolve(outArg)
  if (inFile === outFile) throw new Failure('same-path', '입력 파일과 같은 자리에는 결과를 쓰지 않아요 — 입력은 "고치기 전" 값의 사본이에요')

  const json = readJson(inFile)
  const fileLocale = isObject(json) && typeof json.locale === 'string' ? json.locale.trim() : ''
  const cliLocale = (parsed.values.locale ?? '').trim()
  if (cliLocale && fileLocale && cliLocale !== fileLocale) {
    throw new Failure('locale-mismatch', `입력 JSON 의 locale(${fileLocale})과 --locale(${cliLocale})이 달라요`)
  }
  const locale = cliLocale || fileLocale
  if (!locale) {
    throw new Failure('no-locale', '프로젝트 언어(locale)를 알 수 없어요 — { "locale": "en", "rows": [...] } 로 넘기거나 --locale en 을 주세요. 추측하지 않아요')
  }
  const rows = toRows(Array.isArray(json) ? json : isObject(json) ? json.rows : undefined)

  const review = reviewNativeScriptRepair(locale, rows, { allowUnproven: parsed.values['allow-unproven'] === true })

  try {
    writeFileSync(outFile, `${JSON.stringify(review.patches, null, 2)}\n`)
  } catch (error) {
    throw new Failure('write-failed', `출력 파일을 쓰지 못했어요: ${error instanceof Error ? error.message : String(error)}`)
  }

  console.log(`프로젝트 언어 ${locale} · 입력 ${rows.length}행 · 고칠 행 ${review.patches.length} · 건드리지 않은 행 ${review.skipped.length}`)
  if (review.skipped.length) {
    const counts = new Map<NativeRepairSkipReason, number>()
    for (const skipped of review.skipped) counts.set(skipped.reason, (counts.get(skipped.reason) ?? 0) + 1)
    console.log('\n건드리지 않은 행 — 이유별')
    for (const [reason, count] of counts) console.log(`  ${reason} ×${count} — ${REASON_TEXT[reason]}`)
    console.log('\n건드리지 않은 행 — 하나씩')
    for (const skipped of review.skipped.slice(0, MAX_LISTED)) {
      console.log(`  ${skipped.shot_id ?? '(shot_id 없음)'} · id ${skipped.id} — ${skipped.reason}`)
    }
    if (review.skipped.length > MAX_LISTED) console.log(`  … 외 ${review.skipped.length - MAX_LISTED}행`)
  }
  console.log(`\n고칠 목록 ${review.patches.length}행을 ${outFile} 에 썼어요.`)
}

try {
  run()
} catch (error) {
  console.error(error instanceof Failure ? `[${error.code}] ${error.message}` : `[unexpected] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
