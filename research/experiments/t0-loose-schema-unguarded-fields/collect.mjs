// t0-loose-schema-unguarded-fields — 무검사 씬 필드를 하류가 널 가드 없이 만지는 지점 열거.
//   분류는 정규식이 아니라 TypeScript AST 로 한다(정규식 판독은 템플릿 리터럴 한 줄에 여러 접근이
//   섞인 실제 코드에서 오분류가 났다 — 1차 시도 폐기). 애매한 것은 NA 로 빼고 세지 않는다(판정 3원칙).
// 실행: node research/experiments/t0-loose-schema-unguarded-fields/collect.mjs
import ts from 'typescript'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'

// 씬 타입 정본 src/lib/writer/types/pipeline.ts:306-327 StoryScene
const CANON = ['scene_id', 'act_ref', 'location', 'time_of_day', 'weather', 'characters_in_scene', 'purpose',
  'emotion_beat', 'dialogue_summary', 'key_dialogue', 'info_asymmetry', 'estimated_seconds', 'scene_actions']
// 느슨한 스키마가 실제로 검사하는 필드 src/lib/writer/pipeline/schemas.ts:52-56
const CHECKED = ['scene_id', 'location', 'scene_actions']
const UNCHECKED = CANON.filter((f) => !CHECKED.includes(f))
// 배열/객체 필드만 "즉시 역참조 = 크래시" 대상. 문자열·숫자는 undefined 여도 보간이 죽지 않는다.
const DEREF_RISK = ['characters_in_scene', 'emotion_beat', 'key_dialogue']

const ROOT = 'src/lib/writer'
const files = []
;(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = `${dir}/${e}`
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.ts') && !p.includes('.test.')) files.push(p)
  }
})(ROOT)

const hits = []
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)

  const visit = (node) => {
    if (ts.isPropertyAccessExpression(node) && UNCHECKED.includes(node.name.text)) {
      const field = node.name.text
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
      const lineNo = line + 1
      const codeLine = text.split('\n')[line].trim().slice(0, 180)
      const optionalHere = !!node.questionDotToken
      const parent = node.parent

      // 즉시 역참조인가 — 부모가 이 노드를 대상으로 한 멤버 접근/인덱싱/호출인가.
      const derefParent =
        (ts.isPropertyAccessExpression(parent) && parent.expression === node) ||
        (ts.isElementAccessExpression(parent) && parent.expression === node) ||
        (ts.isCallExpression(parent) && parent.expression === node)
      const parentOptional = derefParent && !!parent.questionDotToken

      // 가드 탐색: 조상 중 조건식(if / && / ?: / ??)의 조건부에 같은 필드 접근이 들어 있는가.
      let guardedByCondition = false
      let fallback = false
      for (let a = node.parent; a; a = a.parent) {
        if (ts.isBinaryExpression(a) &&
            (a.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
             a.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
          if (a.left.getText(sf).includes(field)) { fallback = true; break }
        }
        if (ts.isIfStatement(a) && a.expression.getText(sf).includes(field)) { guardedByCondition = true; break }
        if (ts.isConditionalExpression(a) && a.condition.getText(sf).includes(field)) { guardedByCondition = true; break }
        if (ts.isBinaryExpression(a) && a.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
            a.left.getText(sf).includes(field)) { guardedByCondition = true; break }
      }

      let verdict
      if (new RegExp(`^\\s*${field}\\??:`).test(codeLine) || ts.isPropertySignature(parent)) verdict = 'NA:타입선언'
      else if (!derefParent) verdict = 'NA:비역참조'          // 값 전달·보간만 — undefined 여도 안 죽는다
      else if (optionalHere || parentOptional) verdict = 'guarded:옵셔널체이닝'
      else if (fallback) verdict = 'guarded:기본값'
      else if (guardedByCondition) verdict = 'guarded:조건검사'
      else if (!DEREF_RISK.includes(field)) verdict = 'NA:비배열필드'
      else verdict = 'UNGUARDED'

      hits.push({ file, line: lineNo, field, verdict, expr: node.getText(sf).slice(0, 60), code: codeLine })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

const unguarded = hits.filter((h) => h.verdict === 'UNGUARDED')
const guarded = hits.filter((h) => h.verdict.startsWith('guarded'))
const na = hits.filter((h) => h.verdict.startsWith('NA'))
const byField = {}
for (const h of unguarded) (byField[h.field] ??= []).push(`${h.file}:${h.line}`)
const byFile = {}
for (const h of unguarded) byFile[h.file] = (byFile[h.file] ?? 0) + 1

const out = {
  ticket: 't0-loose-schema-unguarded-fields',
  date: '2026-08-12',
  method: 'TypeScript AST(5.9.3) — PropertyAccessExpression 전수. 정규식 판독은 오분류로 폐기.',
  canon_source: 'src/lib/writer/types/pipeline.ts:306-327 StoryScene',
  loose_schema_source: 'src/lib/writer/pipeline/schemas.ts:52-56 StorySceneLooseSchema',
  checked_fields: CHECKED,
  unchecked_fields: UNCHECKED,
  deref_risk_fields: DEREF_RISK,
  scanned_files: files.length,
  counts: { total_access: hits.length, unguarded: unguarded.length, guarded: guarded.length, na: na.length },
  unguarded_by_field: byField,
  unguarded_by_file: byFile,
  unguarded_sites: unguarded,
  guarded_sites: guarded,
}
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2))
console.log(`스캔 ${files.length}파일 | 접근 ${hits.length} | 무방비 ${unguarded.length} | 가드 ${guarded.length} | NA ${na.length}`)
for (const h of unguarded) console.log(`  [무방비] ${h.file}:${h.line} ${h.expr}`)
console.log('가드된 접근(대조):')
for (const h of guarded) console.log(`  [${h.verdict}] ${h.file}:${h.line} ${h.expr}`)
