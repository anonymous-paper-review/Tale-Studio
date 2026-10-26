// 이 화 그림체로 다시 그릴 때 참고할 앞 화 그림(2026-10-26 시리즈) — 이어받은 인물 시트 · 배경 와이드샷의 주소.
//   Artist [만들기] 때 그대로 쓸 그림(같은 그림체 · 이번 화에 안 나옴)은 이미 이 화 표에 들어온다. 표의 그림 칸이 비어 있는
//   이어받은 인물 · 배경이 "그림체가 다르고 이번 화에 나오는 것" 이라, 그 앞 화 그림을 정체성 참고로 넣고 이 화 그림체로 다시 그린다.
//   주소는 이미 이 프로젝트 보관함으로 복사된 것이다(projects.series). 순수 함수 — 서버 · 클라이언트가 같이 쓴다.
import type { SeriesSnapshot } from './snapshot'

/** 이어받은 인물의 앞 화 시트 주소. 시리즈가 아니거나 이어받지 않은 인물이거나 그림 복사에 실패했으면 null. */
export function seriesCharacterReference(
  series: SeriesSnapshot | null | undefined,
  characterId: string,
): string | null {
  if (!series || !characterId) return null
  return series.characters.find((c) => c.characterId === characterId)?.sheetUrl ?? null
}

/** 앞 화 와이드샷을 참고 그림으로 붙인 배경 프롬프트 끝에 더하는 지시. 인물 시트의 hasSeriesSheet 줄과 같은 규칙이다.
 *  실사처럼 기준 그림 없이 그리는 그림체는 앞 화 그림이 유일한 참고 그림이라, 이 줄이 없으면 앞 화 그림체를 따라 그린다.
 *  호출부 계약: 앞 화 와이드샷은 참고 그림의 마지막 장이다. 그림 출처 해시는 이 줄을 더하기 전 프롬프트로 만든다. */
export function withSeriesLocationReference(prompt: string): string {
  return [
    prompt,
    'the LAST reference image is this same place as drawn for the PREVIOUS episode of this series — take ONLY the identity of the place from it: the layout, landmarks, architecture and colors',
    'redraw that place completely in the art style declared for THIS image — never copy the previous episode image\'s linework, shading, texture or medium',
  ].join('\n')
}

/** 이어받은 배경의 앞 화 와이드샷 주소. 시리즈가 아니거나 이어받지 않은 배경이거나 그림 복사에 실패했으면 null. */
export function seriesLocationReference(
  series: SeriesSnapshot | null | undefined,
  locationId: string,
): string | null {
  if (!series || !locationId) return null
  return series.locations.find((l) => l.locationId === locationId)?.wideShotUrl ?? null
}
