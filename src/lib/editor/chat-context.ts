// Editor 조언 채팅에 싣는 지금 타임라인 요약(오너 2026-11-14 10번 — "채팅으로 조언을 얻을 수 있게, 작업물에는 터치 못 하게").
//   편집 상태를 읽기만 한다 — 컷 수 · 전체 길이 · 순서(자리 · 길이 · 샷 종류 · 설명 · 빠르기 · 전환 · 자막) · 제목 카드 · 소리 줄.
//   내부 번호(샷 id)는 싣지 않는다(채팅 답 규칙 — 사용자는 컷 순서 · 설명으로 부른다). 약속: tests/chat/editor-advice-chat.test.ts
import { selectTimelineLayout } from '@/stores/editor-store'
import type { AudioTrackClip, Shot, VideoClip } from '@/types/shot'

export interface EditorChatContextInput {
  shots: Shot[]
  videoClips: VideoClip[]
  clipOrder: Record<string, string[]>
  audioClips: AudioTrackClip[]
}

const secs = (value: number) => `${value.toFixed(1)}s`
const short = (text: string) => (text.length > 120 ? `${text.slice(0, 117)}...` : text)

export function editorChatContext(input: EditorChatContextInput): string {
  const layout = selectTimelineLayout(input)
  const total = layout.reduce((sum, item) => sum + item.durationSec, 0)
  const titleCount = layout.filter((item) => input.shots.find((shot) => shot.shotId === item.shotId)?.titleCard).length
  const lines = [
    '<editor_timeline>',
    `Total length: ${secs(total)} · Cuts on the timeline: ${layout.length}${titleCount ? ` · Title cards: ${titleCount}` : ''}`,
  ]
  if (layout.length) lines.push('Cuts in order:')
  layout.forEach((item, index) => {
    const shot = input.shots.find((s) => s.shotId === item.shotId)
    const clip = input.videoClips.find((c) => c.shotId === item.shotId)
    const range = `${secs(item.startSec)}–${secs(item.startSec + item.durationSec)} (${secs(item.durationSec)})`
    const what = shot?.titleCard
      ? `Title card "${short(shot.titleCard.text)}"`
      : `${shot?.shotType ?? 'Shot'} · "${short(shot?.actionDescription ?? '')}"`
    const extras = [
      clip && !shot?.titleCard && (clip.status !== 'completed' || !clip.url) ? 'no video yet' : null,
      clip?.speed && clip.speed !== 1 ? `speed ${clip.speed}×` : null,
      clip?.transitionIn ? `fades through black from the cut before (${clip.transitionIn.durationSec}s)` : null,
      shot?.subtitle?.text ? `subtitle "${short(shot.subtitle.text)}"` : null,
    ].filter(Boolean)
    lines.push(`${index + 1}. ${range} ${what}${extras.length ? ` · ${extras.join(' · ')}` : ''}`)
  })
  const audio = input.audioClips
  lines.push(
    audio.length === 0
      ? 'Audio: none'
      : `Audio: ${audio.length} ${audio.length === 1 ? 'clip' : 'clips'} · ${audio
          .map((a) => `"${short(a.name)}" ${secs(a.startSec)}–${secs(a.startSec + a.durationSec)} · volume ${Math.round(a.volume * 100)}%${a.muted ? ' · muted' : ''}`)
          .join('; ')}`,
  )
  lines.push('</editor_timeline>')
  return lines.join('\n')
}
