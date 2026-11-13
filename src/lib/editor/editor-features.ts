// 지금 Editor 화면에서 사람이 실제로 할 수 있는 것(2단계, 2026-11-14 화면 코드에서 뽑음) — Lumi 조언 채팅이 없는 기능을 하라고 하지 않게
//   조언 프롬프트에 싣는다(리드 11/14 영어 재점검 B2: "open the transitions panel … fade-out", "right-click the leftover part and delete it").
//   단추 · 메뉴 이름은 화면과 같은 i18n 키로 콘텐츠 말에 맞춰 옮긴다 — 한국어 답이 한국어 화면 이름("클립 숨기기" 등)을 그대로 쓰게(리드 11/14).
//   2단계(새 배치 · 여러 줄 · 자유 배치 · 마커 · 모션 · 불투명도 · 전환 · 효과 · 제목 · 내보내기)를 합치며 "있는 것 · 없는 것"을 고쳤다(리드 11/14).
//   Editor 에 기능을 더하거나 빼면 이 목록만 고친다 — 조언 서버는 여기서만 읽는다. 약속: tests/chat/editor-advice-route.test.ts
import type { AppLocale } from '@/lib/locale'
import { translate } from '@/lib/i18n/translate'
import { TRANSITION_CHOICES } from '@/lib/editor/transition'

/** 있는 기능 — 단추 · 메뉴 이름은 화면 글 그대로 따옴표에 넣는다. */
export function editorFeatureLines(locale: AppLocale = 'en'): string[] {
  const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars)
  const q = (key: string, vars?: Record<string, string | number>) => `"${t(key, vars)}"`
  const lengths = TRANSITION_CHOICES.map((seconds) => q('{seconds}s', { seconds })).join(', ')
  const transitions = { cross: q('Cross dissolve'), dipBlack: q('Dip to black'), dipWhite: q('Dip to white') }
  const effects = { bw: q('Black & White'), blur: q('Gaussian blur'), bc: q('Brightness & Contrast') }
  return [
    t('Tools left of the timeline: {select}, {cut} (click a clip to split it there) and {type} (click a video track to add a 2-second title there; clicking V1 puts it on the nearest visible, unlocked track above). The keys are V, C and T.', {
      select: q('Select tool (V)'), cut: q('Cut tool (C)'), type: q('Type tool (T)'),
    }),
    t('Above the timeline: {snap} (while dragging, clips stick to clip edges, the playhead and markers), {marker} (M adds a marker at the playhead; right-click a marker for {deleteMarker}), {addVideo} and {addAudio} add a track, {zoomOut} and {zoomIn}.', {
      snap: q('Snap on'), marker: q('Add marker'), deleteMarker: q('Delete marker'), addVideo: `"+ ${t('V track')}"`, addAudio: `"+ ${t('A track')}"`,
      zoomOut: q('Zoom out timeline'), zoomIn: q('Zoom in timeline'),
    }),
    t('Tracks: video tracks V1, V2, V3 and more (a higher track covers the ones below unless its clip is made smaller, moved or see-through) and audio tracks A1, A2, A3 and more. Track header: {lock}, the eye on video tracks ({hide}), and M ({mute}) and S ({solo}) on audio tracks. Right-click a track header for {deleteTrack}.', {
      lock: q('Lock track'), hide: q('Hide track'), mute: q('Mute entire track'), solo: q('Play only this track'), deleteTrack: q('Delete this track'),
    }),
    t("Video clips with the mouse: drag a clip to move it in time or onto another video track (gaps between clips are allowed), drag a clip's left or right edge to trim it, and click a gap between clips for {ripple}, which closes it. Delete takes the selected clips off and leaves a gap; Shift+Delete takes them off and closes the gap. Ctrl+K splits at the playhead.", {
      ripple: q('Ripple delete'),
    }),
    t('Right-click a clip on a video track: {speed} (video clips, 0.25× to 4×), {start} and {end} ({cross}, {dipBlack} or {dipWhite}, {lengths} long, or {none}), {split} (at the playhead, or in the middle if the playhead is not on that clip), {hide} (takes the clip off the timeline and leaves a gap) and {ripple} (takes it off and closes the gap). With several clips selected, {speed}, {start}, {end}, {hide} and {ripple} apply to all of them (a transition length changes only the clips that have that transition), and {split} splits only the clip you right-clicked.', {
      speed: q('Playback speed'), start: q('Start transition'), end: q('End transition'), ...transitions, lengths, none: q('None'), split: q('Split here'), hide: q('Hide clip'),
      ripple: q('Ripple delete'),
    }),
    t('The {effects} tab next to {project}: drag a video transition ({cross}, {dipBlack}, {dipWhite}) onto the front half of a clip to put it at the start or the back half to put it at the end, drag {fade} onto the front or back half of an audio clip for a fade in or fade out, and drag a video effect ({bw}, {blur}, {bc}) onto a video clip.', {
      effects: q('Effects'), project: q('Project'), ...transitions, fade: q('Constant power'), ...effects,
    }),
    t("Select a clip and open {controls}: {motion} ({posX}, {posY}, {scale}) and {opacity}, one value for the whole clip; the clip's video effects ({bw} on or off, {blurName} 0 to 100%, {brightness} and {contrast} from -100% to +100%, {remove} takes one off); the start and end transitions and their length; {speed}; and for an audio clip its {volume} and fades. Double-click a value's % to reset it.", {
      controls: q('Effect controls'), motion: q('Motion'), posX: q('Position X'), posY: q('Position Y'), scale: q('Scale'), opacity: q('Opacity'), bw: effects.bw,
      blurName: q('Blur'), brightness: q('Brightness'), contrast: q('Contrast'), remove: q('Remove effect'), speed: q('Speed'), volume: q('Volume'),
    }),
    t("Titles (added with {type}): white bold text over the video. In {controls}: {text}, {size} (10 to 100) and {position} ({upper}, {center}, {lower} or {band}), plus motion, opacity and transitions. Drag a title's edges to change its length.", {
      type: q('Type tool (T)'), controls: q('Effect controls'), text: q('Text'), size: q('Size'), position: q('Position'),
      upper: q('Upper'), center: q('Center'), lower: q('Lower'), band: q('Background band'),
    }),
    t("Title cards: {newItem} → {titleCard} inserts a black title card at the clip boundary nearest the playhead. Double-click the text on the monitor to edit it, drag the text or the image to move it, and click the card's length on the timeline to type a new length. Right-click the card on the monitor: {put} or {replace} ({upload}, or pick an image from {characters}, {backgrounds} or {rough}), {remove}, {textFront} or {imageFront}, {reset}. A title card is always white text on black.", {
      newItem: q('New item'), titleCard: q('Title card'), put: q('Put an image'), replace: q('Replace image'), upload: q('Upload from my computer'), characters: q('Characters'),
      backgrounds: q('Backgrounds'), rough: q('Rough storyboard'), remove: q('Remove image'), textFront: q('Text in front'), imageFront: q('Image in front'), reset: q('Reset layout'),
    }),
    t('Subtitles: one per clip, edited right on the preview. Click it to type (a clip without one shows {hint} while paused), drag it or use the arrow keys to move it, and clear the text to remove it. It starts as the Writer dialogue for that shot.', {
      hint: q('Click to add a subtitle'),
    }),
    t('Selecting: click a clip, Ctrl/⌘+click to add or remove one, Shift+click for a range, or drag a box over empty track space.'),
    t("Playhead: drag on the ruler, click the monitor's progress bar, ← or → moves one frame, Shift+← or → five frames, Ctrl/⌘+← or → jumps to the previous or next edit point. Monitor buttons: {start}, {prev}, a frame back, {play}, a frame forward, {next}, {end}.", {
      start: q('Go to start'), prev: q('Previous edit point (Ctrl+←)'), play: q('Play/pause (Space)'), next: q('Next edit point (Ctrl+→)'), end: q('Go to end'),
    }),
    t('The {project} tab: {shots} lists the Director shots. Click one to see it in the {source} tab, drag a shot that has a video onto a video track, or right-click it for {preview} or {add} (adds it at the clip boundary nearest the playhead). This is also how a hidden clip comes back, but split pieces, title cards and titles are not in the list and come back only with {undo} (Ctrl+Z), and a shot added again comes in at its full length (trim and speed start over).', {
      project: q('Project'), shots: `"${t('Director shots · {count}', { count: 'N' })}"`, source: q('Source'), preview: q('Preview'), add: q('Add to timeline'), undo: q('Undo'),
    }),
    t("Audio: {import} uploads audio files into {myFiles} in the {project} tab (dropping files there works too); drag one onto an audio track, or right-click it and choose {delete} to remove it from the list. Audio clips: drag to move in time or to another audio track, drag the edges to trim, drag the volume line, and click the speaker icon to mute. Right-click an audio clip: {volume}, {mute} or {unmute}, {deleteAudio}. Each shot's own sound is the audio clip under it, and it moves with the video until you drag it away.", {
      import: q('Import…'), myFiles: `"${t('My files · {count}', { count: 'N' })}"`, project: q('Project'), delete: q('Delete'), volume: q('Volume (applies to draft)'),
      mute: q('Mute'), unmute: q('Unmute'), deleteAudio: q('Delete audio'),
    }),
    t('Output, in the {exportTab} tab: {draftRender} records the timeline in real time into one video file with everything the monitor shows (all tracks, motion, opacity, transitions, effects, titles, subtitles and audio fades; keep the tab open and visible, it takes as long as the film). {shotZip} downloads the original shot videos in timeline order, without any edits.', {
      exportTab: q('Export'), draftRender: q('Draft Render'), shotZip: q('Shot ZIP'),
    }),
    t('{undo} and {redo} at the top right undo and redo edits (Ctrl+Z, Ctrl+Y). {shortcuts} lists every key.', {
      undo: q('Undo'), redo: q('Redo (Ctrl+Y)'), shortcuts: q('Shortcuts'),
    }),
    t('Preview: the mute button and volume slider only change what you hear, not the render.'),
  ]
}

/** 없는 기능 — 조언이 지어내기 쉬운 것(B2 에서 실제로 말한 것 포함). */
export function editorMissingLines(locale: AppLocale = 'en'): string[] {
  const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars)
  const q = (key: string) => `"${t(key)}"`
  return [
    t('Transitions other than {cross}, {dipBlack}, {dipWhite} and the {fade} audio fade: no wipes, slides, zooms or other transition types.', {
      cross: q('Cross dissolve'), dipBlack: q('Dip to black'), dipWhite: q('Dip to white'), fade: q('Constant power'),
    }),
    t("Deleting: a delete item in a clip's right-click menu on the video track. After {split}, take off the piece you don't want with {hide} (leaves a gap), {ripple} (closes it) or the Delete key.", {
      split: q('Split here'), hide: q('Hide clip'), ripple: q('Ripple delete'),
    }),
    t('Picture changes: colour grading beyond {bc}, crop, rotate, reverse, freeze frame, and keyframes (motion, opacity and effects keep one value for the whole clip).', {
      bc: q('Brightness & Contrast'),
    }),
    t('Text styling: title font or colour, subtitle font, size, colour or timing, and title card font, colour or image size.'),
    t('Timeline: overlapping clips on the same track, copy and paste, and more than one sequence.'),
    t('Clip volume: a separate volume for a video clip. Change the audio clip under it instead.'),
    t('Importing pictures or video files: {import} takes audio files only.', { import: q('Import…') }),
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
