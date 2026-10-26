// 시리즈 앞 화 세계 한 줄(2026-10-27 오너 "가로 하자") — 지시문 만들기와 답 읽기. 순수 함수(AI 호출은 world-line-llm.ts).
//   운영 2화 뱃사공은 "짚 모자 · 삼베 셔츠"라는 낱말만 보고 1화(중세 유럽풍)와 다른 삿갓 · 매듭 단추 차림으로 그려졌다.
//   그래서 [다음 화 만들기] 때 앞 화 인물 생김새 · 배경 모습에서 세계(시대 · 문화권 · 건물 · 옷감)를 영어 한 줄로 적어 두고,
//   새 인물 · 새 배경의 그림 지시에 넣는다(redraw-reference.ts seriesWorldLine). 그림 지시가 영어라 영어로 받는다.

/** 세계 한 줄의 상한(글자). 넘으면 자른다 — 그림 지시의 다른 줄을 밀어내지 않게. */
export const SERIES_WORLD_MAX_CHARS = 300

/** 지시에 싣는 인물 · 배경 수와 한 줄 상한. 세계를 읽는 데는 이 정도면 충분하다. */
const SOURCE_MAX_ITEMS = 12
const SOURCE_MAX_CHARS = 240

export interface SeriesWorldSource {
  title: string
  characters: Array<{ name: string; appearance: string }>
  locations: Array<{ name: string; description: string }>
}

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim()
const clip = (text: string, max: number): string => {
  const clean = oneLine(text)
  return clean.length <= max ? clean : clean.slice(0, max).trimEnd()
}

const SYSTEM = [
  'You read the characters and places of one episode of an animated series and write down the world they live in, so that new characters and places drawn for the next episode belong to the same world.',
  'Write ONE English line for an image model, about 40 words at most: the era or period, the region and culture the clothing and architecture come from, the technology level, the typical buildings and building materials, and the typical garments and clothing materials.',
  'Be concrete and visual, in this shape: "<era> <region or culture> <genre> world: <buildings and materials>; <garments and clothing materials>; <technology level>".',
  'If the episode is set in the present day, say which country or city it looks like.',
  'never name characters, places or story events, and never describe one specific character\'s outfit.',
  'Return JSON only: {"world":"..."}',
].join('\n')

/** 앞 화 제목 · 인물 생김새 · 배경 모습으로 세계 한 줄을 적게 하는 지시. */
export function buildSeriesWorldPrompt(source: SeriesWorldSource): { system: string; prompt: string } {
  const characters = source.characters
    .filter((c) => c.appearance.trim())
    .slice(0, SOURCE_MAX_ITEMS)
    .map((c) => `- ${oneLine(c.name)}: ${clip(c.appearance, SOURCE_MAX_CHARS)}`)
  const locations = source.locations
    .filter((l) => l.description.trim())
    .slice(0, SOURCE_MAX_ITEMS)
    .map((l) => `- ${oneLine(l.name)}: ${clip(l.description, SOURCE_MAX_CHARS)}`)
  const prompt = [
    '[Episode title]',
    oneLine(source.title),
    '',
    '[Characters and how they look]',
    ...(characters.length ? characters : ['- (none)']),
    '',
    '[Places and how they look]',
    ...(locations.length ? locations : ['- (none)']),
  ].join('\n')
  return { system: SYSTEM, prompt }
}

/** AI 답 → 세계 한 줄. 모양이 틀리거나 비었으면 null, 길면 상한에서 자른다. */
export function parseSeriesWorldLine(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const world = (raw as { world?: unknown }).world
  if (typeof world !== 'string') return null
  const line = clip(world, SERIES_WORLD_MAX_CHARS)
  return line || null
}
