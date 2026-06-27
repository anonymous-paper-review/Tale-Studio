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
