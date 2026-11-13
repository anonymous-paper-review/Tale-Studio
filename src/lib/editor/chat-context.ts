// Editor 조언 채팅에 싣는 지금 타임라인 요약(오너 2026-11-14 10번 — "채팅으로 조언을 얻을 수 있게, 작업물에는 터치 못 하게").
//   편집 상태를 읽기만 한다 — 컷 수 · 전체 길이 · 순서(자리 · 길이 · 샷 종류 · 설명 · 빠르기 · 전환 · 자막) · 제목 카드 · 제목 클립 · 소리 줄.
//   내부 번호(샷 id)는 싣지 않는다(채팅 답 규칙 — 사용자는 컷 순서 · 설명으로 부른다).
//   약속: tests/chat/editor-advice-chat.test.ts · tests/editor/title-clips.test.ts
import { isTitleClipShotId, selectOverlayLayout, selectTimelineLayout, type OverlayPlacements } from '@/stores/editor-store'
import type { AudioTrackClip, ClipTransitionType, Shot, VideoClip } from '@/types/shot'

export interface EditorChatContextInput {
  shots: Shot[]
  videoClips: VideoClip[]
  clipOrder: Record<string, string[]>
  audioClips: AudioTrackClip[]
  /** V1 밖 줄의 클립 자리 — 영상 위 제목 클립을 말한다(2단계 ⑥). */
  overlay?: OverlayPlacements
}

const secs = (value: number) => `${value.toFixed(1)}s`
/** 전환 종류를 가려 말한다 — 검정 · 흰색으로 물들이기와 교차 디졸브(2단계 ⑤). */
const TRANSITION_PHRASE: Record<ClipTransitionType, string> = {
  dissolve: 'fades through black',
  white: 'fades through white',
  cross: 'cross dissolves',
}
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
    // 제목 클립을 V1 로 옮겼으면 그 컷도 제목으로 말한다 — 영상 샷처럼("WS · …", "no video yet") 말하지 않는다(2단계 ⑥).
    const what = shot?.titleCard
      ? `Title card "${short(shot.titleCard.text)}"`
      : shot?.titleText
        ? `Title "${short(shot.titleText.text)}"`
        : `${shot?.shotType ?? 'Shot'} · "${short(shot?.actionDescription ?? '')}"`
    const extras = [
      clip && !shot?.titleCard && !shot?.titleText && (clip.status !== 'completed' || !clip.url) ? 'no video yet' : null,
      clip?.speed && clip.speed !== 1 ? `speed ${clip.speed}×` : null,
      clip?.transitionIn ? `${TRANSITION_PHRASE[clip.transitionIn.type] ?? TRANSITION_PHRASE.dissolve} from the cut before (${clip.transitionIn.durationSec}s)` : null,
      clip?.transitionOut ? `${TRANSITION_PHRASE[clip.transitionOut.type] ?? TRANSITION_PHRASE.dissolve} at its end (${clip.transitionOut.durationSec}s)` : null,
      shot?.subtitle?.text ? `subtitle "${short(shot.subtitle.text)}"` : null,
    ].filter(Boolean)
    lines.push(`${index + 1}. ${range} ${what}${extras.length ? ` · ${extras.join(' · ')}` : ''}`)
  })
  // 영상 위 제목 클립(2단계 ⑥) — 줄 · 글자 · 시작 → 끝.
  const titles = selectOverlayLayout(input).filter((item) => isTitleClipShotId(item.shotId))
  if (titles.length) {
    lines.push(
      `Titles over the video: ${titles
        .map((item) => {
          const text = input.shots.find((s) => s.shotId === item.shotId)?.titleText?.text ?? ''
          return `${item.trackId.toUpperCase()} title "${short(text)}" ${secs(item.startSec)}–${secs(item.startSec + item.durationSec)}`
        })
        .join('; ')}`,
    )
  }
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
