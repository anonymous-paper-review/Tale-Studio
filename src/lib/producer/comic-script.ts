// 만화 원고 → 대본(2026-10-09 오너 "그대로 영상화") — 쪽 · 칸 순서대로 읽어 대사를 말풍선 글자 그대로 옮긴 대본을
//   쓰게 하는 지시문과, 답이 대본으로 읽히는지 확인하는 순수 함수. 옮긴 대본은 대본 그대로 쓰기(#script-preserve)로
//   Writer 에 간다 — 그래서 대본 해석기(parseScript)가 읽는 형식(S# 장면 머리 · "이름: 대사" · 효과음 · 자막 · 화면 문자)으로 쓰게 한다.
//   모델 호출은 여기 없다(comic-script-llm.ts). 약속: tests/producer/comic-script.test.ts
import { parseScript } from '@/lib/writer/script/parse'

export interface ComicScriptStats {
  scenes: number
  dialogue_lines: number
  action_blocks: number
  characters: number
}

export type ComicScriptCheck =
  | { ok: true; stats: ComicScriptStats }
  | { ok: false; reason: 'empty' | 'not_script' | 'no_scenes' }

/** 지문을 쓸 말 — 대사 · 글자는 언제나 원문 그대로다. */
export type ComicActionLanguage = 'ko' | 'en' | 'ja'

const ACTION_LANGUAGE_NAME: Record<ComicActionLanguage, string> = {
  ko: '한국어', // i18n-ok: 모델 지시문의 언어 이름
  en: '영어', // i18n-ok: 모델 지시문의 언어 이름
  ja: '일본어', // i18n-ok: 모델 지시문의 언어 이름
}

/** 만화 쪽들을 대본으로 옮기라는 지시문(모델용 · 사용자에게 보이지 않는다). 첨부 순서 = 쪽 순서. */
export function buildComicScriptPrompt({ pageCount, actionLanguage = 'ko' }: { pageCount: number; actionLanguage?: ComicActionLanguage }): string {
  const lang = ACTION_LANGUAGE_NAME[actionLanguage] ?? ACTION_LANGUAGE_NAME.ko
  return [
    '# 작업: 만화 원고를 대본으로 옮기기', // i18n-ok: 모델 지시문
    '',
    `첨부한 그림 ${pageCount}장은 한 만화 원고의 쪽들이다. 첨부 순서가 곧 쪽 순서다. 한 쪽 안에서는 칸을 읽는 순서(보통 위에서 아래로, 같은 줄이면 왼쪽에서 오른쪽, 세로 웹툰이면 위에서 아래)대로 읽는다.`, // i18n-ok: 모델 지시문
    '이 만화를 영상으로 그대로 옮길 대본을 쓴다. 각색하지 않는다.', // i18n-ok: 모델 지시문
    '',
    '규칙', // i18n-ok: 모델 지시문
    '1. 말풍선 · 내레이션 상자 · 효과음 · 그림 속 글자는 한 글자도 바꾸지 않고 그대로 옮긴다(띄어쓰기 · 문장부호 · 말줄임표 포함). 읽을 수 없는 글자는 [판독 불가]로 쓴다.', // i18n-ok: 모델 지시문
    '2. 칸을 빠뜨리거나 합치지 않는다. 칸마다 그 칸에 그려진 것(누가 · 어디서 · 무엇을 하는지, 표정, 화면 크기)을 지문 한 단락으로 먼저 쓰고, 이어서 그 칸의 대사와 글자를 쓴다. 칸과 칸 사이는 빈 줄 하나.', // i18n-ok: 모델 지시문
    '3. 장소나 때가 바뀌면 새 장면 머리를 쓴다: `S#번호. 장소 - 때` (첫 칸 앞에도 하나).', // i18n-ok: 모델 지시문(대본 해석기가 읽는 표기)
    '4. 대사는 `이름: 대사` 한 줄. 이름을 알 수 없으면 생김새로 짧게 부르고(예: 남자, 소녀) 끝까지 같은 이름을 쓴다. 대사에서 이름이 나오면 그 이름을 쓴다. 속마음 · 혼잣말은 `이름 (V.O.): 대사`.', // i18n-ok: 모델 지시문
    '5. 효과음은 `효과음: 글자`, 내레이션 상자는 `자막: 글자`, 그림 속 화면 글자(간판 · 휴대폰 알림 · 화면 안내 등)는 `화면 문자: 글자`.', // i18n-ok: 모델 지시문
    '6. 만화 제목이 그림에 있으면 맨 위에 `제목: 제목` 한 줄. 쪽 번호 · 작가 이름 · 저작권 표시는 옮기지 않는다.', // i18n-ok: 모델 지시문
    `7. 그림에 없는 사건 · 대사 · 설명을 지어내지 않는다. 지문은 보이는 것만 짧게, ${lang}로 쓴다.`, // i18n-ok: 모델 지시문
    '8. 답은 ```script 코드블록 하나에 대본만 쓴다. 다른 말은 쓰지 않는다.', // i18n-ok: 모델 지시문
  ].join('\n')
}

const RETRY_WHY: Record<Exclude<ComicScriptCheck, { ok: true }>['reason'], string> = {
  no_scenes: '장면 머리(S#번호. 장소 - 때)가 없었다', // i18n-ok: 모델 지시문
  empty: '답이 비어 있었다', // i18n-ok: 모델 지시문
  not_script: '대본 형식으로 읽히지 않았다', // i18n-ok: 모델 지시문
}

/** 다시 시도할 때 덧붙이는 말 — 앞 답이 대본으로 읽히지 않았다. */
export function comicScriptRetryNote(reason: Exclude<ComicScriptCheck, { ok: true }>['reason']): string {
  return `\n\n앞의 답은 ${RETRY_WHY[reason] ?? RETRY_WHY.not_script}. 위 규칙 3 · 4 · 8을 지켜 \`\`\`script 코드블록 하나로 다시 쓴다.` // i18n-ok: 모델 지시문
}

/** 답에서 대본을 꺼낸다 — ```script 블록이 있으면 그 안, 없으면 답 전체. */
export function extractComicScript(text: string): string {
  const fenced = /```(?:script|text|txt|plaintext)?[^\S\n]*\n([\s\S]*?)\n```/.exec(text ?? '')
  return (fenced ? fenced[1] : (text ?? '')).trim()
}

/** 대본 해석기가 장면을 읽어 내는지 — 대본 그대로 쓰기가 같은 해석기를 쓴다. */
export function checkComicScript(script: string): ComicScriptCheck {
  if (!script.trim()) return { ok: false, reason: 'empty' }
  // 옮긴 대본은 대본이라고 정한 글이다 — 판별 기준(장면 머리 · 대사 수)에 못 미치는 짧은 만화도 대본 그대로 쓰기와 같은 방식으로 읽는다.
  const doc = parseScript(script, { assumeScript: true })
  if (!doc) return { ok: false, reason: 'not_script' }
  if (doc.scenes.length === 0) return { ok: false, reason: 'no_scenes' }
  return {
    ok: true,
    stats: {
      scenes: doc.scenes.length,
      dialogue_lines: doc.stats.dialogue_lines,
      action_blocks: doc.stats.action_blocks,
      characters: doc.characters.length,
    },
  }
}
