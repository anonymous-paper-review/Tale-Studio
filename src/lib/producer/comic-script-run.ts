// 만화 원고 → 대본 옮기기 한 번(서버 전용) — 채팅으로 올린 만화(produce/comic-script)와 시작 화면의 그대로 시작(produce/entry/start)이
//   같은 길로 옮긴다(2026-11-11 오너 결정 3 "채팅 길과 같은 것"). 답이 대본 해석기로 읽히지 않으면 한 번 다시 쓰게 한다.
//   notComic: 그림 모델이 만화 원고가 아니라고 답하면 옮기지 않는다(시작 화면만 — 사진 찍은 대본 · 메모는 읽은 글 그대로 쓴다).
import {
  buildComicScriptPrompt,
  checkComicScript,
  comicScriptRetryNote,
  extractComicScript,
  isNotComicReply,
  type ComicActionLanguage,
  type ComicScriptStats,
} from '@/lib/producer/comic-script'
import { transcribeComic } from '@/lib/producer/comic-script-llm'

export type ComicScriptRun =
  | { ok: true; script: string; stats: ComicScriptStats; attempts: number }
  | { ok: false; reason: 'not_comic' | 'empty' | 'not_script' | 'no_scenes' | 'model_error' }

export async function runComicScript(
  imageUrls: string[],
  opts: { pageCount: number; actionLanguage: ComicActionLanguage; notComic?: boolean },
): Promise<ComicScriptRun> {
  const prompt = buildComicScriptPrompt(opts)
  let lastReason: Exclude<ComicScriptRun, { ok: true }>['reason'] = 'not_script'
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await transcribeComic(imageUrls, attempt === 0 ? prompt : prompt + comicScriptRetryNote(lastReason as 'empty' | 'not_script' | 'no_scenes'))
      if (opts.notComic && isNotComicReply(out.text)) return { ok: false, reason: 'not_comic' }
      const script = extractComicScript(out.text)
      const check = checkComicScript(script)
      if (check.ok) return { ok: true, script, stats: check.stats, attempts: attempt + 1 }
      lastReason = check.reason
    } catch (error) {
      console.error('[comic-script] transcription failed:', error)
      lastReason = 'model_error'
    }
  }
  return { ok: false, reason: lastReason }
}
