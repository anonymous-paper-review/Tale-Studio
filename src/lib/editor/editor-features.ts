// 지금 Editor 화면에서 사람이 실제로 할 수 있는 것(1단계, 2026-11-14 화면 코드에서 뽑음) — Lumi 조언 채팅이 없는 기능을 하라고 하지 않게
//   조언 프롬프트에 싣는다(리드 11/14 영어 재점검 B2: "open the transitions panel … fade-out", "right-click the leftover part and delete it").
//   Editor 에 기능을 더하거나 빼면(2단계 export 등) 이 목록만 고친다 — 조언 서버는 여기서만 읽는다. 약속: tests/chat/editor-advice-route.test.ts
import { DISSOLVE_CHOICES } from '@/lib/editor/transition'

const dissolveChoices = ['No dissolve', ...DISSOLVE_CHOICES.map((sec) => `${sec}s`)].join(', ')

/** 있는 기능 — 화면에 보이는 이름 그대로(영어 화면 기준). */
export const EDITOR_FEATURES: readonly string[] = [
  'Toolbar above the timeline: Select tool (V) · Cut tool (C) · Title card (inserts a black title card at the clip boundary nearest the playhead) · Previous / Next frame (← / →) · Play/pause (Space) · Undo (Ctrl+Z) / Redo (Ctrl+Y) · timeline zoom − / + · Watch all (plays the whole timeline from the start) · Shot ZIP · Draft Render.',
  `Right-click a video clip or a title-card clip on the timeline: Playback speed (0.25× to 4×) · Dissolve (dip to black) at the start of the clip (${dissolveChoices}) · Split here (at the playhead, or in the middle if the playhead is not on that clip) · Hide clip (takes it off the timeline and closes the gap). With several clips selected, speed, dissolve and hide apply to all of them.`,
  "Video clips with the mouse: drag a clip sideways to reorder it (the video track has no gaps) · drag a clip's left or right edge to trim it · click a clip with the Cut tool to split it. Delete or Backspace hides the selected video clips (or deletes the selected audio clips).",
  'Selecting: click a clip · Ctrl/⌘+click to add or remove one · Shift+click for a range · drag a box over empty track space.',
  "Playhead: drag on the ruler · click the preview's progress bar · ← / → moves one frame · Shift+← / → five frames · Ctrl/⌘+← / → jumps to the previous or next cut.",
  "Title cards: double-click the text on the preview to edit it · drag the text or the image to move it · click the card's length on the timeline to type a new length · right-click the card on the preview: Put an image / Replace image (upload from the computer, or pick a character, background or rough storyboard image), Remove image, Text in front / Image in front, Reset layout. A title card is always white text on black.",
  'Subtitles: one per clip, edited right on the preview — click it to type (a clip without one shows "Click to add a subtitle" while paused), drag it or use the arrow keys to move it, clear the text to remove it. It starts as the Writer dialogue for that shot.',
  "Audio: + Audio uploads a file and places it at the playhead · the Source panel's Audio tab keeps uploaded files (drag one onto a track; right-click → Delete removes it from the list) · audio clips: drag to move in time or to another track, drag the edges to trim, drag the volume line, click the speaker icon to mute; right-click → Volume (applies to draft), Mute / Unmute, Delete audio · right-click a track header → Mute entire track / Unmute track, Add audio track, Delete this track · + Track adds a track. Each shot's own sound is the audio clip under it on Audio 1.",
  'Source panel, Videos tab: click a card to preview it · drag a card that has a finished video onto the video track, or right-click → Preview / Add to timeline (adds it at the clip boundary nearest the playhead). This is also how a hidden clip comes back.',
  'Output: Draft Render records the edited timeline in real time into one video file (keep the tab open and visible; it takes as long as the film) · Shot ZIP downloads the original shot videos in timeline order, without any edits.',
  'Preview: the mute button and volume slider only change what you hear, not the render.',
]

/** 없는 기능 — 조언이 지어내기 쉬운 것(B2 에서 실제로 말한 것 포함). */
export const EDITOR_NOT_AVAILABLE: readonly string[] = [
  "a transitions panel, or any transition other than the dip-to-black dissolve at a clip's start (no cross-dissolve, no fade-out at the end, no audio fades)",
  "a delete item in a clip's right-click menu — after Split here, take off the piece you don't want with Hide clip or the Delete key",
  'colour grading, filters, crop, rotate, reverse, freeze frame or keyframes',
  'subtitle font, size, colour or timing; title card font, colour or image size',
  'gaps or overlaps between video clips, extra video tracks, copy/paste',
  'a separate volume for a video clip (change the audio clip under it on Audio 1 instead)',
  'a full-quality final render (Draft Render is the only export of the edited film)',
]

/** 조언 프롬프트에 붙이는 기능 목록 블록과 규칙. */
export function editorFeaturesPrompt(): string {
  return [
    '<editor_features>',
    'What the user can do in this Editor right now (the complete list):',
    ...EDITOR_FEATURES.map((line) => `- ${line}`),
    '',
    'Not in this Editor (never suggest these):',
    ...EDITOR_NOT_AVAILABLE.map((line) => `- ${line}`),
    '</editor_features>',
    '',
    "Only suggest controls listed in <editor_features>, named the way they appear there. If the user wants something that is not in the list, say plainly that this Editor doesn't have it, and offer the closest listed way if there is one.",
  ].join('\n')
}
