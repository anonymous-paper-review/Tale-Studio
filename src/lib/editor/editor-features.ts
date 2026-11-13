// 지금 Editor 화면에서 사람이 실제로 할 수 있는 것(1단계, 2026-11-14 화면 코드에서 뽑음) — Lumi 조언 채팅이 없는 기능을 하라고 하지 않게
//   조언 프롬프트에 싣는다(리드 11/14 영어 재점검 B2: "open the transitions panel … fade-out", "right-click the leftover part and delete it").
//   단추 · 메뉴 이름은 화면과 같은 i18n 키로 콘텐츠 말에 맞춰 옮긴다 — 한국어 답이 한국어 화면 이름("클립 숨기기" 등)을 그대로 쓰게(리드 11/14).
//   Editor 에 기능을 더하거나 빼면(2단계 export 등) 이 목록만 고친다 — 조언 서버는 여기서만 읽는다. 약속: tests/chat/editor-advice-route.test.ts
import type { AppLocale } from '@/lib/locale'
import { translate } from '@/lib/i18n/translate'
import { DISSOLVE_CHOICES } from '@/lib/editor/transition'

/** 있는 기능 — 단추 · 메뉴 이름은 화면 글 그대로 따옴표에 넣는다. */
export function editorFeatureLines(locale: AppLocale = 'en'): string[] {
  const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars)
  const q = (key: string, vars?: Record<string, string | number>) => `"${t(key, vars)}"`
  const choices = [q('No dissolve'), ...DISSOLVE_CHOICES.map((seconds) => q('{seconds}s dissolve', { seconds }))].join(', ')
  return [
    t('Toolbar above the timeline: {select}, {cut}, {titleCard} (inserts a black title card at the clip boundary nearest the playhead), previous and next frame (← and →), {play}, {undo} and {redo}, {zoomOut} and {zoomIn}, {watchAll} (plays the whole timeline from the start), {shotZip} and {draftRender}.', {
      select: q('Select tool (V)'), cut: q('Cut tool (C)'), titleCard: q('Title card'), play: q('Play/pause (Space)'), undo: q('Undo (Ctrl+Z)'), redo: q('Redo (Ctrl+Y)'),
      zoomOut: q('Zoom out timeline'), zoomIn: q('Zoom in timeline'), watchAll: q('Watch all'), shotZip: q('Shot ZIP'), draftRender: q('Draft Render'),
    }),
    t('Right-click a video clip or a title card clip on the timeline: {speed} (0.25× to 4×), {dissolve} at the start of the clip ({choices}), {split} (at the playhead, or in the middle if the playhead is not on that clip), {hide} (takes the clip off the timeline and closes the gap). With several clips selected, speed, dissolve and hide apply to all of them.', {
      speed: q('Playback speed'), dissolve: q('Dissolve (dip to black)'), choices, split: q('Split here'), hide: q('Hide clip'),
    }),
    t("Video clips with the mouse: drag a clip sideways to reorder it (the video track has no gaps), drag a clip's left or right edge to trim it, and click a clip with {cut} to split it. Delete or Backspace hides the selected video clips, or deletes the selected audio clips.", {
      cut: q('Cut tool (C)'),
    }),
    t('Selecting: click a clip, Ctrl/⌘+click to add or remove one, Shift+click for a range, or drag a box over empty track space.'),
    t("Playhead: drag on the ruler, click the preview's progress bar, ← or → moves one frame, Shift+← or → moves five frames, Ctrl/⌘+← or → jumps to the previous or next cut."),
    t("Title cards: double-click the text on the preview to edit it, drag the text or the image to move it, and click the card's length on the timeline to type a new length. Right-click the card on the preview: {put} or {replace} ({upload}, or pick an image from {characters}, {backgrounds} or {rough}), {remove}, {textFront} or {imageFront}, {reset}. A title card is always white text on black.", {
      put: q('Put an image'), replace: q('Replace image'), upload: q('Upload from my computer'), characters: q('Characters'), backgrounds: q('Backgrounds'), rough: q('Rough storyboard'),
      remove: q('Remove image'), textFront: q('Text in front'), imageFront: q('Image in front'), reset: q('Reset layout'),
    }),
    t('Subtitles: one per clip, edited right on the preview. Click it to type (a clip without one shows {hint} while paused), drag it or use the arrow keys to move it, and clear the text to remove it. It starts as the Writer dialogue for that shot.', {
      hint: q('Click to add a subtitle'),
    }),
    t("Audio: {plusAudio} uploads a file and places it at the playhead. The {audioTab} tab of the {source} panel keeps uploaded files: drag one onto a track, or right-click it and choose {delete} to remove it from the list. Audio clips: drag to move in time or to another track, drag the edges to trim, drag the volume line, and click the speaker icon to mute. Right-click an audio clip: {volume}, {mute} or {unmute}, {deleteAudio}. Right-click a track header: {muteTrack} or {unmuteTrack}, {addTrack}, {deleteTrack}. {plusTrack} adds a track. Each shot's own sound is the audio clip under it on the first audio track.", {
      plusAudio: `"+ ${t('Audio')}"`, audioTab: q('Audio'), source: q('Source'), delete: q('Delete'), volume: q('Volume (applies to draft)'), mute: q('Mute'), unmute: q('Unmute'),
      deleteAudio: q('Delete audio'), muteTrack: q('Mute entire track'), unmuteTrack: q('Unmute track'), addTrack: q('Add audio track'), deleteTrack: q('Delete this track'),
      plusTrack: `"+ ${t('Track')}"`,
    }),
    t('The {videoTab} tab of the {source} panel: click a card to preview it, drag a card that has a finished video onto the video track, or right-click it and choose {preview} or {add} (adds it at the clip boundary nearest the playhead). This is also how a hidden clip comes back, but split pieces and title cards are not in the {source} panel and come back only with {undo}, and a shot added again from the {source} panel comes in at its full length (trim and speed start over).', {
      videoTab: q('Video'), source: q('Source'), preview: q('Preview'), add: q('Add to timeline'), undo: q('Undo (Ctrl+Z)'),
    }),
    t('Output: {draftRender} records the edited timeline in real time into one video file (keep the tab open and visible; it takes as long as the film). {shotZip} downloads the original shot videos in timeline order, without any edits.', {
      draftRender: q('Draft Render'), shotZip: q('Shot ZIP'),
    }),
    t('Preview: the mute button and volume slider only change what you hear, not the render.'),
  ]
}

/** 없는 기능 — 조언이 지어내기 쉬운 것(B2 에서 실제로 말한 것 포함). */
export function editorMissingLines(locale: AppLocale = 'en'): string[] {
  const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars)
  const q = (key: string) => `"${t(key)}"`
  return [
    t('Transitions: a transitions panel, or any transition other than {dissolve} at the start of a clip. There is no cross-dissolve, no fade-out at the end and no audio fade.', { dissolve: q('Dissolve (dip to black)') }),
    t("Deleting: a delete item in a clip's right-click menu on the video track. After {split}, take off the piece you don't want with {hide} or the Delete key.", { split: q('Split here'), hide: q('Hide clip') }),
    t('Picture changes: colour grading, filters, crop, rotate, reverse, freeze frame or keyframes.'),
    t('Text styling: subtitle font, size, colour or timing, and title card font, colour or image size.'),
    t('Timeline layout: gaps or overlaps between video clips, extra video tracks, copy and paste.'),
    t('Clip volume: a separate volume for a video clip. Change the audio clip under it on the first audio track instead.'),
    t('Final export: a full quality final render. {draftRender} is the only export of the edited film.', { draftRender: q('Draft Render') }),
  ]
}

/** 영어 목록(시험 · 다른 곳이 줄 단위로 볼 때). */
export const EDITOR_FEATURES: readonly string[] = editorFeatureLines('en')
export const EDITOR_NOT_AVAILABLE: readonly string[] = editorMissingLines('en')

/** 조언 프롬프트에 붙이는 기능 목록 블록과 규칙 — 목록 줄은 콘텐츠 말(locale)로. */
export function editorFeaturesPrompt(locale: AppLocale = 'en'): string {
  return [
    '<editor_features>',
    'What the user can do in this Editor right now (the complete list):',
    ...editorFeatureLines(locale).map((line) => `- ${line}`),
    '',
    'Not in this Editor (never suggest these):',
    ...editorMissingLines(locale).map((line) => `- ${line}`),
    '</editor_features>',
    '',
    "Only suggest controls listed in <editor_features>, named the way they appear there. If the user wants something that is not in the list, say plainly that this Editor doesn't have it, and offer the closest listed way if there is one.",
  ].join('\n')
}
