// 언어 경계 — 유저 언어(native) 자유서술 → 영어 base 파생 (dev/language_boundary/plan.md, S1).
//   영어 = 생성(이미지/영상)·i18n 피벗 canonical. producer 입력을 handoff 에서 eager 변환해
//   DB 주 컬럼(EN) + `_native`(원천) + i18n_provenance(원천 해시)를 채운다.
//   모델은 번역/정규화만(내용 추가 금지, architecture §3). 엔티티 종류당 claudeJSON 1콜 배치.
//   best-effort: 파생 실패 항목은 주 컬럼=native 유지(회귀 없음).  server-only(supabaseAdmin 의존).
import { createHash } from 'node:crypto'
import { claudeJSON } from '@/lib/claude'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { CastContract } from '@/lib/writer/types/pipeline'

/** native 원천 텍스트의 안정 해시 — i18n_provenance 에 기록(편집→stale 판정 근거, S6). */
export function i18nHash(s: string): string {
  return createHash('md5').update(s).digest('hex')
}

interface I18nItem {
  id: string
  native: string
}

const SYSTEM = `You translate short film pre-production field values into natural, concrete ENGLISH used as the canonical base for AI image/video prompt generation.
Rules:
- Translate/normalize ONLY. Never add, embellish, or invent content not present in the source.
- Preserve every concrete visual detail: shapes, materials, colors, spatial relations, lighting, mood, proportions.
- Favor concrete nouns and visual adjectives (these become image-prompt source text).
- Proper nouns with no English equivalent: transliterate (keep coined names).
- If a value is already English, return it unchanged.
- Return STRICT JSON ONLY: {"items":[{"id":"<id>","en":"<english>"}]} — exactly one entry per input id, identical ids.`

// 이미 영어(라틴)면 LLM skip — 파이프라인 산출은 드리프트로 영어/한국어 혼재라 무변환 통과로 비용↓.
//   CJK·Hangul·전각 문자가 있으면 번역 대상(보수적 필터, locale 감지 S4 와 별개).
const NEEDS_TRANSLATION = /[　-鿿가-힯＀-￯]/

/** native 배열 → Map<id, en>. 빈/공백 제외, 이미 영어면 무변환. LLM 실패 항목은 맵에 없음(호출부 native 폴백). */
export async function deriveEnBatch(items: I18nItem[], kind: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const todo: I18nItem[] = []
  for (const i of items) {
    const n = (i.native ?? '').trim()
    if (!n) continue
    if (!NEEDS_TRANSLATION.test(n)) map.set(i.id, n) // 이미 영어 → 무변환
    else todo.push({ id: i.id, native: n })
  }
  if (!todo.length) return map
  try {
    const user = `Field kind: ${kind}.\n${JSON.stringify({
      items: todo.map((i) => ({ id: i.id, native: i.native })),
    })}`
    const out = await claudeJSON<{ items?: Array<{ id?: string; en?: string }> }>(
      SYSTEM,
      user,
      0.2,
      `i18n-en:${kind}`,
    )
    for (const r of out?.items ?? []) {
      if (r?.id && typeof r.en === 'string' && r.en.trim()) map.set(r.id, r.en.trim())
    }
    return map
  } catch (e) {
    console.error(`[i18n/derive-en] ${kind} batch failed:`, e instanceof Error ? e.message : e)
    return map // 이미 영어로 채운 부분 결과 유지
  }
}

/**
 * producer handoff 의 native 자유서술(캐릭터 외형 + 로케이션 배경 묘사)을 영어 base 로 변환해
 *   DB 주 컬럼(EN) + `_native`(원천) + i18n_provenance(원천 해시)를 채운다. (S1a, eager@handoff)
 *   - 동기 호출 전제(Hobby `after()` 죽음 회피). 호출부가 drafts/step 트리거보다 먼저 await.
 *   - 파생된 항목만 갱신 — 실패분은 그대로 두어 주 컬럼=native 유지(회귀 없음).
 */
export async function applyProducerI18n(
  projectId: string,
  cast: CastContract | undefined,
  backgrounds:
    | { locations: Array<{ location_id: string; visual_description: string }> }
    | undefined,
): Promise<{ characters: number; locations: number }> {
  const charItems: I18nItem[] = (cast?.characters ?? [])
    .filter((c) => c.appearance && c.appearance.trim())
    .map((c) => ({ id: c.character_id, native: c.appearance }))
  const locItems: I18nItem[] = (backgrounds?.locations ?? [])
    .filter((b) => b.visual_description && b.visual_description.trim())
    .map((b) => ({ id: b.location_id, native: b.visual_description }))

  const [charEn, locEn] = await Promise.all([
    deriveEnBatch(charItems, 'character appearance'),
    deriveEnBatch(locItems, 'location visual description'),
  ])

  // i18n_provenance: S1a 는 테이블당 단일 필드라 객체 set. (S3 다필드 확장 시 jsonb merge `||` 로 전환.)
  const charUpdates = charItems
    .map((it) => ({ it, en: charEn.get(it.id) }))
    .filter((x): x is { it: I18nItem; en: string } => !!x.en)
    .map(({ it, en }) =>
      supabaseAdmin
        .from('characters')
        .update({
          appearance: en,
          appearance_native: it.native,
          i18n_provenance: { appearance: i18nHash(it.native) },
        })
        .eq('project_id', projectId)
        .eq('character_id', it.id),
    )
  const locUpdates = locItems
    .map((it) => ({ it, en: locEn.get(it.id) }))
    .filter((x): x is { it: I18nItem; en: string } => !!x.en)
    .map(({ it, en }) =>
      supabaseAdmin
        .from('locations')
        .update({
          visual_description: en,
          visual_description_native: it.native,
          i18n_provenance: { visual_description: i18nHash(it.native) },
        })
        .eq('project_id', projectId)
        .eq('location_id', it.id),
    )

  const charResults = await Promise.all(charUpdates)
  const locResults = await Promise.all(locUpdates)
  return {
    characters: charResults.filter((r) => !r.error).length,
    locations: locResults.filter((r) => !r.error).length,
  }
}

/**
 * 캐릭터 외형(유저 언어 native) → bilingual 필드 셋. 편집 라우트(appearance/character)가 공유한다.
 *   appearance = EN base(생성), appearance_native = 원천. 파생 성공 시에만 provenance 기록(실패 시 재파생 여지).
 *   server-only(claudeJSON). 호출부가 update/insert 에 펼쳐 쓴다.
 */
export async function appearanceI18nFields(
  characterId: string,
  native: string | null | undefined,
): Promise<{
  appearance: string | null
  appearance_native: string | null
  i18n_provenance: Record<string, string>
}> {
  const n = (native ?? '').trim()
  if (!n) return { appearance: null, appearance_native: null, i18n_provenance: {} }
  const enMap = await deriveEnBatch([{ id: characterId, native: n }], 'character appearance')
  const derived = enMap.get(characterId)
  return {
    appearance: derived ?? n, // 파생 실패 시 native 폴백 (미파생 — 오염 아님)
    appearance_native: n,
    i18n_provenance: derived ? { appearance: i18nHash(n) } : {},
  }
}

// ── EN base → 유저 언어(native) 역파생 (표시용) ─────────────────────────────
//   deriveEnBatch 의 거울상. 왜 필요한가: writer 파이프라인(Gemini/Claude, 영어 템플릿)은 producer
//   입력이 한국어여도 씬/샷 서술을 **영어로 산출**한다(검증: locale=ko 프로젝트도 action_description 전부 영어).
//   그래서 표시할 유저 언어 텍스트가 DB 에 없다 — _native 가 곧 영어 주 컬럼의 사본. 표시는 _native 를
//   읽으므로(writer-store) 영어가 보인다. 이 역파생이 EN canonical → locale 표기를 만들어 _native 를 채운다.
//   원칙: 생성(이미지/영상)은 여전히 EN 주 컬럼만 쓴다 — 여기서 **주 컬럼은 절대 건드리지 않는다**(_native 만).
//   (language boundary S7, '영어=base, 유저언어=표기')

// locale 별 "이미 타깃 언어" 스크립트 — 있으면 번역 skip(원문/사람 산출 보존, 비용↓). ko 외는 확장 여지.
const LOCALE_SCRIPT: Record<string, RegExp> = {
  ko: /[가-힣]/,
  ja: /[぀-ゟ゠-ヿ一-鿿]/,
  zh: /[一-鿿]/,
}
export function isTargetScript(text: string | null | undefined, locale: string): boolean {
  const re = LOCALE_SCRIPT[locale]
  return re ? re.test(text ?? '') : false
}

const LOCALE_NAME: Record<string, string> = {
  ko: 'Korean (한국어)',
  ja: 'Japanese (日本語)',
  zh: 'Chinese (中文)',
  en: 'English',
}
function nativeSystem(locale: string): string {
  const lang = LOCALE_NAME[locale] ?? locale
  return `You translate short film pre-production field values from English into natural, idiomatic ${lang} for display to the creator in the editing UI.
Rules:
- Translate ONLY. Never add, embellish, omit, or invent content not present in the source.
- Write fluent, natural ${lang} the way a native screenwriter would — NOT a literal word-for-word rendering (avoid translationese).
- Preserve every concrete detail: shapes, materials, colors, spatial relations, lighting, mood, proportions, numbers.
- Keep proper nouns / coined names as-is (do not force-translate names).
- If a value is already in ${lang}, return it unchanged.
- Return STRICT JSON ONLY: {"items":[{"id":"<id>","native":"<${lang}>"}]} — exactly one entry per input id, identical ids.`
}

interface NativeItem {
  id: string
  en: string
}

/** EN base 배열 → Map<id, native(locale)>. 빈값 제외, 이미 타깃 스크립트면 무변환. LLM 실패 항목은 맵에 없음(호출부 EN 폴백). */
export async function deriveNativeBatch(
  items: NativeItem[],
  locale: string,
  kind: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!locale || locale === 'en') return map // 표시=base(EN) — 역파생 불필요
  const todo: NativeItem[] = []
  for (const i of items) {
    const e = (i.en ?? '').trim()
    if (!e) continue
    if (isTargetScript(e, locale)) map.set(i.id, e) // 이미 타깃 언어 → 무변환(원문 보존)
    else todo.push({ id: i.id, en: e })
  }
  if (!todo.length) return map
  try {
    const user = `Field kind: ${kind}.\n${JSON.stringify({
      items: todo.map((i) => ({ id: i.id, en: i.en })),
    })}`
    const out = await claudeJSON<{ items?: Array<{ id?: string; native?: string }> }>(
      nativeSystem(locale),
      user,
      0.3,
      `i18n-native:${locale}:${kind}`,
    )
    for (const r of out?.items ?? []) {
      if (r?.id && typeof r.native === 'string' && r.native.trim()) map.set(r.id, r.native.trim())
    }
    return map
  } catch (e) {
    console.error(`[i18n/derive-native] ${kind} batch failed:`, e instanceof Error ? e.message : e)
    return map // 이미 타깃 언어로 채운 부분 결과 유지
  }
}

/**
 * 파이프라인 산출 표시 필드의 _native 를 유저 locale 로 채운다(EN base → 표기 역파생).
 *   대상: scenes.narrative_summary/mood, shots.action_description, locations.visual_description.
 *   파이프라인이 영어를 산출하므로 _native 가 영어인 기존 프로젝트의 writer 탭 표시를 유저 언어로 교정한다.
 *   불변식:
 *     - 주 컬럼(EN, 생성 canonical)은 절대 건드리지 않는다 — _native 만 쓴다.
 *     - 이미 타깃 언어인 _native(producer 입력·사람 편집분)는 skip — 사람 산출 보존(덮어쓰기 금지).
 *     - provenance.<field>_native = hash(EN source) → EN 변경 시 stale 판정 + 재실행 멱등(같은 EN 이면 재번역 안 함).
 *   best-effort. server-only(supabaseAdmin/claudeJSON).
 */
export async function applyPipelineNativeI18n(
  projectId: string,
  locale?: string,
): Promise<{ scenes: number; shots: number; locations: number; locale: string }> {
  let loc = (locale ?? '').trim()
  if (!loc) {
    const { data: p } = await supabaseAdmin
      .from('projects')
      .select('locale')
      .eq('id', projectId)
      .maybeSingle()
    loc = ((p?.locale as string) ?? 'en').trim()
  }
  if (loc === 'en') return { scenes: 0, shots: 0, locations: 0, locale: loc } // 표시=base(EN)

  const [{ data: scenes }, { data: shots }, { data: locations }] = await Promise.all([
    supabaseAdmin
      .from('scenes')
      .select('scene_id, narrative_summary, narrative_summary_native, mood, mood_native, i18n_provenance')
      .eq('project_id', projectId),
    supabaseAdmin
      .from('shots')
      .select('shot_id, action_description, action_description_native, i18n_provenance')
      .eq('project_id', projectId),
    supabaseAdmin
      .from('locations')
      .select('location_id, visual_description, visual_description_native, i18n_provenance')
      .eq('project_id', projectId),
  ])

  // 번역 대상: 주 컬럼(EN) 있고 + 현재 _native 가 타깃 언어가 아님(=영어 사본, 미파생). 사람 산출(타깃 언어)은 제외.
  const pick = (en: unknown, nat: unknown) => {
    const e = String(en ?? '').trim()
    if (!e) return null
    if (isTargetScript(String(nat ?? ''), loc)) return null // 이미 유저 언어 → 보존
    return e
  }
  const narrItems: NativeItem[] = []
  const moodItems: NativeItem[] = []
  for (const s of scenes ?? []) {
    const n = pick(s.narrative_summary, s.narrative_summary_native)
    if (n) narrItems.push({ id: s.scene_id as string, en: n })
    const m = pick(s.mood, s.mood_native)
    if (m) moodItems.push({ id: s.scene_id as string, en: m })
  }
  const actItems: NativeItem[] = []
  for (const sh of shots ?? []) {
    const a = pick(sh.action_description, sh.action_description_native)
    if (a) actItems.push({ id: sh.shot_id as string, en: a })
  }
  const locItems: NativeItem[] = []
  for (const l of locations ?? []) {
    const v = pick(l.visual_description, l.visual_description_native)
    if (v) locItems.push({ id: l.location_id as string, en: v })
  }

  const [narrKo, moodKo, actKo, locKo] = await Promise.all([
    deriveNativeBatch(narrItems, loc, 'scene narrative summary'),
    deriveNativeBatch(moodItems, loc, 'scene mood'),
    deriveNativeBatch(actItems, loc, 'shot action description'),
    deriveNativeBatch(locItems, loc, 'location visual description'),
  ])

  const prov = (raw: unknown): Record<string, string> =>
    raw && typeof raw === 'object' ? { ...(raw as Record<string, string>) } : {}

  // scenes — narrative/mood 둘 다 한 행 update 로 묶음. flatMap([]/[빌더])로 null 없는 빌더 배열 생성.
  const sceneUpdates = (scenes ?? []).flatMap((s) => {
    const sid = s.scene_id as string
    const patch: Record<string, unknown> = {}
    const p = prov(s.i18n_provenance)
    const nKo = narrKo.get(sid)
    if (nKo && nKo !== s.narrative_summary_native) {
      patch.narrative_summary_native = nKo
      p.narrative_summary_native = i18nHash(String(s.narrative_summary))
    }
    const mKo = moodKo.get(sid)
    if (mKo && mKo !== s.mood_native) {
      patch.mood_native = mKo
      p.mood_native = i18nHash(String(s.mood))
    }
    if (!Object.keys(patch).length) return []
    patch.i18n_provenance = p
    return [supabaseAdmin.from('scenes').update(patch).eq('project_id', projectId).eq('scene_id', sid)]
  })

  const shotUpdates = (shots ?? []).flatMap((sh) => {
    const id = sh.shot_id as string
    const ko = actKo.get(id)
    if (!ko || ko === sh.action_description_native) return []
    const p = prov(sh.i18n_provenance)
    p.action_description_native = i18nHash(String(sh.action_description))
    return [
      supabaseAdmin
        .from('shots')
        .update({ action_description_native: ko, i18n_provenance: p })
        .eq('project_id', projectId)
        .eq('shot_id', id),
    ]
  })

  const locUpdates = (locations ?? []).flatMap((l) => {
    const id = l.location_id as string
    const ko = locKo.get(id)
    if (!ko || ko === l.visual_description_native) return []
    const p = prov(l.i18n_provenance)
    p.visual_description_native = i18nHash(String(l.visual_description))
    return [
      supabaseAdmin
        .from('locations')
        .update({ visual_description_native: ko, i18n_provenance: p })
        .eq('project_id', projectId)
        .eq('location_id', id),
    ]
  })

  const [sR, shR, lR] = await Promise.all([
    Promise.all(sceneUpdates),
    Promise.all(shotUpdates),
    Promise.all(locUpdates),
  ])
  return {
    scenes: sR.filter((r) => !r.error).length,
    shots: shR.filter((r) => !r.error).length,
    locations: lR.filter((r) => !r.error).length,
    locale: loc,
  }
}
