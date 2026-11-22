// 그림 판에 남기는 사람 말(오너 2026-11-22 결정 4 "요약에 사람이 쓴 말 남기기" · 리드 답 e) — [이미지 고치기]의 바꿀 점(button) ·
//   채팅(Lumi)에 부탁한 말(chat). 새 표 없이 shots.storyboard_image.versions[] 의 note · via 칸에 적고 LLM 은 부르지 않는다.
//   화면(요청 본문 note · via) → 서버(작업 target.imageNote) → 완료(finalize 가 판에 옮김)가 같이 쓰는 순수 규칙.
//   약속: tests/camera/note.test.ts · note-server.test.ts
import type { StoryboardImageVersion } from '@/types/director'

export type ImageNoteVia = 'button' | 'chat'
export type ImageNote = { note: string; via: ImageNoteVia }

/** 남기는 사람 말의 최대 글자 수 — 넘으면 앞에서부터 이만큼만 남긴다. */
export const IMAGE_NOTE_MAX = 500

const VIA: readonly ImageNoteVia[] = ['button', 'chat']

/** 화면: 이번 그리기에 붙일 사람 말 — 바꿀 점이 있으면 단추로 한 말, 없고 채팅에서 부탁했으면 채팅으로 한 말, 둘 다 없으면 null. */
export function imageNoteFor(options: { changeNote?: string; askedInChat?: string } | undefined): ImageNote | null {
  const change = options?.changeNote?.trim() ?? ''
  if (change) return { note: change, via: 'button' }
  const asked = options?.askedInChat?.trim() ?? ''
  return asked ? { note: asked, via: 'chat' } : null
}

/** 서버: 요청 본문의 note · via — 글이 아니거나 비었거나 어디서 왔는지 모르면 null(그림은 그대로 만든다), 길면 IMAGE_NOTE_MAX 자까지. */
export function readImageNote(note: unknown, via: unknown): ImageNote | null {
  if (typeof note !== 'string' || !VIA.includes(via as ImageNoteVia)) return null
  const text = note.trim()
  if (!text) return null
  return { note: Array.from(text).slice(0, IMAGE_NOTE_MAX).join(''), via: via as ImageNoteVia }
}

/** 완료: 작업 기록의 사람 말을 그림 판 칸(note · via)으로 — 말이 없던 작업이면 빈 객체. */
export function versionNoteFields(note: ImageNote | null | undefined): Pick<StoryboardImageVersion, 'note' | 'via'> {
  return note ? { note: note.note, via: note.via } : {}
}
