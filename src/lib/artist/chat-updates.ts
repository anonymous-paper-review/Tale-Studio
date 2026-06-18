// artist 채팅 cc(LLM) 가 반환한 update 들의 화이트리스트 검증 (순수 함수).
//
// F6 안전 규칙(원천/파생 §3 + 원칙2): cc 가 자동으로 실행(applyUpdates)할 수 있는 update 는
//   엄격한 화이트리스트뿐이다 — createCharacter(신규 생성) / regenerate*(차 있는 파생 이미지 교체, 사람 요청).
//   기존 캐릭터의 canonical 외형(원천) 변경은 자동경로로 절대 들어오지 못한다: 그런 type 은 화이트리스트에
//   없어 드롭되며, cc 는 그 의도를 update 가 아니라 pending-proposal('artistSourceAppearancePatch')로만 표면화해
//   사용자 승인 뒤 서버 검증 라우트로 커밋해야 한다. (모델은 제안만 — architecture §3.)
//
// route 와 분리해 순수 단위 테스트가 가능하게 한다(F6 회귀 가드).

const VALID_ROLES = new Set(['protagonist', 'antagonist', 'supporting'])
const VALID_VIEWS = new Set(['main', 'back', 'sideLeft', 'sideRight'])

// 자동 실행(applyUpdates) 허용 type 화이트리스트. 외형(원천) 변경 type 은 의도적으로 제외(F6).
export const AUTO_APPLY_UPDATE_TYPES = new Set([
  'createCharacter',
  'regenerateCharacter',
  'regenerateWorldAsset',
])

function asString(x: unknown): string | undefined {
  return typeof x === 'string' ? x : undefined
}

/**
 * cc update 배열을 화이트리스트로 검증·정규화한다. 허용 type 외(외형 변경 등 원천 mutation 포함)는 드롭.
 *   반환은 artist-store ArtistUpdate 와 1:1 인 정규화된 객체들.
 */
export function validateUpdates(raw: unknown[]): unknown[] {
  const out: unknown[] = []
  for (const u of raw) {
    if (!u || typeof u !== 'object') continue
    const rec = u as Record<string, unknown>
    if (typeof rec.type !== 'string' || !AUTO_APPLY_UPDATE_TYPES.has(rec.type)) continue

    switch (rec.type) {
      case 'createCharacter': {
        const name = asString(rec.name)?.trim()
        if (name) {
          out.push({
            type: 'createCharacter',
            name,
            ...(typeof rec.role === 'string' && VALID_ROLES.has(rec.role)
              ? { role: rec.role }
              : {}),
            ...(asString(rec.description) ? { description: rec.description } : {}),
            ...(asString(rec.appearance) ? { appearance: rec.appearance } : {}),
          })
        }
        break
      }
      case 'regenerateCharacter':
        if (asString(rec.characterId)) {
          const views = Array.isArray(rec.views)
            ? rec.views.filter(
                (v): v is string => typeof v === 'string' && VALID_VIEWS.has(v),
              )
            : []
          out.push({
            type: 'regenerateCharacter',
            characterId: rec.characterId,
            ...(views.length ? { views } : {}),
            ...(asString(rec.instruction) ? { instruction: rec.instruction } : {}),
          })
        }
        break
      case 'regenerateWorldAsset':
        if (asString(rec.locationId)) {
          out.push({ type: 'regenerateWorldAsset', locationId: rec.locationId })
        }
        break
    }
  }
  return out
}

/** 원천 외형 변경 제안 1건 (자동 실행 금지 — pending-proposal 채널 전용). */
export interface AppearanceProposal {
  characterId: string
  appearance: string
}

/**
 * cc 가 emit 한 "기존 캐릭터 canonical 외형 변경"(changeAppearance) 의도를 추출한다 — F6 제안 채널.
 *   validateUpdates(자동 실행 화이트리스트)는 이 type 을 드롭하므로, 외형 변경은 오직 이 함수를 거쳐
 *   pending-proposal('artistSourceAppearancePatch')로만 흐르고 사용자 승인 후에만 커밋된다(원천 = 사람 명시).
 */
export function extractAppearanceProposals(raw: unknown[]): AppearanceProposal[] {
  const out: AppearanceProposal[] = []
  for (const u of raw) {
    if (!u || typeof u !== 'object') continue
    const rec = u as Record<string, unknown>
    if (rec.type !== 'changeAppearance') continue
    const characterId = asString(rec.characterId)?.trim()
    const appearance = asString(rec.appearance)?.trim()
    if (characterId && appearance) out.push({ characterId, appearance })
  }
  return out
}
