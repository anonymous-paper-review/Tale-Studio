// 아티스트 온보딩 버블 — 순수 함수(LLM-0). 캐릭터별 상태를 정확한 카피로 분리해 보여준다.
//   look-pending(초안) / no-image(이미지 없음 — 초안 아님) / failed(콘텐츠정책 실패 — 카드 우회).
//   "최종 룩으로 정리" 버튼은 look-pending + no-image 를 일괄 생성한다(failed/moderation 은 카드별 우회).

export type ArtistCharacterState = 'look-pending' | 'no-image' | 'failed'

export interface ArtistRefreshChar {
  name: string
  state: ArtistCharacterState
}

export interface ArtistLookSummary {
  artStyle?: string | null
  /** design_tokens.color_meaning(top-level) — 색→의미. 1-2개만 요약 노출. */
  colorMeaning?: Record<string, string> | null
}

function names(chars: ArtistRefreshChar[], state: ArtistCharacterState): string[] {
  return chars.filter((c) => c.state === state).map((c) => c.name)
}

function lookLine(look: ArtistLookSummary | null | undefined): string | null {
  if (!look) return null
  const parts: string[] = []
  if (look.artStyle) parts.push(`그림체 ${look.artStyle}`)
  const cm = look.colorMeaning ? Object.entries(look.colorMeaning).slice(0, 2) : []
  if (cm.length) parts.push(cm.map(([color, meaning]) => `${color}=${meaning}`).join(', '))
  return parts.length ? `최종 룩 — ${parts.join(' · ')}` : null
}

/**
 * 온보딩 버블 본문. 비어있으면(상태별 캐릭터 0) '' 반환(호출자가 버블 안 띄움).
 */
export function buildArtistRefreshMessage(input: {
  characters: ArtistRefreshChar[]
  look?: ArtistLookSummary | null
}): string {
  const pending = names(input.characters, 'look-pending')
  const noImage = names(input.characters, 'no-image')
  const failed = names(input.characters, 'failed')
  if (!pending.length && !noImage.length && !failed.length) return ''

  const lines: string[] = []
  const lk = lookLine(input.look)
  lines.push(lk ? `writer가 최종 그림체를 정했어요 (${lk}).` : 'writer가 최종 그림체를 정했어요.')
  if (pending.length) lines.push(`• ${pending.join(', ')} — 최종 룩 반영 전 초안이에요.`)
  if (noImage.length) lines.push(`• ${noImage.join(', ')} — 아직 이미지가 없어요.`)
  if (failed.length)
    lines.push(`• ${failed.join(', ')} — 콘텐츠 정책으로 막혔어요. 카드에서 "우회(safe)로 다시 만들기"를 눌러주세요.`)
  if (pending.length || noImage.length) {
    // no-image-only 면 '초안' 단어 미노출(초안 없음). pending-only 면 '미생성' 미노출.
    const what =
      pending.length && noImage.length
        ? '초안·미생성 이미지'
        : pending.length
          ? '초안 이미지'
          : '미생성 이미지'
    lines.push(`"최종 룩으로 정리"를 누르면 ${what}를 새 그림체로 한 번에 만들어드려요.`)
  }
  return lines.join('\n')
}

/**
 * 온보딩 suggestion id — lookVersion 만으로는 실패(룩 안 바뀜)에 침묵하므로 refreshGap+failedCount 도 시그니처에 포함.
 *   갭/실패 델타 시 새 id(=재발사), 동일 상태면 동일 id(=dismissed dedupe). 결정적.
 */
export function artistRefreshSuggestionKey(input: {
  projectId: string
  lookVersion: string
  refreshGap: number
  failedCount: number
}): string {
  return `artist-refresh-${input.projectId}-${input.lookVersion}-g${input.refreshGap}-f${input.failedCount}`
}
