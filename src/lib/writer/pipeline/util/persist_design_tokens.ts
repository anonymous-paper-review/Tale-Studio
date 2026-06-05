// writer 파이프라인 전역 디자인 토큰 → projects.design_tokens (DB化, §2-2)
//
// change: unify-svc-writer-pipeline §2-2. 008_svc_design_tokens.sql 로 추가된 컬럼에 기록.
// 전역(프로젝트 1:1) 토큰만 기록한다 — RenderFormat + ArtDirection + ProductionDesign 전역부.
//
// per-character(appearance/costume) / per-location(style_description 등)은 의도적으로 제외:
//   writer S2 character id(LLM snake_case)와 writer characters.character_id(char_01)가 독립 생성되어
//   일치 보장이 없다 → UPDATE by id 가 0건 매치 위험. id 정합은 파이프라인 일원화(§3) 이후.
//
// 소비측(artist 턴어라운드 시트 = writer-background-artist-progress §5)이 아직 미구현이라,
// 여기서는 "데이터를 DB에 올려두는" 생산자 측만 담당한다.
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { RenderFormat, ArtDirection, ProductionDesign } from '@/lib/writer/types/pipeline'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface DesignTokens {
  l0: RenderFormat
  l1: ArtDirection
  palette: ProductionDesign['global_palette']
  color_meaning: ProductionDesign['color_meaning']
  vfx_approach: string
}

/**
 * 전역 디자인 토큰을 projects.design_tokens 에 기록.
 * projectId 가 DB UUID 가 아니면(자체 생성 run 등) skip — handoff 경유 run 만 대상.
 * 호출자는 non-blocking 으로 감싼다 (실패해도 파이프라인 계속).
 */
export async function persistDesignTokens(
  projectId: string,
  renderFormat: RenderFormat,
  artDirection: ArtDirection,
  productionDesign: ProductionDesign,
): Promise<void> {
  if (!UUID_RE.test(projectId)) return // 핸드오프 외 run — DB project 없음

  const design_tokens: DesignTokens = {
    l0: renderFormat,
    l1: artDirection,
    palette: productionDesign.global_palette,
    color_meaning: productionDesign.color_meaning,
    vfx_approach: productionDesign.vfx_approach,
  }

  const { error } = await supabaseAdmin
    .from('projects')
    .update({ design_tokens })
    .eq('id', projectId)

  if (error) throw error
}
