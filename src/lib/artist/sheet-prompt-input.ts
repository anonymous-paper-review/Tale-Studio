// 인물 시트 프롬프트 입력의 단일 조립점 — generate-sheet 라우트와 서버 초안(draft-trigger)이 같은 입력을 쓴다.
//
// 왜(#ref-gate 2026-09-02): 서버 초안은 name/appearance/role 만 넣고 의상·디자인 토큰·팔레트를 뺐다.
//   프로듀서 인물의 첫 시트만 그 약한 프롬프트로 나왔고, 초안 대상을 전 인물로 넓히면서 이 차이가
//   모든 첫 시트로 번지므로 라우트의 조립 규칙을 그대로 공유한다.
import type { CharacterPromptInput } from '@/lib/artist/turnaround'
import { tokenUnlessMediaWord } from '@/lib/style-anchor'

export interface SheetDesignTokens {
  l1?: {
    art_style?: string
    shape_language?: string
    line_quality?: string
    texture_philosophy?: string
    character_proportion?: string
  }
  palette?: { primary?: string; secondary?: string; accent?: string }
}

export function resolveCharacterPromptInput(args: {
  character: { name: string; role?: string | null }
  appearance: { appearance?: string | null; costume?: string[] | string | null }
  designTokens: SheetDesignTokens | null | undefined
  /** 스타일 앵커가 붙는가 — 붙으면 매체어를 품은 토큰만 정밀 드롭(#F-004 B4 2026-08-12). */
  hasAnchor: boolean
}): CharacterPromptInput {
  const dt = args.designTokens ?? {}
  const palette = [dt.palette?.primary, dt.palette?.secondary, dt.palette?.accent].filter(
    (x): x is string => !!x,
  )
  const costume = args.appearance.costume
  const costumes = Array.isArray(costume)
    ? costume.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    : typeof costume === 'string' && costume.trim()
      ? [costume.trim()]
      : undefined
  const pick = (value: string | undefined) => (args.hasAnchor ? tokenUnlessMediaWord(value) : value)
  return {
    name: args.character.name,
    appearance: args.appearance.appearance ?? args.character.name,
    role: args.character.role ?? undefined,
    costumes: costumes && costumes.length ? costumes : undefined,
    // 앵커 존재 시 매체어 토큰만 정밀 드롭(#F-004 B4 2026-08-12 — 2026-07-14 통짜 억제 결정의
    //   **명시적 번복**): 옛 규칙은 art_style 을 무조건 생략했는데, 실측(dc531572)에서 억제된 것이
    //   앵커에 부합하는 유일한 토큰(3d_animation)이고 정작 매체어(texture: photorealistic)는
    //   살아남아 앵커를 이겼다 — 취지가 정확히 뒤집힌 배치. 새 규칙: 매체어를 품은 토큰만 드롭
    //   (dark_cinematic_realism 류 — 2026-07-14 실측의 교훈은 그대로 보존), 무해한 토큰은 유지.
    //   앵커 없으면 기존 그대로(no-op).
    artStyle: pick(dt.l1?.art_style),
    shapeLanguage: pick(dt.l1?.shape_language),
    lineQuality: pick(dt.l1?.line_quality),
    texturePhilosophy: pick(dt.l1?.texture_philosophy),
    characterProportion: pick(dt.l1?.character_proportion),
    palette,
  }
}
