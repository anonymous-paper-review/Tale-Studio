// 시리즈 다음 화 지시(2026-10-26 오너 승인 · 방향 문서 .claude/docs/2026-10-22/series-brief.html). 앞 화 제목 · 줄거리와
//   이어받은 인물 · 배경을 산문을 쓰는 단계(이야기 엔진 · 구조 · 씬)의 지시에 싣는다 — 프롬프트 문장이라 change-level 과 같은
//   파이프라인 폴더에 둔다. 대사 단계는 이 블록 대신 seriesDialogueBlock(앞 화 줄거리만)을 씬 대사 지시에 싣는다(10-26 Q3).
//   앞 화가 지워져 줄거리를 못 읽었어도(prevProse null) 이어받은 인물 · 배경은 같은 사람 · 같은 장소라고 그대로 지시한다.
//   대본을 그대로 쓰는 화(preserveScript · 바꿈 정도 그대로)는 대본이 진실이라 지시를 더하지 않는다.
import type { PipelineInput } from '@/lib/writer/types/pipeline'

export function seriesBlock(input: Pick<PipelineInput, 'series' | 'preserveScript' | 'changeLevel' | 'inheritedLooks'>): string {
  const series = input.series
  if (!series) return ''
  if (input.preserveScript || input.changeLevel === 'keep') return ''

  const lines = [
    '[시리즈 · 앞 화 다음 이야기]',
    `이 이야기는 「${series.prevTitle}」의 다음 화다. 이번 화는 앞 화 다음에 일어나는 이야기로 쓴다.`,
  ]
  if (series.characters.length) {
    lines.push(
      `이어받은 인물: ${series.characters.join(' · ')} — 앞 화와 같은 사람이다. 이름이 같으면 앞 화의 그 인물로 쓰고 다른 사람으로 바꾸지 않는다.`,
    )
  }
  if (series.locations.length) {
    lines.push(`이어받은 배경: ${series.locations.join(' · ')} — 앞 화와 같은 장소다.`)
  }
  if (series.characters.length || series.locations.length) {
    lines.push('이어받은 인물 · 배경이 이번 화에 모두 나올 필요는 없다 — 이번 화 이야기에 필요한 만큼만 쓴다.')
  }
  lines.push(...seriesLookLines(input.inheritedLooks))
  if (series.prevProse) {
    lines.push('', '[앞 화 줄거리]', series.prevProse)
  } else {
    lines.push('앞 화 줄거리는 없지만 이어받은 인물 · 배경은 앞 화와 같은 사람 · 같은 장소다.')
  }
  return `${lines.join('\n')}\n\n`
}

// 2026-10-27 오너 "제품에서 고칠 것": 운영 2화의 새 뱃사공이 삿갓 · 동양풍 작업복으로 나왔다 — 새 인물 외모 글이 처음 생기는 씬 단계에
//   앞 화가 어느 세계인지가 없었다. 앞 화 인물 외모 · 배경 설명을 기준으로 주고 새로 나오는 것을 같은 세계로 쓰게 한다.
//   인물 · 배경 디자인 단계(v2_design)도 같은 줄을 싣는다.
export function seriesLookLines(looks: PipelineInput['inheritedLooks']): string[] {
  if (!looks || (looks.characters.length === 0 && looks.locations.length === 0)) return []
  const lines = ['', '[앞 화 인물 · 배경 모습]']
  for (const c of looks.characters) lines.push(`- ${c.name}: ${c.appearance}`)
  for (const l of looks.locations) lines.push(`- ${l.name}: ${l.description}`)
  lines.push(
    '새로 나오는 인물 · 장소는 이야기가 다르게 말하지 않는 한 위 인물 · 배경과 같은 세계 · 같은 시대 · 같은 문화권의 모습 · 옷차림 · 건축으로 쓴다.',
  )
  return lines
}

// 씬 대사 지시에 싣는 앞 화 줄거리(2026-10-26 오너 Q3 "대사를 만들 때도 앞 화 줄거리를 넣는다").
//   대사는 샷 단위라 줄거리만 붙이면 이번 화 씬에 없는 앞 화 사건이 대사로 샌다 — 참고용이라고 못 박는다.
//   앞 화가 지워져 줄거리가 없으면 더할 것이 없다(이어받은 인물은 [인물 정보]와 말투로 이미 같은 사람이다).
//   대본을 그대로 쓰는 화(preserveScript · keep)는 대사를 저작하지 않아 이 블록에 닿지 않는다(steps.ts runLaneDialogue).
export function seriesDialogueBlock(series: PipelineInput['series']): string {
  if (!series?.prevProse) return ''
  return [
    '[앞 화 줄거리 — 참고]',
    `이 이야기는 「${series.prevTitle}」의 다음 화다. 아래는 앞 화에서 이미 일어난 일이다.`,
    '인물이 앞 화 일을 말할 때는 이 줄거리와 맞게 말한다. 이번 화 씬에 없는 앞 화 사건은 대사로 새로 꺼내지 않는다.',
    series.prevProse,
  ].join('\n') + '\n\n'
}
