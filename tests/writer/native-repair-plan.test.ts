// 이미 저장된 샷 중 화면 설명(action_description_native)이 영어 프로젝트에 맞지 않는 행만 골라 영어 설명으로 고칠 목록을 만든다 (DB 접근 없음 · 순수 함수)
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { planNativeScriptRepair, reviewNativeScriptRepair, type NativeRepairRow } from '@/lib/writer/i18n/native-script'

const md5 = (text: string) => createHash('md5').update(text).digest('hex')

// 새로 지은 예문 — 운영 프로젝트 글이 아니다.
const KO = '소녀가 빗속에서 우산을 접고 문 앞에 선다.'
const EN = 'A girl folds her umbrella in the rain and stops at the door.'

/** 옛 저장 코드가 영어 프로젝트에 남긴 모양: 주 칸은 영어, 화면 칸은 한국어 원문, 출처 해시는 원문의 것. */
function row(over: Partial<NativeRepairRow> = {}): NativeRepairRow {
  return {
    id: 'row-1',
    shot_id: 'sh_02_01',
    scene_id: 'sc_02',
    action_description: EN,
    action_description_native: KO,
    i18n_provenance: { action_description: md5(KO) },
    ...over,
  }
}

describe('영어 프로젝트의 저장된 샷 화면 설명 고치기 목록', () => {
  it('영어 프로젝트에서 샷 화면 설명이 한국어이고 영어 설명이 따로 있으면 그 샷을 고칠 목록에 올린다', () => {
    // 왜: 운영 영어 프로젝트 씬 2 · 3 의 샷 19개가 정확히 이 모양이다(주 칸 영어 · 화면 칸 한국어 원문) — 이 행들을 골라내는 것이 도구의 일이다.
    const plan = planNativeScriptRepair('en', [row({ id: 'a' }), row({ id: 'b', shot_id: 'sh_03_01' })])
    expect(plan.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('고치는 샷은 화면 설명을 영어 설명으로 바꾸고 영어 글의 해시를 provenance 에 더한다', () => {
    // 왜: 고친 저장 코드가 새로 만드는 행과 같은 값이어야 한다(<칸>_native = 영어 글 해시). 같은 규칙은 저장 시험의 "같은 값" 시험이 따로 못 박는다.
    const [patch] = planNativeScriptRepair('en', [row()])
    expect(patch.action_description_native).toBe(EN)
    expect(patch.i18n_provenance).toEqual({ action_description: md5(KO), action_description_native: md5(EN) })
  })

  it('고치면서 provenance 에 이미 있던 다른 칸은 그대로 둔다', () => {
    // 왜: 한 행의 provenance 는 여러 칸의 출처를 함께 든다 — 고치는 칸 하나 때문에 다른 칸의 기록을 잃으면 안 된다.
    const [patch] = planNativeScriptRepair('en', [row({ i18n_provenance: { action_description: md5(KO), other_field: 'keep-me' } })])
    expect(patch.i18n_provenance).toEqual({ action_description: md5(KO), other_field: 'keep-me', action_description_native: md5(EN) })
  })

  it('고칠 목록의 항목은 id · 화면 설명 · provenance 셋뿐이다', () => {
    // 왜: 이 목록이 운영 갱신의 입력이다 — 모르는 칸이 끼어 있으면 안 되는 칸까지 덮어쓸 수 있다.
    const [patch] = planNativeScriptRepair('en', [row()])
    expect(Object.keys(patch).sort()).toEqual(['action_description_native', 'i18n_provenance', 'id'])
  })

  it('화면 설명이 이미 영어인 샷은 영어 설명과 달라도 건드리지 않는다', () => {
    // 왜: 영어 글이 영어 설명과 조금 다른 것은 이 구멍이 아니다 — 사람이 영어로 고친 글일 수 있어 덮지 않는다.
    const edited = row({ action_description_native: 'The girl closes her umbrella and waits at the door.' })
    expect(planNativeScriptRepair('en', [edited])).toEqual([])
    expect(reviewNativeScriptRepair('en', [edited]).skipped).toEqual([{ id: 'row-1', shot_id: 'sh_02_01', reason: 'already-english' }])
  })

  it('영어 설명이 비었거나 한국어이면 고치지 않고 이유를 알린다', () => {
    // 왜: 번역이 실패해 주 칸도 한국어로 저장된 샷 — 영어 글이 없으니 바꿀 것이 없다. 목록에서 빠졌다는 것을 눈으로 확인할 수 있어야 한다.
    const rows = [
      row({ id: 'empty', action_description: '' }),
      row({ id: 'null', action_description: null }),
      row({ id: 'same-korean', action_description: KO }),
      row({ id: 'other-korean', action_description: '소녀가 문 앞에 우산을 내려놓는다.' }),
    ]
    const review = reviewNativeScriptRepair('en', rows)
    expect(review.patches).toEqual([])
    expect(review.skipped.map((s) => [s.id, s.reason])).toEqual([
      ['empty', 'no-english-source'],
      ['null', 'no-english-source'],
      ['same-korean', 'no-english-source'],
      ['other-korean', 'no-english-source'],
    ])
  })

  it('영어 설명에 한국어 고유명사가 조금 섞여 있어도 영어 글자가 더 많으면 영어 설명으로 본다', () => {
    // 왜: 번역 모델이 지어낸 지명을 한글 그대로 둘 때가 있다 — 그 몇 글자 때문에 한국어 문장 전체를 화면에 남기는 것보다 영어 문장이 낫다.
    const mixed = 'A tourist walks through the 달무리 alley at dawn.'
    const [patch] = planNativeScriptRepair('en', [row({ action_description: mixed })])
    expect(patch.action_description_native).toBe(mixed)
  })

  it('화면 설명이 비었으면 고치지 않고 이유를 알린다', () => {
    // 왜: 비어 있는 칸은 한국어가 새어 나온 것이 아니다 — 영어 설명으로 채우는 일은 이 도구의 일이 아니다.
    const review = reviewNativeScriptRepair('en', [row({ id: 'e1', action_description_native: '' }), row({ id: 'e2', action_description_native: null })])
    expect(review.patches).toEqual([])
    expect(review.skipped.map((s) => s.reason)).toEqual(['empty-native', 'empty-native'])
  })

  it('한국어 프로젝트의 샷은 하나도 고치지 않는다', () => {
    // 왜: 한국어 프로젝트에서 화면 칸의 한국어는 정상이다 — 같은 모양의 행이어도 건드리면 한국어 사용자의 화면이 영어로 바뀐다.
    const review = reviewNativeScriptRepair('ko', [row()])
    expect(review.patches).toEqual([])
    expect(review.skipped.map((s) => s.reason)).toEqual(['not-english-project'])
  })

  it('화면 설명이 저장 때의 원문과 다르면(사람이 고쳤을 수 있다) 고치지 않고 이유를 알린다', () => {
    // 왜: 사람이 직접 쓴 한국어를 번역본으로 덮으면 되돌릴 길이 없다. provenance 의 원문 해시와 화면 설명이 어긋나면 사람 손을 탔다고 본다.
    const edited = row({ action_description_native: '소녀가 우산을 접지 못하고 문 앞에 멈춘다.' })
    const review = reviewNativeScriptRepair('en', [edited])
    expect(review.patches).toEqual([])
    expect(review.skipped).toEqual([{ id: 'row-1', shot_id: 'sh_02_01', reason: 'maybe-edited' }])
  })

  it('provenance 가 비어 있으면 원문인지 알 수 없어 고치지 않고 이유를 알린다', () => {
    // 왜: 출처 기록이 없는 옛 행은 파이프라인이 쓴 원문인지 사람이 쓴 글인지 가릴 수 없다.
    const review = reviewNativeScriptRepair('en', [row({ id: 'n', i18n_provenance: null }), row({ id: 'e', i18n_provenance: {} })])
    expect(review.patches).toEqual([])
    expect(review.skipped.map((s) => s.reason)).toEqual(['maybe-edited', 'maybe-edited'])
  })

  it('확인을 풀어 달라고 하면 원문 해시를 보지 않고 고친다', () => {
    // 왜: 리드가 skipped 목록을 눈으로 확인한 뒤 "이 행들은 괜찮다"고 판단했을 때 쓰는 열쇠다 — 기본값은 막힌 쪽이다.
    const unproven = row({ i18n_provenance: null })
    const [patch] = planNativeScriptRepair('en', [unproven], { allowUnproven: true })
    expect(patch.action_description_native).toBe(EN)
    expect(patch.i18n_provenance).toEqual({ action_description_native: md5(EN) })
  })

  it('한 번 고친 샷을 다시 넣으면 더 고칠 것이 없다', () => {
    // 왜: 고치기 목록을 두 번 뽑아도 같은 행을 두 번 바꾸지 않는다 — 운영에서 중간에 멈추고 다시 돌려도 안전하다.
    const [patch] = planNativeScriptRepair('en', [row()])
    const fixed = row({ action_description_native: patch.action_description_native, i18n_provenance: patch.i18n_provenance })
    expect(planNativeScriptRepair('en', [fixed])).toEqual([])
  })

  it('행 목록이 비어 있으면 빈 목록을 돌려준다', () => {
    // 왜: 경계값 — 프로젝트에 샷이 없거나 이미 다 고친 뒤에도 오류 없이 끝나야 한다.
    expect(planNativeScriptRepair('en', [])).toEqual([])
    expect(reviewNativeScriptRepair('en', [])).toEqual({ patches: [], skipped: [] })
  })

  it('넘긴 행을 바꾸지 않는다', () => {
    // 왜: 순수 함수다 — 입력으로 받은 행 목록(리드가 운영에서 뽑은 원본)이 호출 뒤에 달라지면 "고치기 전" 값을 잃는다.
    const input = row({ i18n_provenance: { action_description: md5(KO) } })
    const snapshot = JSON.parse(JSON.stringify(input))
    planNativeScriptRepair('en', [input])
    expect(input).toEqual(snapshot)
  })
})
